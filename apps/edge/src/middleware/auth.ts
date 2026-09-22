import { createMiddleware } from 'hono/factory'
import { jsonFail } from '../lib/http'
import { validateSession } from '../services/auth'
import type { AppEnv } from '../lib/http'

/**
 * 鉴权中间件：对 /api/admin/* 前缀统一挂载。
 * 路由内禁止再手写鉴权样板。
 */
const AUTH_PUBLIC_PATHS = new Set([
  '/api/admin/auth/login',
  '/auth/login',
  // 口令重置相关：申请重置与凭令牌重置都需在未登录状态下可用
  '/api/admin/auth/forgot-password',
  '/api/admin/auth/reset-password',
])

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.req.path.startsWith('/api/admin/') && !c.req.path.startsWith('/auth/')) {
    return next()
  }
  if (AUTH_PUBLIC_PATHS.has(c.req.path)) {
    return next()
  }
  if (c.req.method === 'OPTIONS') {
    return next()
  }
  const sessionId = await validateSession(c.env.DB, c.env, c.req.header('Cookie'))
  if (!sessionId) {
    return jsonFail(c, 'AUTH_REQUIRED', '登录已过期或未登录')
  }
  // CSRF 补充校验：非 GET 请求要求自定义头
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const requestedWith = c.req.header('X-Requested-With')
    if (requestedWith !== 'XMLHttpRequest') {
      return jsonFail(c, 'FORBIDDEN', '缺少 CSRF 校验头')
    }
  }
  c.set('sessionId', sessionId)
  return next()
})
