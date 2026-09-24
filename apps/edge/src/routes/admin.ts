import { Hono } from 'hono'
import { z } from 'zod'
import { postListQuerySchema, postInputSchema } from '@taiping/content-model/post'
import {
  commentListQuerySchema,
  commentModerateSchema,
  commentReplyInputSchema,
} from '@taiping/content-model/comment'
import { momentInputSchema, momentListQuerySchema } from '@taiping/content-model/moment'
import { siteSettingsSchema } from '@taiping/content-model/settings'
import { termInputSchema, termUpdateSchema } from '@taiping/content-model/term'
import {
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  adminEmailSchema,
  registerSchema,
} from '@taiping/content-model/auth'
import { renderMarkdownSafe } from '@taiping/renderer/markdown'
import type { AppEnv } from '../lib/http'
import { jsonFail, jsonOk, zodDetails } from '../lib/http'
import { requireAuth } from '../middleware/auth'
import {
  COOKIE_NAME,
  login,
  logout,
  getAdmin,
  changeAdminPassword,
  createPasswordResetToken,
  inspectResetToken,
  resetPasswordWithToken,
  getAdminEmail,
  setAdminEmail,
  isBootstrapRequired,
  registerAdmin,
} from '../services/auth'
import { sendPasswordResetEmail } from '../lib/mail'
import { adminPath } from '../env'
import {
  countPosts,
  createPost,
  deletePost,
  getPostById,
  getPostTerms,
  listPosts,
  listRevisions,
  publishPost,
  recyclePost,
  restorePost,
  revertToRevision,
  unpublishPost,
  updatePost,
} from '../services/posts'
import {
  countComments,
  listComments,
  moderateComment,
  listRepliesForComments,
  addAdminReply,
  updateAdminReply,
  deleteReply,
} from '../services/comments'
import {
  countMoments,
  createMoment,
  deleteMoment,
  getMomentById,
  listMoments,
  updateMoment,
} from '../services/moments'
import { createTerm, deleteTerm, listTerms, updateTerm } from '../services/terms'
import { getSettings, saveSettings } from '../lib/settings'
import { getStatus, retryFailed } from '../services/mirror'
import { createMediaFromUrl, deleteMedia, listMedia, uploadMedia } from '../services/media'
import {
  githubDeleteMedia,
  githubListMedia,
  githubUploadImage,
} from '../services/github-media'

const admin = new Hono<AppEnv>()

admin.use('*', requireAuth)

// --- auth ---
admin.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '参数不合法', zodDetails(parsed.error))
  }
  const trusted = body?.trusted === true
  const clientIp = c.req.header('CF-Connecting-IP') ?? ''
  try {
    const result = await login(
      c.env.DB,
      c.env,
      parsed.data.username,
      parsed.data.password,
      c.req.header('User-Agent'),
      trusted,
      new URL(c.req.url).protocol === 'https:',
      clientIp,
    )
    c.header('Set-Cookie', result.cookie)
    return jsonOk(c, { expiresAt: result.expiresAt })
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'AUTH_INVALID') {
      return jsonFail(c, 'AUTH_INVALID', '账号或密码错误')
    }
    if (code === 'RATE_LIMITED') {
      return jsonFail(c, 'RATE_LIMITED', '尝试过于频繁，请稍后再试')
    }
    if (code === 'ACCOUNT_LOCKED') {
      return jsonFail(c, 'ACCOUNT_LOCKED', '账号已锁定，请通过邮件重置口令')
    }
    throw err
  }
})

admin.get('/auth/bootstrap', async (c) => {
  const needsSetup = await isBootstrapRequired(c.env.DB)
  return jsonOk(c, { needsSetup })
})

