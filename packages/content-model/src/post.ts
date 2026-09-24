import { z } from 'zod'
import { SLUG_MAX_LEN, SLUG_RE } from '@taiping/shared-utils/slug'
import { ENCRYPT_PASSWORD_MIN } from './auth'
import { isSafeResourceUrl } from './url'

const optionalSafeCover = z
  .string()
  .refine((s) => s === '' || isSafeResourceUrl(s), '封面仅支持站内路径或 http/https 资源')
  .optional()

export const postStatusSchema = z.enum(['draft', 'published'])
export type PostStatus = z.infer<typeof postStatusSchema>

export const postTypeSchema = z.enum(['post', 'page'])
export type PostType = z.infer<typeof postTypeSchema>

export const postSlugSchema = z
  .string()
  .min(1)
  .max(SLUG_MAX_LEN)
  .regex(SLUG_RE, 'slug 仅允许小写字母、数字与连字符')

/** 正文修订（整篇快照） */
export const postRevisionSchema = z.object({
  id: z.string().min(1),
  postId: z.string().min(1),
  contentMd: z.string(),
  contentHtml: z.string().default(''),
  excerpt: z.string().max(500).optional(),
  cover: optionalSafeCover,
  readingTime: z.string().optional(),
  createdAt: z.string().datetime(),
})
export type PostRevision = z.infer<typeof postRevisionSchema>

/** 文章元数据 + 当前 head 正文（读模型）；inProgress 由 head/release 指针推导 */
export const postSchema = z
  .object({
    id: z.string().min(1),
    slug: postSlugSchema,
    type: postTypeSchema,
    title: z.string().min(1).max(120),
    status: postStatusSchema.default('draft'),
    headRevisionId: z.string().optional(),
    releaseRevisionId: z.string().optional(),
    inProgress: z.boolean().optional(),
    deletedAt: z.string().datetime().optional(),
    publishedAt: z.string().datetime().optional(),
    contentMd: z.string().default(''),
    contentHtml: z.string().default(''),
    excerpt: z.string().max(500).optional(),
    cover: optionalSafeCover,
    readingTime: z.string().optional(),
    template: z.string().optional(),
    sortOrder: z.number().int().default(0),
    encrypt: z.boolean().default(false),
    encryptPasswordHash: z.string().optional(),
    encryptHint: z.string().optional(),
    encryptTitle: z.string().optional(),
    encryptMessage: z.string().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .transform((p) => ({
    ...p,
    inProgress: Boolean(
      p.headRevisionId && p.releaseRevisionId && p.headRevisionId !== p.releaseRevisionId,
    ),
  }))
export type Post = z.infer<typeof postSchema>

export const postInputSchema = z.object({
  slug: postSlugSchema.optional(),
  type: postTypeSchema.default('post'),
  title: z.string().min(1).max(120),
  contentMd: z.string().default(''),
  excerpt: z.string().max(500).optional(),
  cover: optionalSafeCover,
  template: z.string().optional(),
  sortOrder: z.number().int().default(0),
  encrypt: z.boolean().default(false),
  encryptPassword: z.string().min(ENCRYPT_PASSWORD_MIN).optional(),
  encryptHint: z.string().optional(),
  encryptTitle: z.string().optional(),
  encryptMessage: z.string().optional(),
  categoryIds: z.array(z.string()).default([]),
  tagNames: z.array(z.string()).default([]),
})
export type PostInput = z.infer<typeof postInputSchema>

export const postListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: postStatusSchema.optional(),
  type: postTypeSchema.optional(),
  q: z.string().optional(),
  deleted: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1'),
})
export type PostListQuery = z.infer<typeof postListQuerySchema>

export type FieldControl =
  | 'text'
  | 'slug'
  | 'textarea'
  | 'markdown'
  | 'boolean'
  | 'password'
  | 'image'
  | 'datetime'
  | 'number'
  | 'select'
  | 'tags'
  | 'categories'

export interface FieldMeta {
  name: string
  label: string
  control: FieldControl
  group: 'basic' | 'advanced' | 'seo'
  required?: boolean
  placeholder?: string
  showWhen?: { field: string; equals: unknown }
}

export const postFields: FieldMeta[] = [
  { name: 'title', label: '标题', control: 'text', group: 'basic', required: true },
  { name: 'slug', label: '路径', control: 'slug', group: 'basic', required: true },
  { name: 'contentMd', label: '正文', control: 'markdown', group: 'basic', required: true },
  { name: 'excerpt', label: '摘要', control: 'textarea', group: 'basic' },
  { name: 'cover', label: '封面', control: 'image', group: 'basic' },
  { name: 'categoryIds', label: '分类', control: 'categories', group: 'basic' },
  { name: 'tagNames', label: '标签', control: 'tags', group: 'basic' },
  { name: 'template', label: '页面模板', control: 'text', group: 'advanced' },
  { name: 'encrypt', label: '加密', control: 'boolean', group: 'advanced' },
  {
    name: 'encryptPassword',
    label: '访问密码',
    control: 'password',
    group: 'advanced',
    showWhen: { field: 'encrypt', equals: true },
  },
  {
    name: 'encryptHint',
    label: '密码提示',
    control: 'text',
    group: 'advanced',
    showWhen: { field: 'encrypt', equals: true },
  },
  {
    name: 'encryptTitle',
    label: '加密标题',
    control: 'text',
    group: 'advanced',
    showWhen: { field: 'encrypt', equals: true },
  },
  {
    name: 'encryptMessage',
    label: '解锁前文案',
    control: 'textarea',
    group: 'advanced',
    showWhen: { field: 'encrypt', equals: true },
  },
]

export const postDefaults: Partial<PostInput> = {
  type: 'post',
  contentMd: '',
  encrypt: false,
  sortOrder: 0,
  categoryIds: [],
  tagNames: [],
}
