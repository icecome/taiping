import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../env'

const CACHEABLE = new Set(['GET'])
const MAX_AGE = 300

/** 页面缓存：仅缓存匿名 GET + text/html + 200 */
export const pageCache: MiddlewareHandler<AppEnv> = async (c, next) => {
  const path = new URL(c.req.url).pathname
  const skip =
    !CACHEABLE.has(c.req.method) ||
    path.startsWith('/api') ||
    path.startsWith('/console') ||
    path.startsWith('/admin') ||
    Boolean(c.req.header('cookie')?.includes('tp_session='))

  if (skip) {
    await next()
    return
  }

  const cacheKey = new Request(new URL(c.req.url).toString(), { method: 'GET' })
  const cache = caches.default
  const hit = await cache.match(cacheKey)
  if (hit) {
    const res = new Response(hit.body, hit)
    res.headers.set('X-TP-Cache', 'hit')
    return res
  }

  await next()

  const res = c.res
  const type = res.headers.get('content-type') || ''
  if (res.status === 200 && type.includes('text/html') && !res.headers.get('set-cookie')) {
    const headers = new Headers(res.headers)
    headers.set('Cache-Control', `public, max-age=${MAX_AGE}`)
    headers.set('X-TP-Cache', 'miss')
    const forCache = new Response(res.body, { status: res.status, headers })
    c.executionCtx.waitUntil(cache.put(cacheKey, forCache.clone()))
    c.res = new Response(forCache.body, { status: res.status, headers })
  }
}

export async function purgePageCache(patterns: string[] = ['/']): Promise<void> {
  // Cache API 无通配删除，这里尽力清关键路径
  const cache = caches.default
  await Promise.all(
    patterns.map(async (p) => {
      try {
        await cache.delete(new Request(`https://taiping.local${p}`))
      } catch {
        // ignore
      }
    }),
  )
}
