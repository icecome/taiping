import type { D1Database } from '@cloudflare/workers-types'
import type { Comment, CommentCreate, CommentListQuery } from '@taiping/content-model/comment'
import type { Paginated } from '@taiping/content-model/api'
import { renderMarkdownSafe } from '@taiping/renderer/markdown'
import { nowIso } from '@taiping/shared-utils'
import { newId } from '../lib/cache'
import { enqueueMirror } from '../lib/mirror'

interface CommentRow {
  id: string
  target_type: 'guestbook' | 'post' | 'moment'
  target_id: string
  parent_id: string | null
  nickname: string
  email: string | null
  website: string | null
  content_md: string
  content_html: string
  status: 'pending' | 'approved' | 'spam'
  is_featured: number
  ip_hash: string | null
  user_agent: string | null
  created_at: string
}

function rowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    parentId: row.parent_id ?? undefined,
    nickname: row.nickname,
    email: row.email ?? '',
    website: row.website ?? undefined,
    contentMd: row.content_md,
    contentHtml: row.content_html,
    status: row.status,
    isFeatured: row.is_featured === 1,
    ipHash: row.ip_hash ?? undefined,
    userAgent: row.user_agent ?? undefined,
    createdAt: row.created_at,
  }
}

export interface CommentModerationPolicy {
  requireModeration: boolean
  whitelist: boolean
  checkReferer: boolean
  postInterval: number
  stopWords: string
  ipBlackList: string
  siteUrl?: string
}

export const defaultCommentPolicy: CommentModerationPolicy = {
  requireModeration: true,
  whitelist: true,
  checkReferer: false,
  postInterval: 60,
  stopWords: '',
  ipBlackList: '',
}

export class CommentRejectedError extends Error {
  readonly code: 'RATE_LIMITED' | 'FORBIDDEN' | 'VALIDATION_FAILED'
  constructor(
    code: CommentRejectedError['code'],
    message: string,
  ) {
    super(message)
    this.code = code
  }
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function hitStopWords(content: string, stopWords: string): boolean {
  const list = splitLines(stopWords)
  const lower = content.toLowerCase()
  return list.some((w) => w && lower.includes(w.toLowerCase()))
}

export async function resolveCommentStatus(
  db: D1Database,
  input: CommentCreate,
  meta: { ipHash?: string; rawIp?: string },
  policy: CommentModerationPolicy,
): Promise<'pending' | 'approved' | 'spam'> {
  const blackList = splitLines(policy.ipBlackList)
  if (meta.rawIp && blackList.includes(meta.rawIp)) {
    throw new CommentRejectedError('FORBIDDEN', '提交被拒绝')
  }
  if (hitStopWords(input.content, policy.stopWords)) {
    return 'spam'
  }
  if (policy.postInterval > 0 && meta.ipHash) {
    const recent = await db
      .prepare(
        `SELECT created_at FROM comments WHERE ip_hash = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(meta.ipHash)
      .first<{ created_at: string }>()
    if (recent?.created_at) {
      const gap = (Date.now() - Date.parse(recent.created_at)) / 1000
      if (gap < policy.postInterval) {
        throw new CommentRejectedError('RATE_LIMITED', '提交过于频繁，请稍后再试')
      }
    }
  }
  if (policy.whitelist) {
    const email = input.email?.trim() || ''
    const nickname = input.nickname.trim()
    if (email || nickname) {
      const approved = await db
        .prepare(
          `SELECT id FROM comments WHERE status = 'approved' AND (email = ? OR nickname = ?) LIMIT 1`,
        )
        .bind(email, nickname)
        .first<{ id: string }>()
      if (approved) return 'approved'
    }
  }
  return policy.requireModeration ? 'pending' : 'approved'
}

export async function createComment(
  db: D1Database,
  input: CommentCreate,
  meta: { ipHash?: string; userAgent?: string; rawIp?: string },
  policy: CommentModerationPolicy = defaultCommentPolicy,
): Promise<Comment> {
  const id = newId('cmt')
  const now = nowIso()
  const contentHtml = renderMarkdownSafe(input.content)
  const status = await resolveCommentStatus(db, input, meta, policy)
  await db
    .prepare(
      `INSERT INTO comments (
        id, target_type, target_id, parent_id, nickname, email, website,
        content_md, content_html, status, is_featured, ip_hash, user_agent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .bind(
      id,
      input.targetType,
      input.targetId,
      input.parentId ?? null,
      input.nickname,
      input.email || null,
      input.website || null,
      input.content,
      contentHtml,
      status,
      meta.ipHash ?? null,
      meta.userAgent ?? null,
      now,
    )
    .run()
  const created = await getCommentById(db, id)
  if (!created) throw new Error('create comment failed')
  return created
}

export async function getCommentById(db: D1Database, id: string): Promise<Comment | null> {
  const row = await db.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first<CommentRow>()
  return row ? rowToComment(row) : null
}

export async function listComments(
  db: D1Database,
  query: CommentListQuery,
): Promise<Paginated<Comment>> {
  const where: string[] = []
  const binds: unknown[] = []
  if (query.status) {
    where.push('status = ?')
    binds.push(query.status)
  }
  if (query.targetType) {
    where.push('target_type = ?')
    binds.push(query.targetType)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM comments ${whereSql}`)
    .bind(...binds)
    .first<{ total: number }>()
  const offset = (query.page - 1) * query.pageSize
  const rows = await db
    .prepare(
      `SELECT * FROM comments ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...binds, query.pageSize, offset)
    .all<CommentRow>()
  return {
    items: rows.results.map(rowToComment),
    total: countRow?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  }
}

export async function listPublicComments(
  db: D1Database,
  targetType: Comment['targetType'],
  targetId: string,
  opts: { featuredOnly?: boolean } = {},
): Promise<Comment[]> {
  const featuredSql = opts.featuredOnly ? 'AND is_featured = 1' : ''
  const rows = await db
    .prepare(
      `SELECT * FROM comments
       WHERE target_type = ? AND target_id = ? AND status = 'approved' ${featuredSql}
       ORDER BY created_at ASC`,
    )
    .bind(targetType, targetId)
    .all<CommentRow>()
  return rows.results.map(rowToComment)
}

export async function moderateComment(
  db: D1Database,
  id: string,
  action: 'approve' | 'spam' | 'pending' | 'feature' | 'unfeature' | 'delete',
): Promise<void> {
  const current = await getCommentById(db, id)
  if (!current) {
    throw Object.assign(new Error('comment not found'), { code: 'NOT_FOUND' })
  }
  if (action === 'delete') {
    await db.prepare('DELETE FROM comments WHERE id = ?').bind(id).run()
    return
  }
  if (action === 'feature' || action === 'unfeature') {
    await db
      .prepare('UPDATE comments SET is_featured = ? WHERE id = ?')
      .bind(action === 'feature' ? 1 : 0, id)
      .run()
    return
  }
  await db.prepare('UPDATE comments SET status = ? WHERE id = ?').bind(action, id).run()
  if (action === 'approve') {
    await enqueueMirror(db, current.targetType === 'post' ? 'post' : 'moment', current.targetId, 'upsert')
  }
}

export async function countComments(db: D1Database): Promise<{ pending: number; approved: number; spam: number }> {
  const rows = await db
    .prepare('SELECT status, COUNT(*) as count FROM comments GROUP BY status')
    .all<{ status: string; count: number }>()
  const map = new Map(rows.results.map((r) => [r.status, Number(r.count)]))
  return {
    pending: map.get('pending') ?? 0,
    approved: map.get('approved') ?? 0,
    spam: map.get('spam') ?? 0,
  }
}
