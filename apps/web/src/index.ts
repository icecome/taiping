import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from './env'
import { apiRoutes } from './routes/api'
import { messageRoutes } from './routes/messages'
import { imageBedRoutes } from './routes/image-beds'
import { publicRoutes } from './routes/public'
import { pageCache } from './lib/page-cache'
import { getSiteSettings } from './services/settings'
import { themeRenderer } from './theme/render'
import { countUsers } from './services/users'

/** 安全响应头：避免直接改 ASSETS 不可变 headers */
const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next()
  const res = c.res
  const headers = new Headers(res.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'SAMEORIGIN')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.res = new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

const app = new Hono<AppEnv>()

app.use('*', securityHeaders)
app.use('*', pageCache)

app.route('/api', apiRoutes)
app.route('/api', messageRoutes)
app.route('/api', imageBedRoutes)

// Console SPA 静态资源（由 console 构建产物拷贝到 public/console）
app.get('/console/*', async (c) => {
  if (!c.env.ASSETS) return c.text('console not built', 404)
  const url = new URL(c.req.url)
  const path = url.pathname
  const isAsset = /\.[a-zA-Z0-9]+$/.test(path)
  if (path === '/console' || path === '/console/' || !isAsset) {
    url.pathname = '/console/index.html'
  }
  const res = await c.env.ASSETS.fetch(new Request(url, c.req.raw))
  return new Response(res.body, res)
})

app.route('/', publicRoutes)

app.notFound(async (c) => {
  const settings = await getSiteSettings(c.env.DB)
  return c.html(themeRenderer.notFound({ settings }), 404)
})

app.get('/health', (c) => c.json({ ok: true, name: 'taiping-blog' }))

app.get('/install-status', async (c) => {
  const users = await countUsers(c.env.DB)
  return c.json({ initialized: users > 0 })
})

export default app
