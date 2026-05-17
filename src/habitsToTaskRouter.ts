import express from 'express'
import axios from 'axios'
import type { Response } from 'express'
import type { ZodError, ZodIssue, ZodType } from 'zod'
import { UNASSIGNED_PARENT_ID, MarvinEndpoint } from '../lib/constants'
import { getDateFormatted, getMarvinTimezoneOffset } from '../lib/utils'
import logger from '../lib/logger'
import {
  createTaskPayloadSchema,
  goalListResponseSchema,
  habitListResponseSchema,
  habitTaskActionSchema,
  recordHabitPayloadSchema,
  recordHabitWebhookSchema,
  taskWebhookSchema,
  updateDocPayloadSchema,
  type NotePatternSource,
  type RecordHabitPayload,
  type RecordHabitWebhook,
  type TaskWebhook
} from '../lib/marvinSchemas'

const router = express.Router()
const CSV_REGEX = /\s*,\s*/

// Need this as \n\n\\\ is padded for each empty line on note 
const MARVIN_WHITESPACE_REGEX = /[\n\\]+$/g

router.post('/habit-as-task', async (req, res) => {
  try {
    const action = habitTaskActionSchema.safeParse(req.query.type)
    if (!action.success) {
      return sendValidationError(res, 400, 'Invalid habit-as-task type', action.error)
    }

    switch (action.data) {
      case 'record-habit': {
        const body = recordHabitWebhookSchema.safeParse(req.body)
        if (!body.success) return sendValidationError(res, 400, 'Invalid record habit webhook body', body.error)
        await addTaskOnHabitCompletion(body.data, res)
        break
      }
      case 'mark-done': {
        const body = taskWebhookSchema.safeParse(req.body)
        if (!body.success) return sendValidationError(res, 400, 'Invalid mark done webhook body', body.error)
        await markHabitOnTaskCompletion(body.data, res)
        break
      }
      case 'add-task': {
        const body = taskWebhookSchema.safeParse(req.body)
        if (!body.success) return sendValidationError(res, 400, 'Invalid add task webhook body', body.error)
        await assignGoalToTask(body.data, res)
        break
      }
    }
  } catch (error) { 
    if (error instanceof BoundaryValidationError) {
      logger.error(error.message, { issues: error.issues })
      return res.status(error.status).json({ error: error.message, issues: error.issues })
    }

    logger.error('Unhandled habit-as-task error', { error })
    res.status(500).send('An error occurred')
  }
})

async function addTaskOnHabitCompletion(recordedHabitInfo: RecordHabitWebhook, res: Response) {
  const { parentId, timeEstimate, title, record } = recordedHabitInfo
  if (parentId === UNASSIGNED_PARENT_ID) {
    return res.status(200).json({ message: `Skipping creating a task for habit with name: ${title}` })
  }

  // Convert Unix timestamp to YYYY-MM-DD format
  const recordedDate = getDateFormatted(record.time)
  const timeZoneOffset = getMarvinTimezoneOffset()

  const createTaskData = parseOutboundPayload(createTaskPayloadSchema, {
    done: true,
    day: recordedDate,
    timeEstimate,
    title,
    parentId,
    timeZoneOffset
  }, 'Create task payload')

  await axios.post(MarvinEndpoint.ADD_TASK, createTaskData)

  logger.info(`Successfully added done task for habit with name: ${title}`)
  res.status(200).json({ message: `Successfully added done task for habit with name: ${title}` })
}

async function markHabitOnTaskCompletion(completedTaskInfo: TaskWebhook, res: Response) {
  const { title } = completedTaskInfo

  // List all the habits
  const { data } = await axios.get(MarvinEndpoint.LIST_HABITS_FULL)
  const habitInfos = parseMarvinApiResponse(habitListResponseSchema, data, 'Marvin habits response')

  // Build a mapping of habit IDs and to which words to map to
  const habitIdToPatternMatchingMap = buildHabitToPatternsMapping(habitInfos)

  // TO-DO: Refactor this using a filter
  // Go through each pattern, check if any of the titles match
  const habitIdsToMarkComplete = []
  for (const [habitId, patterns] of Object.entries(habitIdToPatternMatchingMap)) {
    if (patterns.some(pattern => title.toLowerCase().includes(pattern))) habitIdsToMarkComplete.push(habitId)
  }

  // No tasks to mark complete
  if (habitIdsToMarkComplete.length === 0) {
    logger.info(`No related habits to mark done for task: ${title}`)
    return res.status(200).json({ message: `No related habits to mark done for task: ${title}` })
  }

  // Otherwise, go through and mark all the matched habits as complete
  await Promise.all(habitIdsToMarkComplete.map(habitId => {
    return axios.post(MarvinEndpoint.UPDATE_HABIT, getRecordHabitData(habitId))
  }))

  logger.info(`Successfully marked habits with IDs ${habitIdsToMarkComplete.join(', ')} complete for: ${title}`)
  res.status(200).json({ message: `Successfully added done task for habit with name: ${title}` })
}

