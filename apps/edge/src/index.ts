import { Hono } from 'hono'
import type { Context } from 'hono'
import { errorHandler } from './middleware/error'
import type { AppEnv } from './lib/http'
import publicRoutes from './routes/public'
import adminRoutes from './routes/admin'
import apiRoutes from './routes/api'
import { processMirrorQueue } from './services/mirror'
import { pruneAttempts } from './services/authAttempts'
import { assertEnv, adminPath, warnEnvOnce } from './env'

const app = new Hono<AppEnv>()

app.onError(errorHandler)

async function serveAsset(c: Context<AppEnv>, path: string): Promise<Response> {
  if (!c.env.ASSETS) {
    return c.text('asset binding missing', 404)
  }
  const url = new URL(c.req.url)
  url.pathname = path
  return c.env.ASSETS.fetch(new Request(url.toString(), { method: 'GET' }))
}

app.get('/theme/*', async (c) => serveAsset(c, new URL(c.req.url).pathname))

app.get('/assets/*', async (c) => serveAsset(c, new URL(c.req.url).pathname))

async function serveStudio(c: Context<AppEnv>): Promise<Response> {
  const asset = await serveAsset(c, '/index.html')
  if (asset.status !== 404) return asset
  return c.html('<!doctype html><title>Studio</title><div id="root">Studio 静态资源未构建</div>')
}

// 后台入口路径可由 ADMIN_PATH 配置（默认 /admin）。
// SPA 用 hash 路由，故只需处理页面入口，/assets 与 /theme 保持固定。
// 注意：配置为自定义路径时，/admin 不再提供服务——否则「隐藏入口」形同虚设。
app.get('/admin', (c) => {
  const path = adminPath(c.env)
  if (path !== '/admin') return c.notFound()
  return c.redirect('/admin/')
})

app.get('/admin/*', (c) => {
  if (adminPath(c.env) !== '/admin') return c.notFound()
  return serveStudio(c)
})

app.route('/api/admin', adminRoutes)
app.route('/api', apiRoutes)
app.route('/', publicRoutes)

// 自定义后台路径：必须最后注册，避免抢在 API 与前台路由之前匹配
app.get('*', async (c, next) => {
  const path = adminPath(c.env)
  if (path === '/admin') return next()
  const reqPath = new URL(c.req.url).pathname
  if (reqPath === path) return c.redirect(`${path}/`)
  if (reqPath.startsWith(`${path}/`)) return serveStudio(c)
  return next()
})

export default {
  async fetch(request: Request, env: AppEnv['Bindings'], ctx: ExecutionContext) {
    warnEnvOnce(env, (message) => console.error(message))
    return app.fetch(request, env, ctx)
  },
  scheduled: async (_event: ScheduledEvent, env: AppEnv['Bindings'], ctx: ExecutionContext) => {
    try {
      assertEnv(env)
      ctx.waitUntil(processMirrorQueue(env.DB, env))
      // 清理过期登录尝试记录，避免表无限增长
      ctx.waitUntil(
        pruneAttempts(env.DB).then((n) => {
          if (n > 0) console.log(`[cron] 清理登录尝试记录 ${n} 条`)
        }),
      )
    } catch (error) {
      console.error('[cron]', error)
    }
  },
}
