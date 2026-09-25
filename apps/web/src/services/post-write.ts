import type { Post } from '@taiping/content-model'
import { nowIso } from '@taiping/shared-utils'
import { preparePostContent, type PostRow } from './posts'

export type PostInput = {
  title: string
  slug: string
  text: string
  status?: Post['status']
  password?: string | null
  allowComment?: boolean
  pinned?: boolean
  cover?: string
  excerpt?: string
  template?: string | null
  publishedAt?: string | null
  categories?: string[]
  tags?: string[]
}

function archiveParts(iso: string): { year: string; month: string } {
  const d = new Date(iso)
  return {
    year: String(d.getFullYear()),
    month: String(d.getMonth() + 1).padStart(2, '0'),
  }
}

async function syncMetas(db: D1Database, postId: number, names: string[], type: 'category' | 'tag'): Promise<void> {
  await db.prepare(`DELETE FROM relationships WHERE post_id = ?`).bind(postId).run()
  for (const name of names) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const slug = trimmed.toLowerCase().replace(/\s+/g, '-')
    await db
      .prepare(
        `INSERT INTO metas (type, name, slug, description, count, order_num, parent)
         VALUES (?, ?, ?, '', 0, 0, 0)
         ON CONFLICT(type, slug) DO UPDATE SET name = excluded.name`,
      )
      .bind(type, trimmed, slug)
      .run()
    const meta = await db
      .prepare(`SELECT id FROM metas WHERE type = ? AND slug = ?`)
      .bind(type, slug)
      .first<{ id: number }>()
    if (meta) {
      await db
        .prepare(`INSERT OR IGNORE INTO relationships (post_id, meta_id) VALUES (?, ?)`)
        .bind(postId, meta.id)
        .run()
    }
  }
}

export async function createPost(db: D1Database, authorId: number, input: PostInput): Promise<number> {
  const now = nowIso()
  const publishedAt = input.status === 'published' ? (input.publishedAt || now) : (input.publishedAt ?? null)
  const content = preparePostContent(input.text)
  const { year, month } = archiveParts(publishedAt || now)

  const result = await db
    .prepare(
      `INSERT INTO posts (
        type, title, slug, text, html, status, password, author_id, template,
        allow_comment, allow_feed, comments_num, pinned, order_num, parent,
        cover, excerpt, reading_time, visible, deleted,
        archive_year, archive_month, created_at, modified_at, published_at
      ) VALUES (
        'post', ?, ?, ?, ?, ?, ?, ?, ?,
        ?, 1, 0, ?, 0, 0,
        ?, ?, ?, 'public', 0,
        ?, ?, ?, ?, ?
      )`,
    )
    .bind(
      input.title,
      input.slug,
      input.text,
      content.html,
      input.status || 'draft',
      input.password || null,
      authorId,
      input.template || null,
      input.allowComment === false ? 0 : 1,
      input.pinned ? 1 : 0,
      input.cover || '',
      input.excerpt || content.excerpt,
      content.readingTime,
      year,
      month,
      now,
      now,
      publishedAt,
    )
    .run()

  const postId = Number(result.meta.last_row_id)
  await syncMetas(db, postId, input.categories ?? [], 'category')
  await syncMetas(db, postId, input.tags ?? [], 'tag')
  return postId
}

export async function updatePost(db: D1Database, id: number, input: Partial<PostInput>): Promise<void> {
  const existing = await db.prepare(`SELECT * FROM posts WHERE id = ?`).bind(id).first<PostRow>()
  if (!existing) throw new Error('Post not found')

  const text = input.text ?? existing.text
  const content = input.text !== undefined ? preparePostContent(text) : null
  const status = input.status ?? (existing.status as Post['status'])
  const publishedAt =
    input.publishedAt !== undefined
      ? input.publishedAt
      : status === 'published' && !existing.published_at
        ? nowIso()
        : existing.published_at
  const archive = archiveParts(publishedAt || existing.created_at)
  const modifiedAt = nowIso()

  await db
    .prepare(
      `UPDATE posts SET
        title = ?, slug = ?, text = ?, html = ?, status = ?, password = ?, template = ?,
        allow_comment = ?, pinned = ?, cover = ?, excerpt = ?, reading_time = ?,
        archive_year = ?, archive_month = ?, modified_at = ?, published_at = ?
       WHERE id = ?`,
    )
    .bind(
      input.title ?? existing.title,
      input.slug ?? existing.slug,
      text,
      content?.html ?? existing.html,
      status,
      input.password !== undefined ? input.password : existing.password,
      input.template !== undefined ? input.template : existing.template,
      input.allowComment === undefined ? existing.allow_comment : input.allowComment ? 1 : 0,
      input.pinned === undefined ? existing.pinned : input.pinned ? 1 : 0,
      input.cover ?? existing.cover,
      input.excerpt ?? content?.excerpt ?? existing.excerpt,
      content?.readingTime ?? existing.reading_time,
      archive.year,
      archive.month,
      modifiedAt,
      publishedAt,
      id,
    )
    .run()

  if (input.categories) await syncMetas(db, id, input.categories, 'category')
  if (input.tags) await syncMetas(db, id, input.tags, 'tag')
}

export async function softDeletePost(db: D1Database, id: number): Promise<void> {
  await db.prepare(`UPDATE posts SET deleted = 1, modified_at = ? WHERE id = ?`).bind(nowIso(), id).run()
}
