import type { Post } from '@taiping/content-model/post'
import type { SiteSettings } from '@taiping/content-model/settings'
import { deriveExcerpt, deriveReadingTime, renderMarkdownSafe } from './markdown'

export interface PostListItem {
  id: string
  slug: string
  title: string
  excerpt: string
  cover?: string
  publishedAt?: string
  readingTime?: string
  categories: Array<{ id: string; name: string; slug: string }>
  tags: Array<{ id: string; name: string; slug: string }>
}

export interface PrevNextPost {
  id: string
  slug: string
  title: string
}

export function buildExcerptAndReading(post: Pick<Post, 'contentMd' | 'excerpt' | 'readingTime'>): {
  excerpt: string
  readingTime: string
} {
  return {
    excerpt: post.excerpt?.trim() || deriveExcerpt(post.contentMd),
    readingTime: post.readingTime?.trim() || deriveReadingTime(post.contentMd),
  }
}

export function renderPostBody(contentMd: string): string {
  return renderMarkdownSafe(contentMd)
}

export function filterPublished(posts: Post[]): Post[] {
  return posts.filter((post) => post.status === 'published')
}

export function sortByPublishedDesc(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => {
    const av = a.publishedAt ?? a.createdAt
    const bv = b.publishedAt ?? b.createdAt
    return bv.localeCompare(av)
  })
}

export function findPrevNext(
  posts: Post[],
  currentId: string,
): { prev: PrevNextPost | null; next: PrevNextPost | null } {
  const ordered = sortByPublishedDesc(filterPublished(posts.filter((p) => p.type === 'post')))
  const index = ordered.findIndex((p) => p.id === currentId)
  if (index < 0) return { prev: null, next: null }
  const newer = ordered[index - 1]
  const older = ordered[index + 1]
  return {
    prev: newer ? { id: newer.id, slug: newer.slug, title: newer.title } : null,
    // 时间线上更早的一篇作为「下一篇」
    next: older ? { id: older.id, slug: older.slug, title: older.title } : null,
  }
}

export function paginate<T>(items: T[], page: number, pageSize: number): {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
} {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
  }
}

export function resolvePostContextMeta(
  post: Post,
  categories: PostListItem['categories'],
  tags: PostListItem['tags'],
  settings: SiteSettings,
): {
  excerpt: string
  readingTime: string
  categories: PostListItem['categories']
  tags: PostListItem['tags']
  siteTitle: string
} {
  const derived = buildExcerptAndReading(post)
  return {
    ...derived,
    categories,
    tags,
    siteTitle: settings.title,
  }
}