admin.post('/auth/register', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '参数不合法', zodDetails(parsed.error))
  }
  const trusted = body?.trusted === true
  const clientIp = c.req.header('CF-Connecting-IP') ?? ''
  try {
    const result = await registerAdmin(
      c.env.DB,
      c.env,
      parsed.data.username,
      parsed.data.password,
      c.req.header('User-Agent'),
      trusted,
      new URL(c.req.url).protocol === 'https:',
      clientIp,
    )
    c.header('Set-Cookie', result.cookie)
    return jsonOk(c, { expiresAt: result.expiresAt, username: parsed.data.username })
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'SETUP_ALREADY_DONE') {
      return jsonFail(c, 'SETUP_ALREADY_DONE', '系统已初始化，请直接登录')
    }
    if (code === 'RATE_LIMITED') {
      return jsonFail(c, 'RATE_LIMITED', '尝试过于频繁，请稍后再试')
    }
    if (code === 'ACCOUNT_LOCKED') {
      return jsonFail(c, 'ACCOUNT_LOCKED', '尝试过于频繁，请稍后再试')
    }
    throw err
  }
})

admin.post('/auth/logout', async (c) => {
  const cookie = await logout(c.env.DB, c.req.header('Cookie'))
  c.header('Set-Cookie', cookie)
  return jsonOk(c, { ok: true })
})

admin.get('/auth/me', async (c) => {
  const admin = await getAdmin(c.env.DB)
  return jsonOk(c, {
    authenticated: true,
    cookieName: COOKIE_NAME,
    username: admin?.username ?? null,
  })
})

admin.post('/auth/password', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = changePasswordSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '参数不合法', zodDetails(parsed.error))
  }
  try {
    await changeAdminPassword(c.env.DB, parsed.data.currentPassword, parsed.data.newPassword)
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'AUTH_INVALID') {
      return jsonFail(c, 'AUTH_INVALID', '当前口令不正确')
    }
    throw err
  }
  // 所有会话已失效，清除当前 Cookie 促使重新登录
  c.header('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)
  return jsonOk(c, { changed: true })
})

// --- 口令重置（公开端点，见 middleware/auth.ts 的白名单）---

admin.post('/auth/forgot-password', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = forgotPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '参数不合法', zodDetails(parsed.error))
  }

  // 无论账号是否存在、邮箱是否配置，都返回相同结果，避免用户名枚举
  const created = await createPasswordResetToken(c.env.DB, c.env)
  if (created) {
    const origin = new URL(c.req.url).origin
    const path = adminPath(c.env)
    const resetUrl = `${origin}${path}/#/reset-password?token=${created.token}`
    const settings = await getSettings(c.env.DB)
    // 不阻塞响应；邮件失败已在 mail 层记录日志
    c.executionCtx.waitUntil(
      sendPasswordResetEmail(
        c.env,
        created.email,
        resetUrl,
        settings.title || '博客后台',
        created.ttlMinutes,
      ),
    )
  }
  return jsonOk(c, { submitted: true })
})

admin.get('/auth/reset-password', async (c) => {
  const token = c.req.query('token') ?? ''
  const state = await inspectResetToken(c.env.DB, token)
  return jsonOk(c, { state })
})

admin.post('/auth/reset-password', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = resetPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '参数不合法', zodDetails(parsed.error))
  }
  try {
    await resetPasswordWithToken(c.env.DB, parsed.data.token, parsed.data.newPassword)
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'TOKEN_INVALID' || code === 'TOKEN_EXPIRED' || code === 'TOKEN_USED') {
      return jsonFail(c, code as 'TOKEN_INVALID', '重置链接无效或已失效，请重新申请')
    }
    throw err
  }
  c.header('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)
  return jsonOk(c, { reset: true })
})

// --- 恢复邮箱（需登录）---

admin.get('/auth/email', async (c) => {
  const email = await getAdminEmail(c.env.DB)
  return jsonOk(c, { email })
})

admin.patch('/auth/email', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = adminEmailSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '邮箱格式不正确', zodDetails(parsed.error))
  }
  await setAdminEmail(c.env.DB, parsed.data.email)
  return jsonOk(c, { email: parsed.data.email.trim() })
})

