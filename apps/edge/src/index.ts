import { Hono } from 'hono'
import type { Context } from 'hono'
import { errorHandler } from './middleware/error'
import type { AppEnv } from './lib/http'
import publicRoutes from './routes/public'
import adminRoutes from './routes/admin'
import apiRoutes from './routes/api'
import { processMirrorQueue } from './services/mirror'
import { assertEnv, warnEnvOnce } from './env'

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

app.get('/admin', async (c) => c.redirect('/admin/'))

app.get('/admin/*', async (c) => {
  const asset = await serveAsset(c, '/index.html')
  if (asset.status !== 404) return asset
  return c.html('<!doctype html><title>Studio</title><div id="root">Studio 静态资源未构建</div>')
})

app.route('/api/admin', adminRoutes)
app.route('/api', apiRoutes)
app.route('/', publicRoutes)

export default {
  async fetch(request: Request, env: AppEnv['Bindings'], ctx: ExecutionContext) {
    warnEnvOnce(env, (message) => console.error(message))
    return app.fetch(request, env, ctx)
  },
  scheduled: async (_event: ScheduledEvent, env: AppEnv['Bindings'], ctx: ExecutionContext) => {
    try {
      assertEnv(env)
      ctx.waitUntil(processMirrorQueue(env.DB, env))
    } catch (error) {
      console.error('[cron]', error)
    }
  },
}
