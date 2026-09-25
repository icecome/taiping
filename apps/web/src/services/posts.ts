import type { Post } from '@taiping/content-model'
import { estimateReadingTime } from '@taiping/shared-utils'
import { makeExcerpt, renderMarkdown } from '../lib/markdown'

export type PostRow = {
  id: number
  type: string
  title: string
  slug: string
  text: string
  html: string
  status: string
  password: string | null
  author_id: number
  template: string | null
  allow_comment: number
  allow_feed: number
  comments_num: number
  pinned: number
  order_num: number
  parent: number
  cover: string
  excerpt: string
  reading_time: string
  visible: string
  deleted: number
  archive_year: string
  archive_month: string
  created_at: string
  modified_at: string
  published_at: string | null
}

export function rowToPost(row: PostRow, taxonomies: Post['categories'] = [], tags: Post['tags'] = []): Post {
  return {
    id: String(row.id),
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    contentHtml: row.html,
    contentMarkdown: row.text,
    cover: row.cover || undefined,
    status: row.status as Post['status'],
    password: row.password || undefined,
    encrypt: Boolean(row.password),
    encryptHint: row.password ? '联系作者获取密码' : undefined,
    allowComment: Boolean(row.allow_comment),
    pinned: Boolean(row.pinned),
    authorId: String(row.author_id),
    template: row.template || undefined,
    readingTime: row.reading_time || undefined,
    publishedAt: row.published_at || undefined,
    createdAt: row.created_at,
    modifiedAt: row.modified_at,
    categories: taxonomies,
    tags,
  }
}

export async function loadTaxonomies(db: D1Database, postId: number): Promise<{
  categories: Post['categories']
  tags: Post['tags']
}> {
  const rows = await db
    .prepare(
      `SELECT m.id, m.name, m.slug, m.type FROM relationships r
       INNER JOIN metas m ON m.id = r.meta_id
       WHERE r.post_id = ?`,
    )
    .bind(postId)
    .all<{ id: number; name: string; slug: string; type: string }>()

  const categories: Post['categories'] = []
  const tags: Post['tags'] = []
  for (const r of rows.results ?? []) {
    const item = { id: String(r.id), name: r.name, slug: r.slug }
    if (r.type === 'category') categories.push(item)
    else tags.push(item)
  }
  return { categories, tags }
}

export function preparePostContent(markdown: string): { html: string; excerpt: string; readingTime: string } {
  const html = renderMarkdown(markdown)
  return {
    html,
    excerpt: makeExcerpt(markdown),
    readingTime: estimateReadingTime(markdown),
  }
}

export async function listPublishedPosts(
  db: D1Database,
  opts: { page: number; pageSize: number },
): Promise<{ posts: Post[]; total: number }> {
  const page = Math.max(1, opts.page)
  const offset = (page - 1) * opts.pageSize
  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS c FROM posts WHERE type = 'post' AND status = 'published' AND deleted = 0`)
    .first<{ c: number }>()
  const rows = await db
    .prepare(
      `SELECT * FROM posts WHERE type = 'post' AND status = 'published' AND deleted = 0
       ORDER BY pinned DESC, COALESCE(published_at, created_at) DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(opts.pageSize, offset)
    .all<PostRow>()

  const posts: Post[] = []
  for (const row of rows.results ?? []) {
    const tax = await loadTaxonomies(db, row.id)
    posts.push(rowToPost(row, tax.categories, tax.tags))
  }
  return { posts, total: totalRow?.c ?? 0 }
}

export async function getPostBySlug(db: D1Database, slug: string): Promise<Post | null> {
  const row = await db
    .prepare(`SELECT * FROM posts WHERE slug = ? AND deleted = 0 LIMIT 1`)
    .bind(slug)
    .first<PostRow>()
  if (!row) return null
  const tax = await loadTaxonomies(db, row.id)
  return rowToPost(row, tax.categories, tax.tags)
}

export async function getPostById(db: D1Database, id: number): Promise<Post | null> {
  const row = await db
    .prepare(`SELECT * FROM posts WHERE id = ? AND deleted = 0 LIMIT 1`)
    .bind(id)
    .first<PostRow>()
  if (!row) return null
  const tax = await loadTaxonomies(db, row.id)
  return rowToPost(row, tax.categories, tax.tags)
}