// --- dashboard ---
admin.get('/overview', async (c) => {
  const [posts, comments, moments, mirror] = await Promise.all([
    countPosts(c.env.DB),
    countComments(c.env.DB),
    countMoments(c.env.DB),
    getStatus(c.env.DB),
  ])
  return jsonOk(c, { posts, comments, moments, mirror: mirror.summary })
})

// --- posts ---
admin.get('/posts', async (c) => {
  const parsed = postListQuerySchema.safeParse(c.req.query())
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '查询参数不合法', zodDetails(parsed.error))
  }
  const data = await listPosts(c.env.DB, parsed.data)
  return jsonOk(c, data)
})

admin.get('/posts/:id', async (c) => {
  const post = await getPostById(c.env.DB, c.req.param('id'))
  if (!post) return jsonFail(c, 'NOT_FOUND', '文章不存在')
  const terms = await getPostTerms(c.env.DB, post.id)
  return jsonOk(c, { ...post, ...terms })
})

admin.post('/posts', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = postInputSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '校验失败', zodDetails(parsed.error))
  }
  const post = await createPost(c.env.DB, parsed.data)
  return jsonOk(c, post)
})

admin.patch('/posts/:id', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = postInputSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '校验失败', zodDetails(parsed.error))
  }
  const post = await updatePost(c.env.DB, c.req.param('id'), parsed.data)
  return jsonOk(c, post)
})

admin.delete('/posts/:id', async (c) => {
  await deletePost(c.env.DB, c.req.param('id'))
  return jsonOk(c, { deleted: true })
})

admin.post('/posts/:id/publish', async (c) => {
  try {
    return jsonOk(c, await publishPost(c.env.DB, c.req.param('id')))
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'NOT_FOUND') return jsonFail(c, 'NOT_FOUND', '文章不存在')
    if (code === 'VALIDATION_FAILED') return jsonFail(c, 'VALIDATION_FAILED', '缺少可发布正文')
    throw err
  }
})

admin.post('/posts/:id/unpublish', async (c) => {
  return jsonOk(c, await unpublishPost(c.env.DB, c.req.param('id')))
})

admin.post('/posts/:id/recycle', async (c) => {
  return jsonOk(c, await recyclePost(c.env.DB, c.req.param('id')))
})

admin.post('/posts/:id/restore', async (c) => {
  return jsonOk(c, await restorePost(c.env.DB, c.req.param('id')))
})

admin.get('/posts/:id/revisions', async (c) => {
  const post = await getPostById(c.env.DB, c.req.param('id'))
  if (!post) return jsonFail(c, 'NOT_FOUND', '文章不存在')
  return jsonOk(c, await listRevisions(c.env.DB, post.id))
})

admin.post('/posts/:id/revisions/:revisionId/revert', async (c) => {
  try {
    return jsonOk(
      c,
      await revertToRevision(c.env.DB, c.req.param('id'), c.req.param('revisionId')),
    )
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'NOT_FOUND') return jsonFail(c, 'NOT_FOUND', '文章或版本不存在')
    throw err
  }
})

// --- moments ---
admin.get('/moments', async (c) => {
  const parsed = momentListQuerySchema.safeParse(c.req.query())
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '查询参数不合法', zodDetails(parsed.error))
  }
  return jsonOk(c, await listMoments(c.env.DB, parsed.data))
})

admin.get('/moments/:id', async (c) => {
  const moment = await getMomentById(c.env.DB, c.req.param('id'))
  if (!moment) return jsonFail(c, 'NOT_FOUND', '说说不存在')
  return jsonOk(c, moment)
})

admin.post('/moments', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = momentInputSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '校验失败', zodDetails(parsed.error))
  }
  return jsonOk(c, await createMoment(c.env.DB, parsed.data))
})

admin.patch('/moments/:id', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = momentInputSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '校验失败', zodDetails(parsed.error))
  }
  return jsonOk(c, await updateMoment(c.env.DB, c.req.param('id'), parsed.data))
})

