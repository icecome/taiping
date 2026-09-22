import { z } from 'zod'

export const postStatusSchema = z.enum(['draft', 'published'])
export type PostStatus = z.infer<typeof postStatusSchema>

export const postTypeSchema = z.enum(['post', 'page'])
export type PostType = z.infer<typeof postTypeSchema>

export const postSchema = z.object({
  id: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug 仅允许小写字母、数字与连字符'),
  type: postTypeSchema,
  title: z.string().min(1).max(120),
  contentMd: z.string(),
  contentHtml: z.string().default(''),
  excerpt: z.string().max(500).optional(),
  cover: z.string().optional(),
  status: postStatusSchema.default('draft'),
  publishedAt: z.string().datetime().optional(),
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
export type Post = z.infer<typeof postSchema>

export const postInputSchema = z.object({
  slug: postSchema.shape.slug,
  type: postTypeSchema.default('post'),
  title: postSchema.shape.title,
  contentMd: z.string().default(''),
  excerpt: z.string().max(500).optional(),
  cover: z.string().optional(),
  status: postStatusSchema.default('draft'),
  publishedAt: z.string().datetime().optional(),
  template: z.string().optional(),
  sortOrder: z.number().int().default(0),
  encrypt: z.boolean().default(false),
  encryptPassword: z.string().min(4).optional(),
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
  { name: 'status', label: '状态', control: 'select', group: 'advanced' },
  { name: 'publishedAt', label: '发布时间', control: 'datetime', group: 'advanced' },
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
  status: 'draft',
  contentMd: '',
  encrypt: false,
  sortOrder: 0,
  categoryIds: [],
  tagNames: [],
}
