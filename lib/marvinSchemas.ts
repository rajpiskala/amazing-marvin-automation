import { z } from 'zod'

export const marvinIdSchema = z.string().min(1)
export const marvinTitleSchema = z.string().min(1)
export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const unixMsSchema = z.number().int().nonnegative()
export const timeEstimateSchema = z.number().nonnegative()
export const timezoneOffsetSchema = z.number().int()

export const habitTaskActionSchema = z.enum(['record-habit', 'mark-done', 'add-task'])

export const recordHabitWebhookSchema = z.object({
  _id: marvinIdSchema,
  title: marvinTitleSchema,
  parentId: marvinIdSchema,
  timeEstimate: timeEstimateSchema.optional(),
  record: z.object({
    time: unixMsSchema,
    value: z.number()
  }).passthrough()
}).passthrough()

export const taskWebhookSchema = z.object({
  _id: marvinIdSchema,
  title: marvinTitleSchema
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
  title: marvinTitleSchema,
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

const updateDocSetterSchema = z.union([
  goalMembershipSetterSchema,
  goalFieldUpdateSetterSchema,
  updatedAtSetterSchema
])

export const updateDocPayloadSchema = z.object({
  itemId: marvinIdSchema,
  setters: z.array(updateDocSetterSchema).length(3)
}).strict().superRefine((payload, ctx) => {
  const goalMembershipSetter = payload.setters.find((setter): setter is z.infer<typeof goalMembershipSetterSchema> => {
    return goalMembershipSetterSchema.safeParse(setter).success
  })
  const goalFieldUpdateSetter = payload.setters.find((setter): setter is z.infer<typeof goalFieldUpdateSetterSchema> => {
    return goalFieldUpdateSetterSchema.safeParse(setter).success
  })
  const updatedAtSetter = payload.setters.find((setter): setter is z.infer<typeof updatedAtSetterSchema> => {
    return updatedAtSetterSchema.safeParse(setter).success
  })

  if (!goalMembershipSetter) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Missing goal membership setter',
      path: ['setters']
    })
  }

  if (!goalFieldUpdateSetter) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Missing goal field update setter',
      path: ['setters']
    })
  }

  if (!updatedAtSetter) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Missing updatedAt setter',
      path: ['setters']
    })
  }

  if (goalMembershipSetter && goalFieldUpdateSetter) {
    const membershipGoalId = goalMembershipSetter.key.slice('g_in_'.length)
    const fieldUpdateGoalId = goalFieldUpdateSetter.key.slice('fieldUpdates.g_in_'.length)

    if (membershipGoalId !== fieldUpdateGoalId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Goal membership setters must target the same goal ID',
        path: ['setters']
      })
    }
  }
})

export type HabitTaskAction = z.infer<typeof habitTaskActionSchema>
export type RecordHabitWebhook = z.infer<typeof recordHabitWebhookSchema>
export type TaskWebhook = z.infer<typeof taskWebhookSchema>
export type NotePatternSource = z.infer<typeof notePatternSourceSchema>
export type CreateTaskPayload = z.infer<typeof createTaskPayloadSchema>
export type RecordHabitPayload = z.infer<typeof recordHabitPayloadSchema>
export type UpdateDocPayload = z.infer<typeof updateDocPayloadSchema>
