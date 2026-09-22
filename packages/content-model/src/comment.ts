import { z } from 'zod'

/**
 * 外部链接协议白名单。zod 的 .url() 基于 new URL()，会放行 javascript: 等协议，
 * 故凡是要渲染进 href 的字段都必须经此校验。
 */
export const SAFE_URL_SCHEME = /^https?:\/\//i

export function isSafeExternalUrl(value: string): boolean {
  return SAFE_URL_SCHEME.test(value)
}

export const commentTargetTypeSchema = z.enum(['guestbook', 'post', 'moment'])
export type CommentTargetType = z.infer<typeof commentTargetTypeSchema>

export const commentStatusSchema = z.enum(['pending', 'approved', 'spam'])
export type CommentStatus = z.infer<typeof commentStatusSchema>

export const commentSchema = z.object({
  id: z.string().min(1),
  targetType: commentTargetTypeSchema,
  targetId: z.string().min(1),
  parentId: z.string().optional(),
  nickname: z.string().min(1).max(40),
  email: z.string().email().optional().or(z.literal('')),
  website: z
    .string()
    .refine((s) => !s || isSafeExternalUrl(s), '站点地址仅支持 http/https 链接')
    .optional(),
  contentMd: z.string().min(1).max(2000),
  contentHtml: z.string().default(''),
  status: commentStatusSchema.default('pending'),
  isFeatured: z.boolean().default(false),
  ipHash: z.string().optional(),
  userAgent: z.string().optional(),
  createdAt: z.string().datetime(),
})
export type Comment = z.infer<typeof commentSchema>

export const commentCreateSchema = z.object({
  targetType: commentTargetTypeSchema,
  targetId: z.string().min(1),
  parentId: z.string().optional(),
  nickname: z.string().min(1).max(40),
  email: z.string().email().optional().or(z.literal('')),
  website: z
    .string()
    .refine((s) => !s || isSafeExternalUrl(s), '站点地址仅支持 http/https 链接')
    .optional()
    .or(z.literal('')),
  content: z.string().min(1).max(2000),
})
export type CommentCreate = z.infer<typeof commentCreateSchema>

export const commentModerateSchema = z.object({
  action: z.enum(['approve', 'spam', 'pending', 'feature', 'unfeature', 'delete']),
})
export type CommentModerate = z.infer<typeof commentModerateSchema>

export const commentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: commentStatusSchema.optional(),
  targetType: commentTargetTypeSchema.optional(),
})
export type CommentListQuery = z.infer<typeof commentListQuerySchema>
