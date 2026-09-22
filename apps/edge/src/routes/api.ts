import { Hono } from 'hono'
import { z } from 'zod'
import { commentCreateSchema } from '@taiping/content-model/comment'
import { unlockSchema } from '@taiping/content-model/auth'
import { buildSearchDocs, filterSearchDocs } from '@taiping/renderer/search'
import type { AppEnv } from '../lib/http'
import { jsonFail, jsonOk, zodDetails } from '../lib/http'
import { getPublishedPosts, getPostBySlug } from '../services/posts'
import { createComment, listPublicCommentsWithReplies } from '../services/comments'
import { listPublishedMoments } from '../services/moments'
import { hashIp, verifyPassword } from '../lib/crypto'
import { signUnlockToken, unlockCookieName } from '../services/auth'
import { getSettings } from '../lib/settings'

const api = new Hono<AppEnv>()

api.get('/health', (c) => jsonOk(c, { status: 'ok' }))

api.get('/search', async (c) => {
  const keyword = c.req.query('q') ?? ''
  const posts = await getPublishedPosts(c.env.DB, 'post')
  const pages = await getPublishedPosts(c.env.DB, 'page')
  const settings = await getSettings(c.env.DB)
  const docs = buildSearchDocs(
    [...posts, ...pages].map((p) => {
      const derived = p.excerpt ?? ''
      return {
        id: p.id,
        slug: p.slug,
        type: p.type,
        title: p.title,
        excerpt: derived,
        status: p.status,
        encrypt: p.encrypt,
        publishedAt: p.publishedAt,
      }
    }),
  )
  void settings
  return jsonOk(c, { items: filterSearchDocs(docs, keyword) })
})

api.post('/comments', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = commentCreateSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '评论校验失败', zodDetails(parsed.error))
  }
  // 仅信任 Cloudflare 注入的 CF-Connecting-IP。X-Forwarded-For 可由客户端伪造，
  // 一旦用于限流或黑名单判定即可被逐请求轮换绕过。
  const ip = c.req.header('CF-Connecting-IP') ?? ''
  const settings = await getSettings(c.env.DB)
  const referer = c.req.header('Referer') ?? ''
  if (settings.commentsCheckReferer && settings.url && referer) {
    try {
      const origin = new URL(settings.url).origin
      const refOrigin = new URL(referer).origin
      if (origin && refOrigin && origin !== refOrigin) {
        return jsonFail(c, 'FORBIDDEN', '非法来源')
      }
    } catch {
      // ignore bad referer parse
    }
  }
  try {
    const comment = await createComment(
      c.env.DB,
      parsed.data,
      {
        ipHash: ip ? await hashIp(ip, c.env.SESSION_SECRET) : undefined,
        userAgent: c.req.header('User-Agent'),
        rawIp: ip || undefined,
      },
      {
        requireModeration: settings.commentsRequireModeration,
        whitelist: settings.commentsWhitelist,
        checkReferer: settings.commentsCheckReferer,
        postInterval: settings.commentsPostInterval,
        stopWords: settings.commentsStopWords,
        ipBlackList: settings.commentsIpBlackList,
        siteUrl: settings.url,
      },
    )
    return jsonOk(c, {
      id: comment.id,
      status: comment.status,
      message:
        comment.status === 'approved' ? '已提交并公开' : '已提交，待审核',
    })
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'RATE_LIMITED' || code === 'FORBIDDEN') {
      return jsonFail(c, code as 'RATE_LIMITED' | 'FORBIDDEN', (err as Error).message)
    }
    throw err
  }
})

api.get('/comments', async (c) => {
  const targetType = c.req.query('targetType') ?? 'guestbook'
  const targetId = c.req.query('targetId') ?? 'guestbook'
  if (!['guestbook', 'post', 'moment'].includes(targetType)) {
    return jsonFail(c, 'VALIDATION_FAILED', 'targetType 不合法')
  }
  const items = await listPublicCommentsWithReplies(
    c.env.DB,
    targetType as 'guestbook' | 'post' | 'moment',
    targetId,
  )
  return jsonOk(c, { items })
})

api.post('/unlock/:slug', async (c) => {
  const slug = c.req.param('slug')
  const body = await c.req.json().catch(() => null)
  const parsed = unlockSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '密码不能为空')
  }
  const post = await getPostBySlug(c.env.DB, slug)
  if (!post || !post.encrypt || !post.encryptPasswordHash) {
    return jsonFail(c, 'NOT_FOUND', '文章不存在或未加密')
  }
  const passed = await verifyPassword(parsed.data.password, post.encryptPasswordHash)
  if (!passed) {
    return jsonFail(c, 'AUTH_INVALID', '密码错误')
  }
  const token = await signUnlockToken(post.id, c.env.SESSION_SECRET)
  const cookie = `${unlockCookieName(slug)}=${token}; Path=/posts/${slug}; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
  c.header('Set-Cookie', cookie)
  return jsonOk(c, { unlocked: true, slug })
})

api.get('/moments', async (c) => {
  const items = await listPublishedMoments(c.env.DB, 50)
  return jsonOk(c, { items })
})

export default api
