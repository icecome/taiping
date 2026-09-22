import type { SiteSettings } from '@taiping/content-model/settings'
import type { Post } from '@taiping/content-model/post'
import type { Comment } from '@taiping/content-model/comment'
import type { Moment } from '@taiping/content-model/moment'

export interface TermBrief {
  id: string
  name: string
  slug: string
}

export interface PostCardData {
  id: string
  slug: string
  title: string
  excerpt: string
  cover?: string
  publishedAt?: string
  readingTime?: string
  categories: TermBrief[]
  tags: TermBrief[]
  encrypt?: boolean
}

export interface PaginationData {
  page: number
  totalPages: number
  basePath: string
}

export interface ThemeMeta {
  settings: SiteSettings
  path: string
  title: string
  description?: string
}

export interface IndexContext extends ThemeMeta {
  posts: PostCardData[]
  pagination: PaginationData
}

export interface ListContext extends ThemeMeta {
  heading: string
  posts: PostCardData[]
  pagination: PaginationData
}

export interface PostContext extends ThemeMeta {
  post: Post
  categories: TermBrief[]
  tags: TermBrief[]
  prev: { slug: string; title: string } | null
  next: { slug: string; title: string } | null
  comments: Comment[]
  unlocked: boolean
  canComment: boolean
}

export interface ArchiveGroup {
  key: string
  label: string
  posts: PostCardData[]
}

export interface ArchiveContext extends ThemeMeta {
  groups: ArchiveGroup[]
}

export interface TaxonomyContext extends ThemeMeta {
  termType: 'category' | 'tag'
  term?: TermBrief
  terms: Array<TermBrief & { count: number }>
  posts: PostCardData[]
}

export interface MomentsContext extends ThemeMeta {
  moments: Moment[]
  pagination?: PaginationData
}

export interface GuestbookContext extends ThemeMeta {
  comments: Comment[]
  enabled: boolean
}

export interface NotFoundContext extends ThemeMeta {}

export interface PageContext extends ThemeMeta {
  post: Post
  comments: Comment[]
  canComment: boolean
}

export type SlotRenderer = (ctx: ThemeMeta) => string
