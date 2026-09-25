import type { MessageRow, ReplyRow } from './messages'
import { nowIso } from '@taiping/shared-utils'

export type BlogCommentExport = {
  messages?: MessageRow[]
  replies?: Array<Pick<ReplyRow, 'message_id' | 'reply_content' | 'reply_type' | 'reply_from_email' | 'created_at'> & { id?: number }>
  /** 兼容仅导出 messages 且内嵌 replies 的格式 */
  source?: string
}

export type ImportSummary = {
  messages: number
  replies: number
  skipped: number
}

/**
 * 导入 blog-comment 历史留言库（messages + replies）。
 * 期望 JSON：{ messages: MessageRow[], replies: ReplyRow[] }
 * 或从 D1 导出的数组。
 */
export async function importBlogCommentData(
  db: D1Database,
  payload: BlogCommentExport | MessageRow[],
): Promise<ImportSummary> {
  const messages = Array.isArray(payload) ? payload : (payload.messages ?? [])
  const replies = Array.isArray(payload) ? [] : (payload.replies ?? [])
  let skipped = 0
  let importedMessages = 0
  let importedReplies = 0

  const idMap = new Map<number, number>()

  for (const m of messages) {
    try {
      const exists = await db
        .prepare(`SELECT id FROM messages WHERE visitor_name = ? AND content = ? AND created_at = ? LIMIT 1`)
        .bind(m.visitor_name, m.content, m.created_at)
        .first<{ id: number }>()
      if (exists) {
        skipped += 1
        if (m.id) idMap.set(m.id, exists.id)
        continue
      }

      const target = resolveTarget(m)
      const result = await db
        .prepare(
          `INSERT INTO messages (
            visitor_name, visitor_email, visitor_website, visitor_ip, user_agent, client_hash,
            content, quoted_text, page_url, page_title, status, is_deleted, needs_review,
            reply_content, reply_at, reply_token, target_type, target_id, parent_id,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          m.visitor_name,
          m.visitor_email || '',
          m.visitor_website || '',
          m.visitor_ip || '',
          m.user_agent || '',
          m.client_hash || '',
          m.content,
          m.quoted_text || '',
          m.page_url || '/guestbook',
          m.page_title || '',
          normalizeStatus(m.status),
          m.is_deleted ? 1 : 0,
          m.needs_review ? 1 : 0,
          m.reply_content || '',
          m.reply_at || null,
          m.reply_token || '',
          target.target_type,
          target.target_id,
          m.parent_id || 0,
          m.created_at || nowIso(),
          m.updated_at || m.created_at || nowIso(),
        )
        .run()

      const newId = Number(result.meta.last_row_id)
      importedMessages += 1
      if (m.id) idMap.set(m.id, newId)
    } catch {
      skipped += 1
    }
  }

  for (const r of replies) {
    try {
      const mappedId = r.message_id ? idMap.get(r.message_id) : undefined
      const messageId = mappedId ?? r.message_id
      if (!messageId) {
        skipped += 1
        continue
      }
      await db
        .prepare(
          `INSERT INTO replies (message_id, reply_content, reply_type, reply_from_email, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          messageId,
          r.reply_content,
          r.reply_type === '邮箱回信' ? '邮箱回信' : '博主',
          r.reply_from_email || '',
          r.created_at || nowIso(),
        )
        .run()
      importedReplies += 1
    } catch {
      skipped += 1
    }
  }

  await db
    .prepare(`INSERT INTO import_jobs (source, summary, created_at) VALUES (?, ?, ?)`)
    .bind(
      (!Array.isArray(payload) && payload.source) || 'blog-comment',
      JSON.stringify({ messages: importedMessages, replies: importedReplies, skipped }),
      nowIso(),
    )
    .run()

  return { messages: importedMessages, replies: importedReplies, skipped }
}

function normalizeStatus(status: string | undefined): string {
  if (status === 'approved' || status === 'featured' || status === 'spam' || status === 'pending') {
    return status
  }
  return 'pending'
}

function resolveTarget(m: MessageRow): { target_type: string; target_id: string } {
  if (m.target_type && m.target_id) {
    return { target_type: m.target_type, target_id: m.target_id }
  }
  // blog-comment 用 page_url 表示来源页
  const url = m.page_url || ''
  if (url.includes('/guestbook') || url === '/' || !url) {
    return { target_type: 'guestbook', target_id: 'guestbook' }
  }
  const postMatch = url.match(/\/posts\/([^/?#]+)/)
  if (postMatch) return { target_type: 'post', target_id: postMatch[1] || '' }
  return { target_type: 'guestbook', target_id: 'guestbook' }
}
