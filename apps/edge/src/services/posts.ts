import type { D1Database } from '@cloudflare/workers-types'
import type { Post, PostInput, PostListQuery } from '@taiping/content-model/post'
import type { Paginated } from '@taiping/content-model/api'
import { deriveExcerpt, deriveReadingTime, renderMarkdownSafe } from '@taiping/renderer/markdown'
import { nowIso, slugify } from '@taiping/shared-utils'
import { newId } from '../lib/cache'
import { enqueueMirror } from '../lib/mirror'
import { hashPassword } from '../lib/crypto'

export interface PostRow {
  id: string
  slug: string
  type: 'post' | 'page'
  title: string
  content_md: string
  content_html: string
  excerpt: string | null
  cover: string | null
  status: 'draft' | 'published'
  published_at: string | null
  reading_time: string | null
  template: string | null
  sort_order: number
  encrypt: number
  encrypt_password_hash: string | null
  encrypt_hint: string | null
  encrypt_title: string | null
  encrypt_message: string | null
  created_at: string
  updated_at: string
}

export function rowToPost(row: PostRow): Post {
  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    title: row.title,
    contentMd: row.content_md,
    contentHtml: row.content_html,
    excerpt: row.excerpt ?? undefined,
    cover: row.cover ?? undefined,
    status: row.status,
    publishedAt: row.published_at ?? undefined,
    readingTime: row.reading_time ?? undefined,
    template: row.template ?? undefined,
    sortOrder: row.sort_order,
    encrypt: row.encrypt === 1,
    encryptPasswordHash: row.encrypt_password_hash ?? undefined,
    encryptHint: row.encrypt_hint ?? undefined,
    encryptTitle: row.encrypt_title ?? undefined,
    encryptMessage: row.encrypt_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listPosts(
  db: D1Database,
  query: PostListQuery,
): Promise<Paginated<Post & { categories: Array<{ id: string; name: string; slug: string }>; tags: Array<{ id: string; name: string; slug: string }> }>> {
  const where: string[] = []
  const binds: unknown[] = []
  if (query.status) {
    where.push('status = ?')
    binds.push(query.status)
  }
  if (query.type) {
    where.push('type = ?')
    binds.push(query.type)
  }
  if (query.q) {
    where.push('(title LIKE ? OR slug LIKE ? OR excerpt LIKE ?)')
    const like = `%${query.q}%`
    binds.push(like, like, like)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM posts ${whereSql}`)
    .bind(...binds)
    .first<{ total: number }>()
  const total = countRow?.total ?? 0
  const offset = (query.page - 1) * query.pageSize
  const rows = await db
    .prepare(
      `SELECT * FROM posts ${whereSql}
       ORDER BY COALESCE(published_at, created_at) DESC, sort_order ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, query.pageSize, offset)
    .all<PostRow>()

  const items = await Promise.all(rows.results.map(async (row) => {
    const post = rowToPost(row)
    const terms = await getPostTerms(db, post.id)
    return { ...post, ...terms }
  }))

  return { items, total, page: query.page, pageSize: query.pageSize }
}

export async function getPostById(db: D1Database, id: string): Promise<Post | null> {
  const row = await db.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<PostRow>()
  return row ? rowToPost(row) : null
}

export async function getPostBySlug(
  db: D1Database,
  slug: string,
  type?: 'post' | 'page',
): Promise<Post | null> {
  const row = type
    ? await db.prepare('SELECT * FROM posts WHERE slug = ? AND type = ?').bind(slug, type).first<PostRow>()
    : await db.prepare('SELECT * FROM posts WHERE slug = ?').bind(slug).first<PostRow>()
  return row ? rowToPost(row) : null
}

export async function getPublishedPosts(db: D1Database, type: 'post' | 'page' = 'post'): Promise<Post[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM posts WHERE status = 'published' AND type = ?
       ORDER BY COALESCE(published_at, created_at) DESC`,
    )
    .bind(type)
    .all<PostRow>()
  return rows.results.map(rowToPost)
}

export async function getPostTerms(db: D1Database, postId: string) {
  const rows = await db
    .prepare(
      `SELECT t.id, t.name, t.slug, t.type FROM post_terms pt
       JOIN terms t ON t.id = pt.term_id
       WHERE pt.post_id = ?
       ORDER BY t.type, t.name`,
    )
    .bind(postId)
    .all<{ id: string; name: string; slug: string; type: 'category' | 'tag' }>()
  const categories = rows.results.filter((r) => r.type === 'category').map(({ id, name, slug }) => ({ id, name, slug }))
  const tags = rows.results.filter((r) => r.type === 'tag').map(({ id, name, slug }) => ({ id, name, slug }))
  return { categories, tags }
}

async function resolveOrCreateTerms(
  db: D1Database,
  categoryIds: string[],
  tagNames: string[],
): Promise<string[]> {
  const ids: string[] = [...categoryIds]
  for (const name of tagNames) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const slug = slugify(trimmed, 'tag')
    const existing = await db
      .prepare('SELECT id FROM terms WHERE type = ? AND slug = ?')
      .bind('tag', slug)
      .first<{ id: string }>()
    if (existing) {
      ids.push(existing.id)
      continue
    }
    const id = newId('term')
    await db
      .prepare('INSERT INTO terms (id, type, name, slug) VALUES (?, ?, ?, ?)')
      .bind(id, 'tag', trimmed, slug)
      .run()
    ids.push(id)
  }
  return ids
}

async function syncPostTerms(db: D1Database, postId: string, termIds: string[]): Promise<void> {
  await db.prepare('DELETE FROM post_terms WHERE post_id = ?').bind(postId).run()
  if (!termIds.length) return
  const unique = [...new Set(termIds)]
  const statements = unique.map((termId) =>
    db.prepare('INSERT OR IGNORE INTO post_terms (post_id, term_id) VALUES (?, ?)').bind(postId, termId),
  )
  await db.batch(statements)
}

export async function createPost(db: D1Database, input: PostInput): Promise<Post> {
  const existing = await getPostBySlug(db, input.slug, input.type)
  if (existing) {
    throw Object.assign(new Error('slug already exists'), { code: 'CONFLICT' })
  }
  const id = newId('post')
  const now = nowIso()
  const contentHtml = renderMarkdownSafe(input.contentMd)
  const excerpt = input.excerpt?.trim() || deriveExcerpt(input.contentMd)
  const readingTime = deriveReadingTime(input.contentMd)
  const publishedAt =
    input.status === 'published' ? (input.publishedAt ?? now) : (input.publishedAt ?? null)
  const passwordHash = input.encrypt && input.encryptPassword
    ? await hashPassword(input.encryptPassword)
    : null

  await db
    .prepare(
      `INSERT INTO posts (
        id, slug, type, title, content_md, content_html, excerpt, cover, status,
        published_at, reading_time, template, sort_order,
        encrypt, encrypt_password_hash, encrypt_hint, encrypt_title, encrypt_message,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.slug,
      input.type,
      input.title,
      input.contentMd,
      contentHtml,
      excerpt,
      input.cover ?? null,
      input.status,
      publishedAt,
      readingTime,
      input.template ?? null,
      input.sortOrder,
      input.encrypt ? 1 : 0,
      passwordHash,
      input.encryptHint ?? null,
      input.encryptTitle ?? null,
      input.encryptMessage ?? null,
      now,
      now,
    )
    .run()

  const termIds = await resolveOrCreateTerms(db, input.categoryIds, input.tagNames)
  await syncPostTerms(db, id, termIds)
  await enqueueMirror(db, input.type === 'page' ? 'page' : 'post', id, 'upsert')

  const created = await getPostById(db, id)
  if (!created) throw new Error('create post failed')
  return created
}

export async function updatePost(db: D1Database, id: string, input: PostInput): Promise<Post> {
  const current = await getPostById(db, id)
  if (!current) {
    throw Object.assign(new Error('post not found'), { code: 'NOT_FOUND' })
  }
  if (input.slug !== current.slug || input.type !== current.type) {
    const clash = await getPostBySlug(db, input.slug, input.type)
    if (clash && clash.id !== id) {
      throw Object.assign(new Error('slug already exists'), { code: 'CONFLICT' })
    }
  }
  const now = nowIso()
  const contentHtml = renderMarkdownSafe(input.contentMd)
  const excerpt = input.excerpt?.trim() || deriveExcerpt(input.contentMd)
  const readingTime = deriveReadingTime(input.contentMd)
  let passwordHash = current.encryptPasswordHash ?? null
  if (!input.encrypt) {
    passwordHash = null
  } else if (input.encryptPassword) {
    passwordHash = await hashPassword(input.encryptPassword)
  }
  const publishedAt =
    input.status === 'published'
      ? (input.publishedAt ?? current.publishedAt ?? now)
      : (input.publishedAt ?? current.publishedAt ?? null)

  await db
    .prepare(
      `UPDATE posts SET
        slug = ?, type = ?, title = ?, content_md = ?, content_html = ?, excerpt = ?, cover = ?,
        status = ?, published_at = ?, reading_time = ?, template = ?, sort_order = ?,
        encrypt = ?, encrypt_password_hash = ?, encrypt_hint = ?, encrypt_title = ?, encrypt_message = ?,
        updated_at = ?
      WHERE id = ?`,
    )
    .bind(
      input.slug,
      input.type,
      input.title,
      input.contentMd,
      contentHtml,
      excerpt,
      input.cover ?? null,
      input.status,
      publishedAt,
      readingTime,
      input.template ?? null,
      input.sortOrder,
      input.encrypt ? 1 : 0,
      passwordHash,
      input.encryptHint ?? null,
      input.encryptTitle ?? null,
      input.encryptMessage ?? null,
      now,
      id,
    )
    .run()

  const termIds = await resolveOrCreateTerms(db, input.categoryIds, input.tagNames)
  await syncPostTerms(db, id, termIds)
  await enqueueMirror(db, current.type === 'page' ? 'page' : 'post', id, 'upsert')

  const updated = await getPostById(db, id)
  if (!updated) throw new Error('update post failed')
  return updated
}

export async function deletePost(db: D1Database, id: string): Promise<void> {
  const current = await getPostById(db, id)
  if (!current) {
    throw Object.assign(new Error('post not found'), { code: 'NOT_FOUND' })
  }
  await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run()
  await enqueueMirror(db, current.type === 'page' ? 'page' : 'post', id, 'delete')
}

export async function setPostStatus(
  db: D1Database,
  id: string,
  status: 'draft' | 'published',
): Promise<Post> {
  const current = await getPostById(db, id)
  if (!current) {
    throw Object.assign(new Error('post not found'), { code: 'NOT_FOUND' })
  }
  const terms = await getPostTerms(db, id)
  return updatePost(db, id, {
    slug: current.slug,
    type: current.type,
    title: current.title,
    contentMd: current.contentMd,
    excerpt: current.excerpt,
    cover: current.cover,
    status,
    publishedAt: status === 'published' ? (current.publishedAt ?? nowIso()) : current.publishedAt,
    template: current.template,
    sortOrder: current.sortOrder,
    encrypt: current.encrypt,
    encryptHint: current.encryptHint,
    encryptTitle: current.encryptTitle,
    encryptMessage: current.encryptMessage,
    categoryIds: terms.categories.map((c) => c.id),
    tagNames: terms.tags.map((t) => t.name),
  })
}

export async function countPosts(db: D1Database): Promise<{ posts: number; pages: number; drafts: number }> {
  const row = await db
    .prepare(
      `SELECT
        SUM(CASE WHEN type = 'post' AND status = 'published' THEN 1 ELSE 0 END) as posts,
        SUM(CASE WHEN type = 'page' AND status = 'published' THEN 1 ELSE 0 END) as pages,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as drafts
      FROM posts`,
    )
    .first<{ posts: number | null; pages: number | null; drafts: number | null }>()
  return {
    posts: row?.posts ?? 0,
    pages: row?.pages ?? 0,
    drafts: row?.drafts ?? 0,
  }
}
