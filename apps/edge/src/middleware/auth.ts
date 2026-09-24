import { createMiddleware } from 'hono/factory'
import { jsonFail } from '../lib/http'
import { validateSession } from '../services/auth'
import type { AppEnv } from '../lib/http'

/**
 * 鉴权中间件：对 /api/admin/* 前缀统一挂载。
 * 路由内禁止再手写鉴权样板。
 */
const AUTH_PUBLIC_SUFFIXES = new Set([
  '/auth/login',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/bootstrap',
  '/auth/register',
])

function adminPathSuffix(path: string): string {
  return path.startsWith('/api/admin') ? path.slice('/api/admin'.length) || '/' : path
}

function isAuthPublic(path: string): boolean {
  return AUTH_PUBLIC_SUFFIXES.has(adminPathSuffix(path))
}

/** 非 GET：校验 Origin（退化 Referer）与本站同源，并要求自定义 CSRF 头 */
function isTrustedOrigin(url: string, header: (name: string) => string | undefined): boolean {
  const host = new URL(url).host
  const origin = header('Origin')
  if (origin) {
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }
  const referer = header('Referer')
  if (referer) {
    try {
      return new URL(referer).host === host
    } catch {
      return false
    }
  }
  // 双端都缺失时拒绝，避免非浏览器客户端裸写
  return false
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.req.path.startsWith('/api/admin/') && !c.req.path.startsWith('/auth/')) {
    return next()
  }
  if (isAuthPublic(c.req.path)) {
    // 公开写接口（登录/注册/重置）同样做 Origin 校验
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) &&
      !isTrustedOrigin(c.req.url, (name) => c.req.header(name))
    ) {
      return jsonFail(c, 'FORBIDDEN', '跨站请求被拒绝')
    }
    return next()
  }
  if (c.req.method === 'OPTIONS') {
    return next()
  }
  const sessionId = await validateSession(c.env.DB, c.env, c.req.header('Cookie'))
  if (!sessionId) {
    return jsonFail(c, 'AUTH_REQUIRED', '登录已过期或未登录')
  }
  // CSRF：Origin/Referer 同源 + 自定义头（站内 XSS 仍需渲染净化兜住）
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    if (!isTrustedOrigin(c.req.url, (name) => c.req.header(name))) {
      return jsonFail(c, 'FORBIDDEN', '跨站请求被拒绝')
    }
    const requestedWith = c.req.header('X-Requested-With')
    if (requestedWith !== 'XMLHttpRequest') {
      return jsonFail(c, 'FORBIDDEN', '缺少 CSRF 校验头')
    }
  }
  c.set('sessionId', sessionId)
  return next()
})