admin.delete('/moments/:id', async (c) => {
  await deleteMoment(c.env.DB, c.req.param('id'))
  return jsonOk(c, { deleted: true })
})

// --- comments ---
admin.get('/comments', async (c) => {
  const parsed = commentListQuerySchema.safeParse(c.req.query())
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '查询参数不合法', zodDetails(parsed.error))
  }
  const page = await listComments(c.env.DB, parsed.data)
  // 附带回复时间线，避免前端逐条请求
  const replies = await listRepliesForComments(
    c.env.DB,
    page.items.map((item) => item.id),
  )
  return jsonOk(c, {
    ...page,
    items: page.items.map((item) => ({ ...item, replies: replies.get(item.id) ?? [] })),
  })
})

admin.patch('/comments/:id', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = commentModerateSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '校验失败', zodDetails(parsed.error))
  }
  await moderateComment(c.env.DB, c.req.param('id'), parsed.data.action)
  return jsonOk(c, { action: parsed.data.action })
})

// --- comment replies ---

admin.post('/comments/:id/reply', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = commentReplyInputSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '回复内容不合法', zodDetails(parsed.error))
  }
  try {
    const { reply, notify } = await addAdminReply(
      c.env.DB,
      c.env,
      c.req.param('id'),
      parsed.data.content,
    )
    // 邮件失败不阻塞回复落库（mail 层已记录日志）
    if (notify) c.executionCtx.waitUntil(notify)
    return jsonOk(c, reply)
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'NOT_FOUND') return jsonFail(c, 'NOT_FOUND', '评论不存在')
    if (code === 'VALIDATION_FAILED') return jsonFail(c, 'VALIDATION_FAILED', '回复内容不能为空')
    throw err
  }
})

admin.patch('/comments/:id/reply/:replyId', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = commentReplyInputSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '回复内容不合法', zodDetails(parsed.error))
  }
  try {
    return jsonOk(
      c,
      await updateAdminReply(
        c.env.DB,
        c.req.param('id'),
        c.req.param('replyId'),
        parsed.data.content,
      ),
    )
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'NOT_FOUND') return jsonFail(c, 'NOT_FOUND', '回复不存在')
    if (code === 'FORBIDDEN') return jsonFail(c, 'FORBIDDEN', '访客回信不可编辑')
    if (code === 'VALIDATION_FAILED') return jsonFail(c, 'VALIDATION_FAILED', '回复内容不能为空')
    throw err
  }
})

admin.delete('/comments/:id/reply/:replyId', async (c) => {
  try {
    await deleteReply(c.env.DB, c.req.param('id'), c.req.param('replyId'))
    return jsonOk(c, { deleted: true })
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'NOT_FOUND') return jsonFail(c, 'NOT_FOUND', '回复不存在')
    throw err
  }
})

// --- taxonomy ---
admin.get('/terms', async (c) => {
  const type = c.req.query('type')
  if (type !== undefined && type !== 'category' && type !== 'tag') {
    return jsonFail(c, 'VALIDATION_FAILED', 'type 仅支持 category/tag')
  }
  return jsonOk(c, await listTerms(c.env.DB, type))
})

admin.post('/terms', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = termInputSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '校验失败', zodDetails(parsed.error))
  }
  return jsonOk(c, await createTerm(c.env.DB, parsed.data))
})

admin.patch('/terms/:id', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = termUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '校验失败', zodDetails(parsed.error))
  }
  return jsonOk(c, await updateTerm(c.env.DB, c.req.param('id'), parsed.data))
})

admin.delete('/terms/:id', async (c) => {
  await deleteTerm(c.env.DB, c.req.param('id'))
  return jsonOk(c, { deleted: true })
})

// --- settings ---
admin.get('/settings', async (c) => jsonOk(c, await getSettings(c.env.DB)))

