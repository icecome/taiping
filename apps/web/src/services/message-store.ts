import type { CreateMessageInput, MessageRow, PublicMessage, ReplyRow } from './messages'
import { PUBLIC_MESSAGE_FIELDS } from './messages'
import { nowIso } from '@taiping/shared-utils'

const RATE_ACTION = 'submit_message'
const IP_LIMIT = 10
const IP_WINDOW = 60

export async function checkRateLimit(
  db: D1Database,
  identifier: string,
  limit = IP_LIMIT,
  windowSec = IP_WINDOW,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowSec * 1000).toISOString()
  const row = await db
    .prepare(
      `SELECT id, count, window_start FROM rate_limits
       WHERE identifier = ? AND action_type = ? AND window_start >= ?`,
    )
    .bind(identifier, RATE_ACTION, windowStart)
    .first<{ id: number; count: number }>()

  if (!row) {
    await db
      .prepare(`INSERT INTO rate_limits (identifier, action_type, count, window_start) VALUES (?, ?, 1, ?)`)
      .bind(identifier, RATE_ACTION, nowIso())
      .run()
    return true
  }

  if (row.count >= limit) return false
  await db
    .prepare(`UPDATE rate_limits SET count = count + 1 WHERE id = ?`)
    .bind(row.id)
    .run()
  return true
}

export async function createMessage(
  db: D1Database,
  input: CreateMessageInput,
  meta: { ip: string; agent: string },
): Promise<number> {
  const name = input.visitor_name.trim()
  const content = input.content.trim()
  if (!name || !content || !input.page_url) {
    throw new Error('name/content/page_url required')
  }

  const result = await db
    .prepare(
      `INSERT INTO messages (
        visitor_name, visitor_email, visitor_website, visitor_ip, user_agent, client_hash,
        content, quoted_text, page_url, page_title, status, needs_review,
        target_type, target_id, parent_id
      ) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
    )
    .bind(
      name,
      input.visitor_email || '',
      input.visitor_website || '',
      meta.ip,
      meta.agent,
      content,
      input.quoted_text || '',
      input.page_url,
      input.page_title || '',
      input.target_type || 'guestbook',
      input.target_id || '',
      input.parent_id || 0,
    )
    .run()
  return Number(result.meta.last_row_id)
}

async function attachReplies(db: D1Database, messages: MessageRow[]): Promise<PublicMessage[]> {
  if (!messages.length) return []
  const ids = messages.map((m) => m.id)
  const placeholders = ids.map(() => '?').join(',')
  const rows = await db
    .prepare(
      `SELECT id, message_id, reply_content, reply_type, reply_from_email, created_at
       FROM replies WHERE message_id IN (${placeholders}) ORDER BY id ASC`,
    )
    .bind(...ids)
    .all<ReplyRow>()

  const byMessage = new Map<number, ReplyRow[]>()
  for (const r of rows.results ?? []) {
    const list = byMessage.get(r.message_id) ?? []
    list.push(r)
    byMessage.set(r.message_id, list)
  }

  return messages.map((m) => ({
    id: m.id,
    visitor_name: m.visitor_name,
    visitor_website: m.visitor_website,
    content: m.content,
    quoted_text: m.quoted_text,
    page_url: m.page_url,
    page_title: m.page_title,
    status: m.status,
    needs_review: m.needs_review,
    reply_content: m.reply_content,
    reply_at: m.reply_at,
    created_at: m.created_at,
    updated_at: m.updated_at,
    target_type: m.target_type,
    target_id: m.target_id,
    parent_id: m.parent_id,
    replies: (byMessage.get(m.id) ?? []).map((r) => ({
      id: r.id,
      reply_content: r.reply_content,
      reply_type: r.reply_type,
      reply_from_email: r.reply_from_email,
      created_at: r.created_at,
    })),
  }))
}

export async function listMessages(
  db: D1Database,
  opts: {
    status?: MessageStatusFilter
    page_url?: string
    target_type?: string
    target_id?: string
    limit?: number
    includeDeleted?: boolean
    admin?: boolean
  } = {},
): Promise<PublicMessage[]> {
  const where: string[] = []
  const binds: unknown[] = []

  if (!opts.includeDeleted) where.push('is_deleted = 0')

  if (opts.admin && opts.status) {
    where.push('status = ?')
    binds.push(opts.status)
  } else if (!opts.admin) {
    where.push(`status IN ('approved','featured')`)
  }

  if (opts.page_url) {
    where.push('page_url = ?')
    binds.push(opts.page_url)
  }
  if (opts.target_type) {
    where.push('target_type = ?')
    binds.push(opts.target_type)
  }
  if (opts.target_id) {
    where.push('target_id = ?')
    binds.push(opts.target_id)
  }

  const rows = await db
    .prepare(
      `SELECT * FROM messages
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(...binds, opts.limit ?? 50)
    .all<MessageRow>()

  return attachReplies(db, rows.results ?? [])
}

export type MessageStatusFilter = 'pending' | 'approved' | 'featured' | 'spam'

export async function setMessageStatus(
  db: D1Database,
  id: number,
  status: MessageStatusFilter,
  operator = 'admin',
): Promise<void> {
  await db
    .prepare(`UPDATE messages SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(status, nowIso(), id)
    .run()
  await db
    .prepare(`INSERT INTO admin_logs (message_id, action, operator) VALUES (?, ?, ?)`)
    .bind(id, status === 'featured' ? 'feature' : status === 'spam' ? 'spam' : status === 'pending' ? 'restore' : 'approve', operator)
    .run()
}

export async function softDeleteMessage(db: D1Database, id: number, operator = 'admin'): Promise<void> {
  await db
    .prepare(`UPDATE messages SET is_deleted = 1, reply_token = '', updated_at = ? WHERE id = ?`)
    .bind(nowIso(), id)
    .run()
  await db
    .prepare(`INSERT INTO admin_logs (message_id, action, operator) VALUES (?, 'delete', ?)`)
    .bind(id, operator)
    .run()
}

export async function replyMessage(
  db: D1Database,
  id: number,
  content: string,
  operator = 'admin',
): Promise<void> {
  const now = nowIso()
  await db.batch([
    db
      .prepare(`UPDATE messages SET reply_content = ?, reply_at = ?, updated_at = ? WHERE id = ?`)
      .bind(content, now, now, id),
    db
      .prepare(`INSERT INTO replies (message_id, reply_content, reply_type, reply_from_email) VALUES (?, ?, '博主', '')`)
      .bind(id, content),
    db.prepare(`INSERT INTO admin_logs (message_id, action, operator) VALUES (?, 'reply', ?)`).bind(id, operator),
  ])
}
