export type MessageStatus = 'pending' | 'approved' | 'featured' | 'spam'

export type MessageRow = {
  id: number
  visitor_name: string
  visitor_email: string
  visitor_website: string
  visitor_ip: string
  user_agent: string
  client_hash: string
  content: string
  quoted_text: string
  page_url: string
  page_title: string
  status: MessageStatus
  is_deleted: number
  needs_review: number
  reply_content: string
  reply_at: string | null
  reply_token: string
  target_type: string
  target_id: string
  parent_id: number
  created_at: string
  updated_at: string
}

export type ReplyRow = {
  id: number
  message_id: number
  reply_content: string
  reply_type: '博主' | '邮箱回信'
  reply_from_email: string
  created_at: string
}

export type PublicMessage = {
  id: number
  visitor_name: string
  visitor_website: string
  content: string
  quoted_text: string
  page_url: string
  page_title: string
  status: MessageStatus
  needs_review: number
  reply_content: string
  reply_at: string | null
  created_at: string
  updated_at: string
  target_type: string
  target_id: string
  parent_id: number
  replies: Array<{
    id: number
    reply_content: string
    reply_type: string
    reply_from_email: string
    created_at: string
  }>
}

export type CreateMessageInput = {
  visitor_name: string
  visitor_email?: string
  visitor_website?: string
  content: string
  quoted_text?: string
  page_url: string
  page_title?: string
  target_type?: 'guestbook' | 'post' | 'page' | 'moment'
  target_id?: string
  parent_id?: number
}

/** 兼容 blog-comment 公开列表字段 + 太平扩展 */
export const PUBLIC_MESSAGE_FIELDS =
  'id, visitor_name, visitor_website, content, quoted_text, page_url, page_title, status, needs_review, reply_content, reply_at, created_at, updated_at, target_type, target_id, parent_id'

export function toThemeComment(msg: PublicMessage) {
  return {
    id: String(msg.id),
    targetType: (msg.target_type || 'guestbook') as 'post' | 'page' | 'guestbook' | 'moment',
    targetId: msg.target_id || msg.page_url,
    parentId: msg.parent_id ? String(msg.parent_id) : null,
    nickname: msg.visitor_name,
    email: undefined,
    website: msg.visitor_website || undefined,
    content: msg.content,
    contentHtml: escapeToHtml(msg.content),
    status: msg.status === 'featured' || msg.status === 'approved' ? ('approved' as const) : (msg.status as 'waiting' | 'spam'),
    createdAt: msg.created_at,
    isFeatured: msg.status === 'featured',
    replies: (msg.replies || []).map((r) => ({
      id: String(r.id),
      contentHtml: escapeToHtml(r.reply_content),
      replyType: r.reply_type,
      replyFromEmail: r.reply_from_email,
      createdAt: r.created_at,
    })),
  }
}

function escapeToHtml(input: string): string {
  return (input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>')
}
