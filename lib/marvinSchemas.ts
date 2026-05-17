import { z } from 'zod'

export const marvinIdSchema = z.string().min(1)
export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const unixMsSchema = z.number().int().nonnegative()
export const timeEstimateSchema = z.number().nonnegative()
export const timezoneOffsetSchema = z.number().int()

export const habitTaskActionSchema = z.enum(['record-habit', 'mark-done', 'add-task'])

export const recordHabitWebhookSchema = z.object({
  _id: marvinIdSchema,
  title: z.string().min(1),
  parentId: marvinIdSchema,
  timeEstimate: timeEstimateSchema.optional(),
  record: z.object({
    time: unixMsSchema,
    value: z.number()
  }).passthrough()
}).passthrough()

export const taskWebhookSchema = z.object({
  _id: marvinIdSchema,
  title: z.string().min(1)
}).passthrough()

export const notePatternSourceSchema = z.object({
  _id: marvinIdSchema,
  note: z.string().nullable().optional()
}).passthrough()

export const habitListResponseSchema = z.array(notePatternSourceSchema)
export const goalListResponseSchema = z.array(notePatternSourceSchema)

export const createTaskPayloadSchema = z.object({
  done: z.literal(true),
  day: dateStringSchema,
  title: z.string().min(1),
  parentId: marvinIdSchema,
  timeEstimate: timeEstimateSchema.optional(),
  timeZoneOffset: timezoneOffsetSchema
}).strict()

export const recordHabitPayloadSchema = z.object({
  habitId: marvinIdSchema,
  time: unixMsSchema,
  value: z.literal(1),
  updateDB: z.literal(true)
}).strict()

const goalMembershipSetterSchema = z.object({
  key: z.string().regex(/^g_in_[^.]+$/),
  val: z.literal(true)
}).strict()

const goalFieldUpdateSetterSchema = z.object({
  key: z.string().regex(/^fieldUpdates\.g_in_[^.]+$/),
  val: unixMsSchema
}).strict()

const updatedAtSetterSchema = z.object({
  key: z.literal('updatedAt'),
  val: unixMsSchema
}).strict()

export const updateDocPayloadSchema = z.object({
  itemId: marvinIdSchema,
  setters: z.tuple([
    goalMembershipSetterSchema,
    goalFieldUpdateSetterSchema,
    updatedAtSetterSchema
  ])
}).strict()

export type HabitTaskAction = z.infer<typeof habitTaskActionSchema>
export type RecordHabitWebhook = z.infer<typeof recordHabitWebhookSchema>
export type TaskWebhook = z.infer<typeof taskWebhookSchema>
export type NotePatternSource = z.infer<typeof notePatternSourceSchema>
export type CreateTaskPayload = z.infer<typeof createTaskPayloadSchema>
export type RecordHabitPayload = z.infer<typeof recordHabitPayloadSchema>
export type UpdateDocPayload = z.infer<typeof updateDocPayloadSchema>
