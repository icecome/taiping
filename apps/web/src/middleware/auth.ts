import type { MiddlewareHandler } from 'hono'
import type { AppEnv, SessionUser } from '../env'
import { getSessionUser } from '../lib/auth'

export type AuthedEnv = AppEnv & {
  Variables: { user: SessionUser }
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await getSessionUser(c)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  c.set('user', user)
  await next()
}
