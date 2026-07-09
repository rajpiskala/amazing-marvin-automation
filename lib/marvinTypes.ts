export type HabitTaskAction = 'record-habit' | 'mark-done' | 'add-task'

export interface HabitRecord {
  time: number
  value: number
}

export interface RecordHabitWebhook {
  _id: string
  title: string
  note?: string | null
  parentId: string
  timeEstimate?: number
  record: HabitRecord
}

export interface TaskWebhook {
  _id: string
  title: string
}

export interface NoteKeywordSource {
  _id: string
  note?: string | null
}

export interface CreateTaskPayload {
  done: true
  doneAt: number
  day: string
  title: string
  parentId: string
  timeEstimate?: number
  timeZoneOffset: number
}

export interface RecordHabitPayload {
  habitId: string
  time: number
  value: 1
  updateDB: true
}

export interface UpdateDocSetter {
  key: string
  val: boolean | number
}

export interface UpdateDocPayload {
  itemId: string
  setters: UpdateDocSetter[]
}
