const express = require('express')
const request = require('supertest')

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn()
  }
}))

const axios = require('axios').default
const habitTaskRouter = require('../src/habitsToTaskRouter').default
const { MarvinEndpoint } = require('../lib/constants')
const {
  createTaskPayloadSchema,
  goalListResponseSchema,
  habitListResponseSchema,
  recordHabitPayloadSchema,
  recordHabitWebhookSchema,
  taskWebhookSchema,
  updateDocPayloadSchema
} = require('../lib/marvinSchemas')

function buildApp () {
  const app = express()
  app.use(express.json())
  app.use(habitTaskRouter)
  return app
}

describe('Marvin Zod schemas', () => {
  test('accepts record habit webhooks with Marvin-owned extra fields', () => {
    const result = recordHabitWebhookSchema.safeParse({
      _id: 'habit-1',
      title: 'Drink water',
      parentId: 'project-1',
      timeEstimate: 300000,
      record: { time: 1700000000000, value: 1, futureField: true },
      futureMarvinField: 'kept'
    })

    expect(result.success).toBe(true)
  })

  test('rejects record habit webhooks without record time', () => {
    const result = recordHabitWebhookSchema.safeParse({
      _id: 'habit-1',
      title: 'Drink water',
      parentId: 'project-1',
      record: { value: 1 }
    })

    expect(result.success).toBe(false)
  })

  test('requires task webhook id and title', () => {
    expect(taskWebhookSchema.safeParse({ _id: 'task-1', title: 'Run' }).success).toBe(true)
    expect(taskWebhookSchema.safeParse({ title: 'Run' }).success).toBe(false)
  })

  test('validates habit and goal list responses', () => {
    expect(habitListResponseSchema.safeParse([{ _id: 'habit-1', note: 'run' }]).success).toBe(true)
    expect(goalListResponseSchema.safeParse([{ note: 'run' }]).success).toBe(false)
  })

  test('validates strict outbound payloads', () => {
    expect(createTaskPayloadSchema.safeParse({
      done: true,
      day: '2024-01-02',
      title: 'Drink water',
      parentId: 'project-1',
      timeEstimate: 300000,
      timeZoneOffset: -480
    }).success).toBe(true)

    expect(recordHabitPayloadSchema.safeParse({
      habitId: 'habit-1',
      time: 1700000000000,
      value: 1,
      updateDB: true
    }).success).toBe(true)

    expect(updateDocPayloadSchema.safeParse({
      itemId: 'task-1',
      setters: [
        { key: 'g_in_goal-1', val: true },
        { key: 'fieldUpdates.g_in_goal-1', val: 1700000000000 },
        { key: 'updatedAt', val: 1700000000000 }
      ]
    }).success).toBe(true)
  })

  test('rejects extra fields on outbound payloads', () => {
    const result = createTaskPayloadSchema.safeParse({
      done: true,
      day: '2024-01-02',
      title: 'Drink water',
      parentId: 'project-1',
      timeZoneOffset: -480,
      unexpected: true
    })

    expect(result.success).toBe(false)
  })
})

describe('habit-as-task validation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 400 for unknown route type', async () => {
    const response = await request(buildApp())
      .post('/habit-as-task?type=unknown')
      .send({})

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Invalid habit-as-task type')
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('returns 400 for invalid record habit webhook body', async () => {
    const response = await request(buildApp())
      .post('/habit-as-task?type=record-habit')
      .send({ _id: 'habit-1', title: 'Drink water', parentId: 'project-1' })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Invalid record habit webhook body')
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('creates a completed task for a valid record habit webhook', async () => {
    axios.post.mockResolvedValueOnce({})

    const recordTime = new Date(2024, 0, 2).getTime()
    const response = await request(buildApp())
      .post('/habit-as-task?type=record-habit')
      .send({
        _id: 'habit-1',
        title: 'Drink water',
        parentId: 'project-1',
        timeEstimate: 300000,
        record: { time: recordTime, value: 1 },
        futureMarvinField: 'ignored by app logic'
      })

    expect(response.status).toBe(200)
    expect(axios.post).toHaveBeenCalledWith(MarvinEndpoint.ADD_TASK, expect.objectContaining({
      done: true,
      day: '2024-01-02',
      title: 'Drink water',
      parentId: 'project-1',
      timeEstimate: 300000
    }))
  })

  test('returns 502 when Marvin habits response is malformed', async () => {
    axios.get.mockResolvedValueOnce({ data: [{ note: 'run' }] })

    const response = await request(buildApp())
      .post('/habit-as-task?type=mark-done')
      .send({ _id: 'task-1', title: 'Run outside' })

    expect(response.status).toBe(502)
    expect(response.body.error).toBe('Marvin habits response')
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('records matching habits for a valid mark done webhook', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000)
    axios.get.mockResolvedValueOnce({ data: [{ _id: 'habit-1', note: 'run, walk' }] })
    axios.post.mockResolvedValueOnce({})

    const response = await request(buildApp())
      .post('/habit-as-task?type=mark-done')
      .send({ _id: 'task-1', title: 'Morning run' })

    expect(response.status).toBe(200)
    expect(axios.post).toHaveBeenCalledWith(MarvinEndpoint.UPDATE_HABIT, {
      habitId: 'habit-1',
      time: 1700000000000,
      value: 1,
      updateDB: true
    })

    Date.now.mockRestore()
  })

  test('attaches a matching goal for a valid add task webhook', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000)
    axios.get.mockResolvedValueOnce({ data: [{ _id: 'goal-1', note: 'write' }] })
    axios.post.mockResolvedValueOnce({})

    const response = await request(buildApp())
      .post('/habit-as-task?type=add-task')
      .send({ _id: 'task-1', title: 'Write chapter' })

    expect(response.status).toBe(200)
    expect(axios.post).toHaveBeenCalledWith(MarvinEndpoint.UPDATE_DOC, {
      itemId: 'task-1',
      setters: [
        { key: 'g_in_goal-1', val: true },
        { key: 'fieldUpdates.g_in_goal-1', val: 1700000000000 },
        { key: 'updatedAt', val: 1700000000000 }
      ]
    })

    Date.now.mockRestore()
  })
})
