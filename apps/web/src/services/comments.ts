import type { Comment } from '@taiping/content-model'
import { nowIso } from '@taiping/shared-utils'
import { renderCommentHtml } from '../lib/markdown'

type CommentRow = {
  id: number
  post_id: number
  parent: number
  target_type: string
  target_id: string
  author: string
  mail: string
  url: string
  text: string
  html: string
  status: string
  is_featured: number
  created_at: string
}

function rowToComment(row: CommentRow, replies: Comment['replies'] = []): Comment {
  return {
    id: String(row.id),
    targetType: row.target_type as Comment['targetType'],
    targetId: row.target_id || String(row.post_id),
    parentId: row.parent ? String(row.parent) : null,
    nickname: row.author,
    email: row.mail || undefined,
    website: row.url || undefined,
    content: row.text,
    contentHtml: row.html,
    status: row.status as Comment['status'],
    isFeatured: Boolean(row.is_featured),
    createdAt: row.created_at,
    replies,
  }
}

export async function listComments(
  db: D1Database,
  targetType: string,
  targetId: string,
  opts: { status?: string } = {},
): Promise<Comment[]> {
  const status = opts.status ?? 'approved'
  const rows = await db
    .prepare(
      `SELECT * FROM comments WHERE target_type = ? AND target_id = ? AND status = ? AND parent = 0
       ORDER BY is_featured DESC, created_at DESC`,
    )
    .bind(targetType, targetId, status)
    .all<CommentRow>()

  const result: Comment[] = []
  for (const row of rows.results ?? []) {
    const childRows = await db
      .prepare(
        `SELECT * FROM comments WHERE parent = ? AND status = ? ORDER BY created_at ASC`,
      )
      .bind(row.id, status)
      .all<CommentRow>()
    const replies: Comment['replies'] = (childRows.results ?? []).map((r) => ({
      id: String(r.id),
      contentHtml: r.html,
      replyType: r.author === 'admin' ? '博主' : '回复',
      replyFromEmail: r.mail,
      createdAt: r.created_at,
    }))
    result.push(rowToComment(row, replies))
  }
  return result
}

export type CreateCommentInput = {
  targetType: Comment['targetType']
  targetId: string
  nickname: string
  email?: string
  website?: string
  content: string
  parentId?: string | null
  ip?: string
  agent?: string
}

export async function createComment(db: D1Database, input: CreateCommentInput): Promise<number> {
  const html = renderCommentHtml(input.content)
  const result = await db
    .prepare(
      `INSERT INTO comments (
        post_id, parent, target_type, target_id, author, mail, url, ip, agent,
        text, html, status, is_featured, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', 0, ?)`,
    )
    .bind(
      input.targetType === 'post' ? Number(input.targetId) : 0,
      input.parentId ? Number(input.parentId) : 0,
      input.targetType,
      input.targetId,
      input.nickname,
      input.email || '',
      input.website || '',
      input.ip || '',
      input.agent || '',
      input.content,
      html,
      nowIso(),
    )
    .run()
  return Number(result.meta.last_row_id)
}
