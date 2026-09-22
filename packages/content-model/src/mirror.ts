import { z } from 'zod'

export const mirrorEntityTypeSchema = z.enum(['post', 'page', 'moment', 'settings', 'term'])
export type MirrorEntityType = z.infer<typeof mirrorEntityTypeSchema>

export const mirrorOpSchema = z.enum(['upsert', 'delete'])
export type MirrorOp = z.infer<typeof mirrorOpSchema>

export const mirrorStatusSchema = z.enum(['pending', 'processing', 'done', 'failed'])
export type MirrorStatus = z.infer<typeof mirrorStatusSchema>

export const mirrorTaskSchema = z.object({
  id: z.string().min(1),
  entityType: mirrorEntityTypeSchema,
  entityId: z.string().min(1),
  op: mirrorOpSchema,
  status: mirrorStatusSchema.default('pending'),
  retryCount: z.number().int().nonnegative().default(0),
  lastError: z.string().optional(),
  createdAt: z.string().datetime(),
})
export type MirrorTask = z.infer<typeof mirrorTaskSchema>

export const mirrorStatusSummarySchema = z.object({
  pending: z.number().int().nonnegative(),
  processing: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
})
export type MirrorStatusSummary = z.infer<typeof mirrorStatusSummarySchema>
