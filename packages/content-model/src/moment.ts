import { z } from 'zod'

export const momentStatusSchema = z.enum(['draft', 'published'])
export type MomentStatus = z.infer<typeof momentStatusSchema>

export const momentPictureSchema = z.object({
  url: z.string().min(1),
  alt: z.string().optional(),
})
export type MomentPicture = z.infer<typeof momentPictureSchema>

export const momentSchema = z.object({
  id: z.string().min(1),
  contentMd: z.string(),
  contentHtml: z.string().default(''),
  pictures: z.array(momentPictureSchema).default([]),
  videoUrl: z.string().optional(),
  linkUrl: z.string().optional(),
  linkText: z.string().optional(),
  author: z.string().default(''),
  status: momentStatusSchema.default('published'),
  tagNames: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
})
export type Moment = z.infer<typeof momentSchema>

export const momentInputSchema = z.object({
  contentMd: z.string().min(1).max(2000),
  pictures: z.array(momentPictureSchema).max(9).default([]),
  videoUrl: z.string().optional(),
  linkUrl: z.string().optional(),
  linkText: z.string().optional(),
  author: z.string().optional(),
  status: momentStatusSchema.default('published'),
  tagNames: z.array(z.string()).default([]),
})
export type MomentInput = z.infer<typeof momentInputSchema>

export const momentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: momentStatusSchema.optional(),
})
export type MomentListQuery = z.infer<typeof momentListQuerySchema>

export interface MomentFieldMeta {
  name: string
  label: string
  control: 'markdown' | 'images' | 'text' | 'url' | 'select' | 'tags'
  required?: boolean
}

export const momentFields: MomentFieldMeta[] = [
  { name: 'contentMd', label: '正文', control: 'markdown', required: true },
  { name: 'pictures', label: '图片', control: 'images' },
  { name: 'videoUrl', label: '视频链接', control: 'url' },
  { name: 'linkUrl', label: '外链', control: 'url' },
  { name: 'linkText', label: '外链文案', control: 'text' },
  { name: 'tagNames', label: '标签', control: 'tags' },
  { name: 'status', label: '状态', control: 'select' },
]
