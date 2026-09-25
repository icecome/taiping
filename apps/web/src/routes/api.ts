import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getSessionUser, setSession, clearSession } from '../lib/auth'
import { requireAuth } from '../middleware/auth'
import { verifyLogin, createUser, countUsers } from '../services/users'
import { getSiteSettings, saveSiteSettings } from '../services/settings'
import { createPost, softDeletePost, updatePost } from '../services/post-write'
import { listPublishedPosts, getPostById, getPostBySlug } from '../services/posts'
import { createComment, listComments } from '../services/comments'
import { createMoment, listMoments } from '../services/moments'
import { z } from 'zod'

const loginSchema = z.object({
  name: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
})

const postSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  text: z.string(),
  status: z.enum(['draft', 'published', 'private', 'hidden']).optional(),
  password: z.string().max(64).nullable().optional(),
  allowComment: z.boolean().optional(),
  pinned: z.boolean().optional(),
  cover: z.string().max(500).optional(),
  excerpt: z.string().max(500).optional(),
  publishedAt: z.string().nullable().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
})

const commentSchema = z.object({
  targetType: z.enum(['post', 'page', 'guestbook', 'moment']),
  targetId: z.string().min(1),
  nickname: z.string().min(1).max(40),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  content: z.string().min(1).max(5000),
  parentId: z.string().nullable().optional(),
})

export const apiRoutes = new Hono<AppEnv>()

apiRoutes.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid body' }, 400)

  const user = await verifyLogin(c.env.DB, parsed.data.name, parsed.data.password)
  if (!user) return c.json({ error: 'invalid credentials' }, 401)

  await setSession(c, user)
  return c.json({ user })
})

apiRoutes.post('/auth/logout', async (c) => {
  clearSession(c)
  return c.json({ ok: true })
})

apiRoutes.get('/auth/me', async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.json({ user: null })
  return c.json({ user })
})

apiRoutes.post('/setup', async (c) => {
  const existing = await countUsers(c.env.DB)
  if (existing > 0) return c.json({ error: 'already initialized' }, 400)
  const body = await c.req.json().catch(() => null)
  const parsed = loginSchema.extend({ email: z.string().email() }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid body' }, 400)

  await createUser(c.env.DB, {
    name: parsed.data.name,
    email: parsed.data.email,
    password: parsed.data.password,
    role: 'admin',
  })
  return c.json({ ok: true })
})

apiRoutes.get('/posts', async (c) => {
  const page = Number(c.req.query('page') || '1')
  const pageSize = Number(c.req.query('pageSize') || '10')
  const data = await listPublishedPosts(c.env.DB, { page, pageSize })
  return c.json(data)
})

apiRoutes.get('/posts/:slug', async (c) => {
  const post = await getPostBySlug(c.env.DB, c.req.param('slug'))
  if (!post) return c.json({ error: 'not found' }, 404)
  return c.json({ post })
})

apiRoutes.post('/posts', requireAuth, async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const parsed = postSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const id = await createPost(c.env.DB, user.id, parsed.data)
  return c.json({ id }, 201)
})

apiRoutes.put('/posts/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400)
  const parsed = postSchema.partial().safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  await updatePost(c.env.DB, id, parsed.data)
  return c.json({ ok: true })
})

apiRoutes.delete('/posts/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400)
  await softDeletePost(c.env.DB, id)
  return c.json({ ok: true })
})

apiRoutes.get('/admin/posts', requireAuth, async (c) => {
  const page = Number(c.req.query('page') || '1')
  const result = await c.env.DB.prepare(
    `SELECT id, title, slug, status, pinned, comments_num, created_at, modified_at, published_at
     FROM posts WHERE type = 'post' AND deleted = 0
     ORDER BY modified_at DESC LIMIT 20 OFFSET ?`,
  )
    .bind((Math.max(1, page) - 1) * 20)
    .all()
  return c.json({ posts: result.results ?? [] })
})

apiRoutes.get('/admin/posts/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'))
  const post = await getPostById(c.env.DB, id)
  if (!post) return c.json({ error: 'not found' }, 404)
  return c.json({ post })
})

apiRoutes.get('/comments', async (c) => {
  const targetType = c.req.query('targetType') || 'guestbook'
  const targetId = c.req.query('targetId') || 'guestbook'
  const comments = await listComments(c.env.DB, targetType, targetId)
  return c.json({ comments })
})

apiRoutes.post('/comments', async (c) => {
  const parsed = commentSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const id = await createComment(c.env.DB, {
    ...parsed.data,
    email: parsed.data.email || undefined,
    website: parsed.data.website || undefined,
    ip: c.req.header('cf-connecting-ip') || '',
    agent: c.req.header('user-agent') || '',
  })
  return c.json({ id }, 201)
})

apiRoutes.get('/moments', async (c) => {
  const moments = await listMoments(c.env.DB)
  return c.json({ moments })
})

apiRoutes.post('/moments', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z
    .object({
      content: z.string().min(1),
      author: z.string().optional(),
      pictures: z.array(z.object({ url: z.string(), alt: z.string().optional() })).optional(),
      videoUrl: z.string().optional(),
      linkUrl: z.string().optional(),
      linkText: z.string().optional(),
      tagNames: z.array(z.string()).optional(),
    })
    .safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const id = await createMoment(c.env.DB, parsed.data)
  return c.json({ id }, 201)
})

apiRoutes.get('/settings', async (c) => {
  const settings = await getSiteSettings(c.env.DB)
  return c.json({ settings })
})

apiRoutes.put('/settings', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const current = await getSiteSettings(c.env.DB)
  const next = { ...current, ...(body as Record<string, unknown>) }
  await saveSiteSettings(c.env.DB, next as Awaited<ReturnType<typeof getSiteSettings>>)
  return c.json({ settings: next })
})

apiRoutes.get('/taxonomies', requireAuth, async (c) => {
  const categories = await c.env.DB.prepare(
    `SELECT id, name, slug, type, count FROM metas WHERE type = 'category' ORDER BY order_num, name`,
  ).all()
  const tags = await c.env.DB.prepare(
    `SELECT id, name, slug, type, count FROM metas WHERE type = 'tag' ORDER BY count DESC, name`,
  ).all()
  return c.json({ categories: categories.results ?? [], tags: tags.results ?? [] })
})

apiRoutes.post('/taxonomies', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z
    .object({ type: z.enum(['category', 'tag']), name: z.string().min(1).max(150) })
    .safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid body' }, 400)
  const name = parsed.data.name.trim()
  const slug = name.toLowerCase().replace(/\s+/g, '-')
  await c.env.DB
    .prepare(
      `INSERT INTO metas (type, name, slug, description, count, order_num, parent)
       VALUES (?, ?, ?, '', 0, 0, 0)
       ON CONFLICT(type, slug) DO UPDATE SET name = excluded.name`,
    )
    .bind(parsed.data.type, name, slug)
    .run()
  return c.json({ ok: true })
})
