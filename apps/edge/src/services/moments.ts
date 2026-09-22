import type { D1Database } from '@cloudflare/workers-types'
import type { Moment, MomentInput, MomentListQuery } from '@taiping/content-model/moment'
import type { Paginated } from '@taiping/content-model/api'
import { renderMarkdownSafe } from '@taiping/renderer/markdown'
import { nowIso } from '@taiping/shared-utils'
import { newId } from '../lib/cache'
import { enqueueMirror } from '../lib/mirror'

interface MomentRow {
  id: string
  content_md: string
  content_html: string
  pictures: string
  video_url: string | null
  link_url: string | null
  link_text: string | null
  author: string
  status: 'draft' | 'published'
  tag_names: string
  created_at: string
}

function rowToMoment(row: MomentRow): Moment {
  let pictures: Moment['pictures'] = []
  let tagNames: string[] = []
  try {
    pictures = JSON.parse(row.pictures) as Moment['pictures']
  } catch {
    pictures = []
  }
  try {
    tagNames = JSON.parse(row.tag_names) as string[]
  } catch {
    tagNames = []
  }
  return {
    id: row.id,
    contentMd: row.content_md,
    contentHtml: row.content_html,
    pictures,
    videoUrl: row.video_url ?? undefined,
    linkUrl: row.link_url ?? undefined,
    linkText: row.link_text ?? undefined,
    author: row.author,
    status: row.status,
    tagNames,
    createdAt: row.created_at,
  }
}

export async function listMoments(db: D1Database, query: MomentListQuery): Promise<Paginated<Moment>> {
  const where: string[] = []
  const binds: unknown[] = []
  if (query.status) {
    where.push('status = ?')
    binds.push(query.status)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM moments ${whereSql}`)
    .bind(...binds)
    .first<{ total: number }>()
  const offset = (query.page - 1) * query.pageSize
  const rows = await db
    .prepare(`SELECT * FROM moments ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, query.pageSize, offset)
    .all<MomentRow>()
  return {
    items: rows.results.map(rowToMoment),
    total: countRow?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  }
}

export async function listPublishedMoments(db: D1Database, limit = 50): Promise<Moment[]> {
  const rows = await db
    .prepare(`SELECT * FROM moments WHERE status = 'published' ORDER BY created_at DESC LIMIT ?`)
    .bind(limit)
    .all<MomentRow>()
  return rows.results.map(rowToMoment)
}

export async function getMomentById(db: D1Database, id: string): Promise<Moment | null> {
  const row = await db.prepare('SELECT * FROM moments WHERE id = ?').bind(id).first<MomentRow>()
  return row ? rowToMoment(row) : null
}

export async function createMoment(db: D1Database, input: MomentInput): Promise<Moment> {
  const id = newId('mom')
  const now = nowIso()
  const contentHtml = renderMarkdownSafe(input.contentMd)
  await db
    .prepare(
      `INSERT INTO moments (
        id, content_md, content_html, pictures, video_url, link_url, link_text,
        author, status, tag_names, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.contentMd,
      contentHtml,
      JSON.stringify(input.pictures),
      input.videoUrl || null,
      input.linkUrl || null,
      input.linkText || null,
      input.author || '',
      input.status,
      JSON.stringify(input.tagNames),
      now,
    )
    .run()
  await enqueueMirror(db, 'moment', id, 'upsert')
  const created = await getMomentById(db, id)
  if (!created) throw new Error('create moment failed')
  return created
}

export async function updateMoment(db: D1Database, id: string, input: MomentInput): Promise<Moment> {
  const current = await getMomentById(db, id)
  if (!current) {
    throw Object.assign(new Error('moment not found'), { code: 'NOT_FOUND' })
  }
  const contentHtml = renderMarkdownSafe(input.contentMd)
  await db
    .prepare(
      `UPDATE moments SET
        content_md = ?, content_html = ?, pictures = ?, video_url = ?, link_url = ?, link_text = ?,
        author = ?, status = ?, tag_names = ?
      WHERE id = ?`,
    )
    .bind(
      input.contentMd,
      contentHtml,
      JSON.stringify(input.pictures),
      input.videoUrl || null,
      input.linkUrl || null,
      input.linkText || null,
      input.author || current.author,
      input.status,
      JSON.stringify(input.tagNames),
      id,
    )
    .run()
  await enqueueMirror(db, 'moment', id, 'upsert')
  const updated = await getMomentById(db, id)
  if (!updated) throw new Error('update moment failed')
  return updated
}

export async function deleteMoment(db: D1Database, id: string): Promise<void> {
  const current = await getMomentById(db, id)
  if (!current) {
    throw Object.assign(new Error('moment not found'), { code: 'NOT_FOUND' })
  }
  await db.prepare('DELETE FROM moments WHERE id = ?').bind(id).run()
  await enqueueMirror(db, 'moment', id, 'delete')
}

export async function countMoments(db: D1Database): Promise<{ published: number; draft: number }> {
  const row = await db
    .prepare(
      `SELECT
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft
      FROM moments`,
    )
    .first<{ published: number | null; draft: number | null }>()
  return { published: row?.published ?? 0, draft: row?.draft ?? 0 }
}
