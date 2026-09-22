import { z } from 'zod'
import { isSafeExternalUrl } from './url'

export { SAFE_URL_SCHEME, isSafeExternalUrl } from './url'

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
  /** 关键词：匹配昵称、邮箱与正文 */
  keyword: z.string().max(64).optional(),
})
export type CommentListQuery = z.infer<typeof commentListQuerySchema>

/** 回复来源：博主在后台回复，或访客经邮件回信 */
export const replyTypeSchema = z.enum(['博主', '邮箱回信'])
export type ReplyType = z.infer<typeof replyTypeSchema>

export const commentReplySchema = z.object({
  id: z.string().min(1),
  commentId: z.string().min(1),
  contentMd: z.string().min(1).max(2000),
  contentHtml: z.string().default(''),
  replyType: replyTypeSchema.default('博主'),
  replyFromEmail: z.string().default(''),
  createdAt: z.string().datetime(),
})
export type CommentReply = z.infer<typeof commentReplySchema>

/** 博主回复的输入（访客回信由入站 webhook 构造，不经过此校验） */
export const commentReplyInputSchema = z.object({
  content: z.string().min(1).max(2000),
})
export type CommentReplyInput = z.infer<typeof commentReplyInputSchema>
