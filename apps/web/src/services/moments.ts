import type { Moment } from '@taiping/content-model'
import { nowIso } from '@taiping/shared-utils'
import { renderMarkdown } from '../lib/markdown'

type MomentRow = {
  id: number
  content: string
  html: string
  author: string
  pictures: string
  video_url: string
  link_url: string
  link_text: string
  tags: string
  created_at: string
}

function rowToMoment(row: MomentRow): Moment {
  let pictures: Moment['pictures'] = []
  let tagNames: string[] = []
  try {
    pictures = JSON.parse(row.pictures || '[]') as Moment['pictures']
  } catch {
    pictures = []
  }
  try {
    tagNames = JSON.parse(row.tags || '[]') as string[]
  } catch {
    tagNames = []
  }
  return {
    id: String(row.id),
    content: row.content,
    contentHtml: row.html,
    author: row.author || undefined,
    pictures,
    videoUrl: row.video_url || undefined,
    linkUrl: row.link_url || undefined,
    linkText: row.link_text || undefined,
    tagNames,
    createdAt: row.created_at,
  }
}

export async function listMoments(db: D1Database, limit = 50): Promise<Moment[]> {
  const rows = await db
    .prepare(`SELECT * FROM moments ORDER BY created_at DESC LIMIT ?`)
    .bind(limit)
    .all<MomentRow>()
  return (rows.results ?? []).map(rowToMoment)
}

export async function createMoment(
  db: D1Database,
  input: {
    content: string
    author?: string
    pictures?: Moment['pictures']
    videoUrl?: string
    linkUrl?: string
    linkText?: string
    tagNames?: string[]
  },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO moments (content, html, author, pictures, video_url, link_url, link_text, tags, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.content,
      renderMarkdown(input.content),
      input.author || '',
      JSON.stringify(input.pictures ?? []),
      input.videoUrl || '',
      input.linkUrl || '',
      input.linkText || '',
      JSON.stringify(input.tagNames ?? []),
      nowIso(),
    )
    .run()
  return Number(result.meta.last_row_id)
}
