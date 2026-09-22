import type { D1Database } from '@cloudflare/workers-types'
import type {
  Comment,
  CommentCreate,
  CommentListQuery,
  CommentReply,
} from '@taiping/content-model/comment'
import type { Paginated } from '@taiping/content-model/api'
import { renderMarkdownSafe } from '@taiping/renderer/markdown'
import { nowIso } from '@taiping/shared-utils'
import type { Env } from '../env'
import { newId } from '../lib/cache'
import { enqueueMirror } from '../lib/mirror'
import { getSettings } from '../lib/settings'
import { sendCommentReplyEmail } from '../lib/mail'

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
  if (query.keyword) {
    where.push('(nickname LIKE ? OR email LIKE ? OR content_md LIKE ?)')
    const like = `%${query.keyword}%`
    binds.push(like, like, like)
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

/** 评论 + 其回复时间线（前台展示用） */
export async function listPublicCommentsWithReplies(
  db: D1Database,
  targetType: Comment['targetType'],
  targetId: string,
  opts: { featuredOnly?: boolean } = {},
): Promise<Array<Comment & { replies: CommentReply[] }>> {
  const items = await listPublicComments(db, targetType, targetId, opts)
  const replies = await listRepliesForComments(
    db,
    items.map((item) => item.id),
  )
  return items.map((item) => ({ ...item, replies: replies.get(item.id) ?? [] }))
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

// ===== 回复（多轮对话）=====

interface ReplyRow {
  id: string
  comment_id: string
  content_md: string
  content_html: string
  reply_type: '博主' | '邮箱回信'
  reply_from_email: string | null
  created_at: string
}

function rowToReply(row: ReplyRow): CommentReply {
  return {
    id: row.id,
    commentId: row.comment_id,
    contentMd: row.content_md,
    contentHtml: row.content_html,
    replyType: row.reply_type,
    replyFromEmail: row.reply_from_email ?? '',
    createdAt: row.created_at,
  }
}

/** 生成回信令牌：仅需不可猜测，无需哈希（需可读取以构造 Reply-To） */
function generateReplyToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

export async function listReplies(db: D1Database, commentId: string): Promise<CommentReply[]> {
  const rows = await db
    .prepare('SELECT * FROM comment_replies WHERE comment_id = ? ORDER BY created_at ASC')
    .bind(commentId)
    .all<ReplyRow>()
  return rows.results.map(rowToReply)
}

/** 批量读取多条评论的回复，供列表页避免 N+1 */
export async function listRepliesForComments(
  db: D1Database,
  commentIds: string[],
): Promise<Map<string, CommentReply[]>> {
  const map = new Map<string, CommentReply[]>()
  if (!commentIds.length) return map
  const placeholders = commentIds.map(() => '?').join(',')
  const rows = await db
    .prepare(
      `SELECT * FROM comment_replies WHERE comment_id IN (${placeholders})
       ORDER BY created_at ASC`,
    )
    .bind(...commentIds)
    .all<ReplyRow>()
  for (const row of rows.results) {
    const list = map.get(row.comment_id) ?? []
    list.push(rowToReply(row))
    map.set(row.comment_id, list)
  }
  return map
}

export interface AddReplyResult {
  reply: CommentReply
  /** 需要发送的通知邮件（调用方用 waitUntil，失败不阻塞） */
  notify: Promise<void> | null
}

/**
 * 新增博主回复。
 * 首次回复时生成 reply_token 供 Reply-To 使用，使访客可直接回信。
 */
export async function addAdminReply(
  db: D1Database,
  env: Env,
  commentId: string,
  content: string,
): Promise<AddReplyResult> {
  const comment = await getCommentById(db, commentId)
  if (!comment) {
    throw Object.assign(new Error('comment not found'), { code: 'NOT_FOUND' })
  }

  const trimmed = content.trim()
  if (!trimmed) {
    throw Object.assign(new Error('reply content required'), { code: 'VALIDATION_FAILED' })
  }

  const id = newId('rpl')
  const now = nowIso()
  const contentHtml = renderMarkdownSafe(trimmed)

  // 读取既有 token，没有则生成（同一评论的多轮对话复用同一 token）
  const row = await db
    .prepare('SELECT reply_token FROM comments WHERE id = ?')
    .bind(commentId)
    .first<{ reply_token: string | null }>()
  const token = row?.reply_token || generateReplyToken()

  await db.batch([
    db
      .prepare(
        `INSERT INTO comment_replies
         (id, comment_id, content_md, content_html, reply_type, reply_from_email, created_at)
         VALUES (?, ?, ?, ?, '博主', '', ?)`,
      )
      .bind(id, commentId, trimmed, contentHtml, now),
    db.prepare('UPDATE comments SET reply_token = ? WHERE id = ?').bind(token, commentId),
  ])

  const created = await db
    .prepare('SELECT * FROM comment_replies WHERE id = ?')
    .bind(id)
    .first<ReplyRow>()
  if (!created) throw new Error('create reply failed')

  // 访客留了邮箱才发通知
  let notify: Promise<void> | null = null
  if (comment.email) {
    const settings = await getSettings(db)
    const origin = settings.url || ''
    const pageUrl = origin
      ? `${origin.replace(/\/$/, '')}${commentPagePath(comment)}`
      : commentPagePath(comment)
    notify = sendCommentReplyEmail(
      env,
      comment.email,
      trimmed,
      comment.contentMd,
      commentPageTitle(comment),
      pageUrl,
      settings.title || '博客',
      token,
    ).then(() => undefined)
  }

  return { reply: rowToReply(created), notify }
}

/** 按评论归属推导前台路径 */
function commentPagePath(comment: Comment): string {
  if (comment.targetType === 'guestbook') return '/guestbook'
  if (comment.targetType === 'moment') return '/moments'
  return `/posts/${comment.targetId}`
}

function commentPageTitle(comment: Comment): string {
  if (comment.targetType === 'guestbook') return '留言板'
  if (comment.targetType === 'moment') return '说说'
  return '文章'
}

export async function deleteReply(
  db: D1Database,
  commentId: string,
  replyId: string,
): Promise<void> {
  const row = await db
    .prepare('SELECT id FROM comment_replies WHERE id = ? AND comment_id = ?')
    .bind(replyId, commentId)
    .first<{ id: string }>()
  if (!row) {
    throw Object.assign(new Error('reply not found'), { code: 'NOT_FOUND' })
  }
  await db.prepare('DELETE FROM comment_replies WHERE id = ?').bind(replyId).run()
}

/** 更新一条博主回复的内容（仅允许改博主回复，不改访客回信） */
export async function updateAdminReply(
  db: D1Database,
  commentId: string,
  replyId: string,
  content: string,
): Promise<CommentReply> {
  const trimmed = content.trim()
  if (!trimmed) {
    throw Object.assign(new Error('reply content required'), { code: 'VALIDATION_FAILED' })
  }
  const row = await db
    .prepare('SELECT * FROM comment_replies WHERE id = ? AND comment_id = ?')
    .bind(replyId, commentId)
    .first<ReplyRow>()
  if (!row) {
    throw Object.assign(new Error('reply not found'), { code: 'NOT_FOUND' })
  }
  if (row.reply_type !== '博主') {
    throw Object.assign(new Error('cannot edit email reply'), { code: 'FORBIDDEN' })
  }
  const contentHtml = renderMarkdownSafe(trimmed)
  await db
    .prepare('UPDATE comment_replies SET content_md = ?, content_html = ? WHERE id = ?')
    .bind(trimmed, contentHtml, replyId)
    .run()
  const updated = await db
    .prepare('SELECT * FROM comment_replies WHERE id = ?')
    .bind(replyId)
    .first<ReplyRow>()
  return rowToReply(updated ?? row)
}

// ===== 入站回信（由 webhook 调用）=====

/**
 * 按回信令牌查找评论。
 * 同时返回访客邮箱用于校验发件人，避免他人冒名回信。
 */
export async function findCommentByReplyToken(
  db: D1Database,
  token: string,
): Promise<Comment | null> {
  if (!token) return null
  const row = await db
    .prepare('SELECT * FROM comments WHERE reply_token = ? LIMIT 1')
    .bind(token)
    .first<CommentRow>()
  return row ? rowToComment(row) : null
}

/** 追加一条访客回信（不触发邮件，避免自己给自己发信） */
export async function appendEmailReply(
  db: D1Database,
  commentId: string,
  content: string,
  fromEmail: string,
): Promise<CommentReply> {
  const trimmed = content.trim()
  if (!trimmed) {
    throw Object.assign(new Error('empty reply'), { code: 'VALIDATION_FAILED' })
  }
  const id = newId('rpl')
  const now = nowIso()
  const contentHtml = renderMarkdownSafe(trimmed)
  await db
    .prepare(
      `INSERT INTO comment_replies
       (id, comment_id, content_md, content_html, reply_type, reply_from_email, created_at)
       VALUES (?, ?, ?, ?, '邮箱回信', ?, ?)`,
    )
    .bind(id, commentId, trimmed, contentHtml, fromEmail, now)
    .run()
  return {
    id,
    commentId,
    contentMd: trimmed,
    contentHtml,
    replyType: '邮箱回信',
    replyFromEmail: fromEmail,
    createdAt: now,
  }
}
