import express from 'express'
import axios from 'axios'
import type { Response } from 'express'
import {
  MARVIN_NOTE_TRAILING_PADDING_REGEX,
  NOTE_KEYWORD_SEPARATOR_REGEX,
  UNASSIGNED_PARENT_ID,
  MarvinEndpoint
} from '../lib/constants'
import { getDateFormatted, getMarvinTimezoneOffset } from '../lib/utils'
import logger from '../lib/logger'
import type {
  CreateTaskPayload,
  NoteKeywordSource,
  RecordHabitPayload,
  RecordHabitWebhook,
  TaskWebhook,
  UpdateDocPayload
} from '../lib/marvinTypes'

const router = express.Router()

router.post('/habit-as-task', async (req, res) => {
  try {
    switch (req.query.type) {
      case 'record-habit':
        await addTaskOnHabitCompletion(req.body as RecordHabitWebhook, res)
        break
      case 'mark-done':
        await markHabitOnTaskCompletion(req.body as TaskWebhook, res)
        break
      case 'add-task':
        await assignGoalToTask(req.body as TaskWebhook, res)
        break
      default:
        logger.warn('Invalid habit-as-task type')
        return res.status(400).json({ error: 'Invalid habit-as-task type' })
    }
  } catch (error) { 
    logger.error('Unhandled habit-as-task error', { error })
    res.status(500).send('An error occurred')
  }
})

async function addTaskOnHabitCompletion(recordedHabitInfo: RecordHabitWebhook, res: Response): Promise<Response> {
  const { parentId, timeEstimate, title, record } = recordedHabitInfo
  if (parentId === UNASSIGNED_PARENT_ID) {
    return res.status(200).json({ message: `Skipping creating a task for habit with name: ${title}` })
  }

  // Convert Unix timestamp to YYYY-MM-DD format
  const recordedDate = getDateFormatted(record.time)
  const timeZoneOffset = getMarvinTimezoneOffset()

  const createTaskData: CreateTaskPayload = {
    done: true,
    day: recordedDate,
    timeEstimate,
    title,
    parentId,
    timeZoneOffset
  }

  await axios.post(MarvinEndpoint.ADD_TASK, createTaskData)

  logger.info(`Successfully added done task for habit with name: ${title}`)
  return res.status(200).json({ message: `Successfully added done task for habit with name: ${title}` })
}

async function markHabitOnTaskCompletion(completedTaskInfo: TaskWebhook, res: Response): Promise<Response> {
  const { title } = completedTaskInfo

  // List all the habits
  const { data: habitInfos } = await axios.get<NoteKeywordSource[]>(MarvinEndpoint.LIST_HABITS_FULL)

  // Build a mapping of habit IDs to note keywords.
  const habitKeywordMap = buildNoteKeywordMap(habitInfos)

  // TO-DO: Refactor this using a filter
  // Go through each keyword and check if any of the titles match.
  const habitIdsToMarkComplete: string[] = []
  for (const [habitId, keywords] of Object.entries(habitKeywordMap)) {
    if (keywords.some(keyword => title.toLowerCase().includes(keyword))) habitIdsToMarkComplete.push(habitId)
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
  return res.status(200).json({ message: `Successfully added done task for habit with name: ${title}` })
}

async function assignGoalToTask(completedTaskInfo: TaskWebhook, res: Response): Promise<Response> {
  const { title, _id: taskId } = completedTaskInfo

  // List all the goals
  const { data: goalInfos } = await axios.get<NoteKeywordSource[]>(MarvinEndpoint.LIST_GOALS)

  // Build a mapping of goal IDs to note keywords.
  const goalKeywordMap = buildNoteKeywordMap(goalInfos)

  // Goal ID to attach
  let goalIdToAttach: string | null = null
  for (const [goalId, keywords] of Object.entries(goalKeywordMap)) {
    if (keywords.some(keyword => title.toLowerCase().includes(keyword))) {
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
  const updateTaskData: UpdateDocPayload = {
    itemId: taskId,
    setters: [
      { key: `g_in_${goalIdToAttach}`, val: true },
      { key: `fieldUpdates.g_in_${goalIdToAttach}`, val: now },
      { key: 'updatedAt', val: now },
    ]
  }

  // Update the task with the goal ID
  await axios.post(MarvinEndpoint.UPDATE_DOC, updateTaskData)

  logger.info(`Assigned goal ${goalIdToAttach} to task with name: ${title}`)
  return res.status(200).json({ message: `Assigned goal ${goalIdToAttach} to habit with name: ${title}` })
}

function buildNoteKeywordMap(sources: NoteKeywordSource[]): Record<string, string[]> {
  const noteKeywordMap: Record<string, string[]> = {}
  for (const { _id, note } of sources) {
    if (note == null || note.length === 0) continue

    const keywords = note
      .split(NOTE_KEYWORD_SEPARATOR_REGEX)
      .map(s => s.toLowerCase().replace(MARVIN_NOTE_TRAILING_PADDING_REGEX, '').trim())
      .filter(keyword => keyword.length > 0)
    noteKeywordMap[_id] = keywords
  }
  return noteKeywordMap
}

function getRecordHabitData(habitId: string): RecordHabitPayload {
  return {
    habitId,
    time: Date.now(),
    value: 1,
    updateDB: true,
  }
}

export default router
export {
  addTaskOnHabitCompletion,
  assignGoalToTask,
  buildNoteKeywordMap,
  getRecordHabitData,
  markHabitOnTaskCompletion
}
