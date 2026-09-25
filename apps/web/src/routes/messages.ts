import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppEnv } from '../env'
import {
  createMessage,
  checkRateLimit,
  listMessages,
  replyMessage,
  setMessageStatus,
  softDeleteMessage,
} from '../services/message-store'
import { importBlogCommentData } from '../services/message-import'
import { requireAuth } from '../middleware/auth'
import { z } from 'zod'

export const messageRoutes = new Hono<AppEnv>()

const createSchema = z.object({
  visitor_name: z.string().min(1).max(40),
  visitor_email: z.string().email().optional().or(z.literal('')),
  visitor_website: z.string().url().optional().or(z.literal('')),
  content: z.string().min(1).max(5000),
  quoted_text: z.string().max(1000).optional(),
  page_url: z.string().min(1).max(500),
  page_title: z.string().max(200).optional(),
  target_type: z.enum(['guestbook', 'post', 'page', 'moment']).optional(),
  target_id: z.string().max(100).optional(),
  parent_id: z.number().int().optional(),
  // 兼容 blog-comment 入参
  turnstile_token: z.string().optional(),
  cf_verified: z.boolean().optional(),
})

/** 兼容 blog-comment: GET /api/messages */
messageRoutes.get('/messages', async (c) => {
  const page_url = c.req.query('page_url') || undefined
  const target_type = c.req.query('target_type') || undefined
  const target_id = c.req.query('target_id') || undefined
  const items = await listMessages(c.env.DB, {
    page_url,
    target_type,
    target_id,
    limit: Number(c.req.query('size') || c.req.query('limit') || 50),
  })
  return c.json({
    code: 0,
    message: 'ok',
    data: {
      items,
      has_more: false,
      next_cursor: null,
      total: items.length,
    },
    timestamp: new Date().toISOString(),
  })
})

/** 兼容 blog-comment: POST /api/messages（别名 /api/message） */
const handleCreate = async (c: Context<AppEnv>) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        code: 10001,
        message: parsed.error.errors[0]?.message || '参数错误',
        data: null,
        timestamp: new Date().toISOString(),
      },
      400,
    )
  }

  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '0.0.0.0'
  const allowed = await checkRateLimit(c.env.DB, ip)
  if (!allowed) {
    return c.json(
      {
        code: 10002,
        message: '提交过于频繁，请稍后再试',
        data: null,
        timestamp: new Date().toISOString(),
      },
      429,
    )
  }

  const id = await createMessage(
    c.env.DB,
    {
      visitor_name: parsed.data.visitor_name,
      visitor_email: parsed.data.visitor_email || undefined,
      visitor_website: parsed.data.visitor_website || undefined,
      content: parsed.data.content,
      quoted_text: parsed.data.quoted_text,
      page_url: parsed.data.page_url,
      page_title: parsed.data.page_title,
      target_type: parsed.data.target_type,
      target_id: parsed.data.target_id,
      parent_id: parsed.data.parent_id,
    },
    { ip, agent: c.req.header('user-agent') || '' },
  )

  return c.json(
    {
      code: 0,
      message: 'ok',
      data: { id },
      timestamp: new Date().toISOString(),
    },
    201,
  )
}

messageRoutes.post('/messages', handleCreate)
messageRoutes.post('/message', handleCreate)

// 管理端
messageRoutes.get('/admin/messages', requireAuth, async (c) => {
  const status = c.req.query('status') as 'pending' | 'approved' | 'featured' | 'spam' | undefined
  const items = await listMessages(c.env.DB, {
    status,
    admin: true,
    includeDeleted: c.req.query('includeDeleted') === '1',
    limit: 100,
  })
  return c.json({ items })
})

messageRoutes.post('/admin/messages/import', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ error: 'invalid body' }, 400)
  const summary = await importBlogCommentData(c.env.DB, body)
  return c.json({ summary })
})

messageRoutes.patch('/admin/messages/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const action = (body as { action?: string }).action
  if (action === 'delete') {
    await softDeleteMessage(c.env.DB, id)
    return c.json({ ok: true })
  }
  const map: Record<string, 'pending' | 'approved' | 'featured' | 'spam'> = {
    approve: 'approved',
    feature: 'featured',
    spam: 'spam',
    restore: 'pending',
  }
  const status = map[action || ''] || (body as { status?: string }).status
  if (!status || !['pending', 'approved', 'featured', 'spam'].includes(status)) {
    return c.json({ error: 'invalid action' }, 400)
  }
  await setMessageStatus(c.env.DB, id, status as 'pending' | 'approved' | 'featured' | 'spam')
  return c.json({ ok: true })
})

messageRoutes.post('/admin/messages/:id/reply', requireAuth, async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => null)
  const content = (body as { content?: string } | null)?.content
  if (!content) return c.json({ error: 'content required' }, 400)
  await replyMessage(c.env.DB, id, content)
  return c.json({ ok: true })
})