admin.patch('/settings', async (c) => {
  const body = await c.req.json().catch(() => null)
  const current = await getSettings(c.env.DB)
  const parsed = siteSettingsSchema.safeParse({ ...current, ...body })
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '设置校验失败', zodDetails(parsed.error))
  }
  await saveSettings(c.env.DB, parsed.data)
  return jsonOk(c, parsed.data)
})

// --- media ---
admin.get('/media', async (c) => {
  const page = Number(c.req.query('page') ?? '1') || 1
  const pageSize = Number(c.req.query('pageSize') ?? '20') || 20
  return jsonOk(c, await listMedia(c.env.DB, page, pageSize, c.req.query('q')))
})

admin.get('/media/github', async (c) => {
  const settings = await getSettings(c.env.DB)
  return jsonOk(c, await githubListMedia(c.env, settings))
})

admin.post('/media/github/upload', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z
    .object({
      base64Content: z.string().min(1),
      filename: z.string().min(1),
      sha: z.string().optional(),
      message: z.string().optional(),
    })
    .safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '上传参数不合法', zodDetails(parsed.error))
  }
  const settings = await getSettings(c.env.DB)
  const result = await githubUploadImage(c.env, settings, parsed.data)
  // 同步登记到本地 media 表，便于统一管理
  await createMediaFromUrl(c.env.DB, {
    url: result.url,
    filename: result.path,
    mime: 'image/webp',
  })
  return jsonOk(c, result)
})

admin.delete('/media/github', async (c) => {
  const path = c.req.query('path') ?? ''
  const sha = c.req.query('sha') ?? ''
  if (!path || !sha) {
    return jsonFail(c, 'VALIDATION_FAILED', '缺少 path 或 sha')
  }
  const settings = await getSettings(c.env.DB)
  return jsonOk(c, await githubDeleteMedia(c.env, settings, path, sha))
})

admin.post('/media', async (c) => {
  const contentType = c.req.header('Content-Type') ?? ''
  if (contentType.includes('application/json')) {
    const body = await c.req.json().catch(() => null)
    const parsed = z
      .object({
        url: z.string().min(1),
        filename: z.string().min(1),
        mime: z.string().min(1),
        size: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
      })
      .safeParse(body)
    if (!parsed.success) {
      return jsonFail(c, 'VALIDATION_FAILED', '外部媒体登记失败', zodDetails(parsed.error))
    }
    return jsonOk(c, await createMediaFromUrl(c.env.DB, parsed.data))
  }
  const formData = await c.req.formData().catch(() => null)
  const file = formData?.get('file')
  if (!file || typeof file === 'string') {
    return jsonFail(c, 'VALIDATION_FAILED', '缺少文件或 url 字段')
  }
  const blob = file as Blob & { name?: string }
  const media = await uploadMedia(c.env.DB, c.env, {
    name: blob.name || 'upload.bin',
    type: blob.type || 'application/octet-stream',
    size: blob.size,
    arrayBuffer: await blob.arrayBuffer(),
  })
  return jsonOk(c, media)
})

admin.delete('/media/:id', async (c) => {
  await deleteMedia(c.env.DB, c.env, c.req.param('id'))
  return jsonOk(c, { deleted: true })
})

// --- preview ---
admin.post('/preview', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z
    .object({
      type: z.enum(['post', 'moment', 'comment']).default('post'),
      contentMd: z.string().default(''),
      title: z.string().optional(),
    })
    .safeParse(body)
  if (!parsed.success) {
    return jsonFail(c, 'VALIDATION_FAILED', '预览参数不合法', zodDetails(parsed.error))
  }
  const html = renderMarkdownSafe(parsed.data.contentMd)
  return jsonOk(c, {
    html,
    title: parsed.data.title ?? '预览',
  })
})

// --- mirror ---
admin.get('/mirror/status', async (c) => jsonOk(c, await getStatus(c.env.DB)))
admin.post('/mirror/retry', async (c) => jsonOk(c, { retried: await retryFailed(c.env.DB) }))

export default admin
