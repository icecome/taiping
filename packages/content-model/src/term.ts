import { z } from 'zod'
import { SLUG_MAX_LEN, SLUG_RE } from '@taiping/shared-utils/slug'

export const termTypeSchema = z.enum(['category', 'tag'])
export type TermType = z.infer<typeof termTypeSchema>

export const termSchema = z.object({
  id: z.string().min(1),
  type: termTypeSchema,
  name: z.string().min(1).max(40),
  slug: z.string().min(1).max(SLUG_MAX_LEN).regex(SLUG_RE),
})
export type Term = z.infer<typeof termSchema>

export const termInputSchema = z.object({
  type: termTypeSchema,
  name: z.string().min(1).max(40),
  slug: termSchema.shape.slug.optional(),
})
export type TermInput = z.infer<typeof termInputSchema>

export const termUpdateSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  slug: termSchema.shape.slug.optional(),
})
export type TermUpdateInput = z.infer<typeof termUpdateSchema>

export const taxonomyQuerySchema = z.object({
  type: termTypeSchema,
})
export type TaxonomyQuery = z.infer<typeof taxonomyQuerySchema>
