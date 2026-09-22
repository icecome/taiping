import { z } from 'zod'

export const mediaSchema = z.object({
  id: z.string().min(1),
  storageKey: z.string().min(1),
  url: z.string().min(1),
  filename: z.string().min(1),
  mime: z.string().min(1),
  size: z.number().int().nonnegative(),
  width: z.number().int().nonnegative().optional(),
  height: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime(),
})
export type Media = z.infer<typeof mediaSchema>

export const mediaListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
})
export type MediaListQuery = z.infer<typeof mediaListQuerySchema>