async function assignGoalToTask(completedTaskInfo: TaskWebhook, res: Response) {
  const { title, _id: taskId } = completedTaskInfo

  // List all the goals
  const { data } = await axios.get(MarvinEndpoint.LIST_GOALS)
  const goalInfos = parseMarvinApiResponse(goalListResponseSchema, data, 'Marvin goals response')

  // Build a mapping of goal IDs and to which words to map to
  const goalIdToPatternsMapping = buildHabitToPatternsMapping(goalInfos)

  // Goal ID to attach
  let goalIdToAttach = null
  for (const [goalId, patterns] of Object.entries(goalIdToPatternsMapping)) {
    if (patterns.some(pattern => title.toLowerCase().includes(pattern))) {
      goalIdToAttach = goalId
    }
  }

  // No goal to attach to, skipping
  if (goalIdToAttach === null) {
    logger.info(`No related goals to mark done for task: ${title}`)
    return res.status(200).json({ message: `No related goals to mark done for task: ${title}` })
  }

  // Update task with goal
  const now = Date.now()
  const updateTaskData = parseOutboundPayload(updateDocPayloadSchema, {
    itemId: taskId,
    setters: [
      { key: `g_in_${goalIdToAttach}`, val: true },
      { key: `fieldUpdates.g_in_${goalIdToAttach}`, val: now },
      { key: 'updatedAt', val: now },
    ]
  }, 'Update doc payload')

  // Update the task with the goal ID
  await axios.post(MarvinEndpoint.UPDATE_DOC, updateTaskData)

  logger.info(`Assigned goal ${goalIdToAttach} to task with name: ${title}`)
  res.status(200).json({ message: `Assigned goal ${goalIdToAttach} to habit with name: ${title}` })
}

function buildHabitToPatternsMapping(habitInfos: NotePatternSource[]): Record<string, string[]> {
  const habitToPatternsMapping: Record<string, string[]> = {}
  for (const { _id, note } of habitInfos) {
    if (note == null || note.length === 0) continue

    const patterns = note.split(CSV_REGEX).map(s => s.toLowerCase().replace(MARVIN_WHITESPACE_REGEX, ''))
    habitToPatternsMapping[_id] = patterns
  }
  return habitToPatternsMapping
}

function getRecordHabitData(habitId: string): RecordHabitPayload {
  return parseOutboundPayload(recordHabitPayloadSchema, {
    habitId,
    time: Date.now(),
    value: 1,
    updateDB: true,
  }, 'Record habit payload')
}

type ValidationIssue = {
  path: string
  message: string
}

class BoundaryValidationError extends Error {
  constructor (
    message: string,
    readonly status: number,
    readonly issues: ValidationIssue[]
  ) {
    super(message)
  }
}

function sendValidationError (res: Response, status: number, message: string, error: ZodError) {
  const issues = formatZodIssues(error.issues)
  logger.warn(message, { issues })
  return res.status(status).json({ error: message, issues })
}

function parseMarvinApiResponse<T> (schema: ZodType<T>, data: unknown, message: string): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new BoundaryValidationError(message, 502, formatZodIssues(result.error.issues))
  }

  return result.data
}

function parseOutboundPayload<T> (schema: ZodType<T>, data: unknown, message: string): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new BoundaryValidationError(message, 500, formatZodIssues(result.error.issues))
  }

  return result.data
}

function formatZodIssues (issues: ZodIssue[]): ValidationIssue[] {
  return issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message
  }))
}

export default router
export {
  addTaskOnHabitCompletion,
  assignGoalToTask,
  buildHabitToPatternsMapping,
  getRecordHabitData,
  markHabitOnTaskCompletion
}
