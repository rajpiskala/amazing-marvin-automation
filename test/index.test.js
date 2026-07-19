const express = require('express')
const request = require('supertest')
const { deflateRawSync } = require('zlib')

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn()
  }
}))

const axios = require('axios').default
const habitTaskRouterModule = require('../src/habitsToTaskRouter')
const habitTaskRouter = habitTaskRouterModule.default
const { buildNoteKeywordMap } = habitTaskRouterModule
const { MarvinEndpoint, UNASSIGNED_PARENT_ID } = require('../lib/constants')
const { convertToGrams, getLoseItDaySummary, parseCsv } = require('../lib/loseItExport')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(habitTaskRouter)
  return app
}

afterEach(() => {
  jest.restoreAllMocks()
  jest.clearAllMocks()
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

  test('creates a completed task for a valid record habit webhook', async () => {
    axios.post.mockResolvedValueOnce({})

    const recordTime = new Date(2024, 0, 2).getTime()
    const response = await request(buildApp())
      .post('/habit-as-task?type=record-habit')
      .send({
        _id: 'habit-1',
        title: 'Drink water',
        note: '',
        parentId: 'project-1',
        timeEstimate: 300000,
        record: { time: recordTime, value: 1 },
        futureMarvinField: 'ignored by app logic'
      })

    expect(response.status).toBe(200)
    expect(axios.post).toHaveBeenCalledWith(MarvinEndpoint.ADD_TASK, expect.objectContaining({
      done: true,
      doneAt: recordTime,
      day: '2024-01-02',
      title: 'Drink water',
      parentId: 'project-1',
      timeEstimate: 300000
    }))
    expect(axios.get).not.toHaveBeenCalled()
  })

  test('skips creating a task for unassigned habits', async () => {
    const response = await request(buildApp())
      .post('/habit-as-task?type=record-habit')
      .send({
        _id: 'habit-1',
        title: 'Drink water',
        parentId: UNASSIGNED_PARENT_ID,
        record: { time: new Date(2024, 0, 2).getTime(), value: 1 }
      })

    expect(response.status).toBe(200)
    expect(response.body.message).toBe('Skipping creating a task for habit with name: Drink water')
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('skips creating a task when the webhook note has the skip directive', async () => {
    const response = await request(buildApp())
      .post('/habit-as-task?type=record-habit')
      .send({
        _id: 'habit-1',
        title: 'Log Calories',
        note: '$skipHabitTaskCreation',
        parentId: 'project-1',
        record: { time: new Date(2024, 0, 2).getTime(), value: 1 }
      })

    expect(response.status).toBe(200)
    expect(response.body.message).toBe('Skipping creating a task for habit with skip directive: Log Calories')
    expect(axios.get).not.toHaveBeenCalled()
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('does not fetch habits before creating a task when webhook note is omitted', async () => {
    axios.post.mockResolvedValueOnce({})

    const response = await request(buildApp())
      .post('/habit-as-task?type=record-habit')
      .send({
        _id: 'habit-1',
        title: 'Log Calories',
        parentId: 'project-1',
        record: { time: new Date(2024, 0, 2).getTime(), value: 1 }
      })

    expect(response.status).toBe(200)
    expect(axios.get).not.toHaveBeenCalled()
    expect(axios.post).toHaveBeenCalledWith(MarvinEndpoint.ADD_TASK, expect.objectContaining({
      done: true,
      doneAt: new Date(2024, 0, 2).getTime(),
      title: 'Log Calories'
    }))
  })

  test('preserves Marvin title whitespace instead of normalizing webhook data', async () => {
    axios.post.mockResolvedValueOnce({})

    const response = await request(buildApp())
      .post('/habit-as-task?type=record-habit')
      .send({
        _id: 'habit-1',
        title: '  Drink water  ',
        note: '',
        parentId: 'project-1',
        record: { time: new Date(2024, 0, 2).getTime(), value: 1 }
      })

    expect(response.status).toBe(200)
    expect(axios.post).toHaveBeenCalledWith(MarvinEndpoint.ADD_TASK, expect.objectContaining({
      title: '  Drink water  '
    }))
  })

  test('records all matching habits for a valid mark done webhook', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000)
    axios.get.mockResolvedValueOnce({
      data: [
        { _id: 'habit-1', note: 'run, walk' },
        { _id: 'habit-2', note: 'stretch, jog' },
        { _id: 'habit-3', note: 'read' }
      ]
    })
    axios.post.mockResolvedValueOnce({})
    axios.post.mockResolvedValueOnce({})

    const response = await request(buildApp())
      .post('/habit-as-task?type=mark-done')
      .send({ _id: 'task-1', title: 'Morning run and jog' })

    expect(response.status).toBe(200)
    expect(axios.post).toHaveBeenCalledWith(MarvinEndpoint.UPDATE_HABIT, {
      habitId: 'habit-1',
      time: 1700000000000,
      value: 1,
      updateDB: true
    })
    expect(axios.post).toHaveBeenCalledWith(MarvinEndpoint.UPDATE_HABIT, {
      habitId: 'habit-2',
      time: 1700000000000,
      value: 1,
      updateDB: true
    })
    expect(axios.post).toHaveBeenCalledTimes(2)
  })

  test('does not record habits when no note keywords match the task title', async () => {
    axios.get.mockResolvedValueOnce({ data: [{ _id: 'habit-1', note: 'walk, stretch' }] })

    const response = await request(buildApp())
      .post('/habit-as-task?type=mark-done')
      .send({ _id: 'task-1', title: 'Morning run' })

    expect(response.status).toBe(200)
    expect(response.body.message).toBe('No related habits to mark done for task: Morning run')
    expect(axios.post).not.toHaveBeenCalled()
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
  })

  test('does not attach a goal when no note keywords match the task title', async () => {
    axios.get.mockResolvedValueOnce({ data: [{ _id: 'goal-1', note: 'read' }] })

    const response = await request(buildApp())
      .post('/habit-as-task?type=add-task')
      .send({ _id: 'task-1', title: 'Write chapter' })

    expect(response.status).toBe(200)
    expect(response.body.message).toBe('No related goals to mark done for task: Write chapter')
    expect(axios.post).not.toHaveBeenCalled()
  })
})

describe('note keyword matching', () => {
  test('builds lower-case keywords from notes and ignores empty keywords', () => {
    expect(buildNoteKeywordMap([
      { _id: 'habit-1', note: 'Run, WALK, \n\\' },
      { _id: 'habit-2', note: null },
      { _id: 'habit-3', note: '' }
    ])).toEqual({
      'habit-1': ['run', 'walk']
    })
  })
})

describe('LoseIt export parsing', () => {
  const originalLoseItCookie = process.env.LOSEIT_COOKIE

  afterEach(() => {
    process.env.LOSEIT_COOKIE = originalLoseItCookie
  })

  test('parses quoted CSV fields', () => {
    expect(parseCsv('Date,Name,Calories\n07/15/2026,"Cappuccino, 8 oz",73\n')).toEqual([
      { Date: '07/15/2026', Name: 'Cappuccino, 8 oz', Calories: '73' }
    ])
  })

  test('converts supported serving units to grams', () => {
    expect(convertToGrams(200, 'Grams')).toBe(200)
    expect(convertToGrams(2, 'Ounces')).toBeCloseTo(56.699)
    expect(convertToGrams(1, 'Each')).toBeNull()
  })

  test('summarizes calories and produce grams from the LoseIt export ZIP', async () => {
    process.env.LOSEIT_COOKIE = 'liauth=fake'
    axios.get.mockResolvedValueOnce({
      data: buildZip({
        'daily-calorie-summary.csv': [
          'Date,Food cals,Exercise cals,Budget cals,EER',
          '07/15/2026,3289.0,0.0,2475.0,2384.79',
        ].join('\n'),
        'food-logs.csv': [
          'Date,Name,Icon,Meal,Quantity,Units,Calories,Deleted',
          '07/15/2026,Strawberry,Fruit,Breakfast,200.0,Grams,67,0',
          '07/15/2026,"Spinach, Cooked",Spinach,Lunch,100.0,Grams,23,0',
          '07/15/2026,"Rice, White, Cooked",Rice,Lunch,350.0,Grams,455,0',
          '07/15/2026,Strawberry,Fruit,Snacks,100.0,Grams,34,1',
        ].join('\n'),
      })
    })

    const summary = await getLoseItDaySummary('2026-07-15')

    expect(summary.caloriesLogged).toBe(true)
    expect(summary.foodCalories).toBe(3289)
    expect(summary.produceGrams).toBe(300)
    expect(summary.produceOverThreshold).toBe(true)
    expect(summary.foodEntries).toHaveLength(3)
    expect(summary.produceEntries.map(entry => entry.name)).toEqual(['Strawberry', 'Spinach, Cooked'])
  })
})

function buildZip(files) {
  const localParts = []
  const centralParts = []
  let localOffset = 0

  Object.entries(files).forEach(([name, content]) => {
    const nameBuffer = Buffer.from(name)
    const compressed = deflateRawSync(Buffer.from(content))
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(8, 8)
    localHeader.writeUInt32LE(compressed.length, 18)
    localHeader.writeUInt32LE(Buffer.byteLength(content), 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)

    localParts.push(localHeader, nameBuffer, compressed)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(8, 10)
    centralHeader.writeUInt32LE(compressed.length, 20)
    centralHeader.writeUInt32LE(Buffer.byteLength(content), 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt32LE(localOffset, 42)
    centralParts.push(centralHeader, nameBuffer)

    localOffset += localHeader.length + nameBuffer.length + compressed.length
  })

  return Buffer.concat([...localParts, ...centralParts])
}
