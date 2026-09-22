import type { Context } from 'hono'
import {
  fail,
  httpStatusByErrorCode,
  type ApiErrorCode,
  type ApiResponse,
} from '@taiping/content-model/api'
import type { Env } from '../env'

export type AppEnv = {
  Bindings: Env
  Variables: {
    sessionId?: string
  }
}

export type AppContext = Context<AppEnv>

export function jsonOk<T>(c: Context, data: T, status = 200): Response {
  return c.json({ ok: true, data } satisfies ApiResponse<T>, status as 200)
}

export function jsonFail(
  c: Context,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): Response {
  return c.json(fail(code, message, details), httpStatusByErrorCode[code] as 400)
}

export function zodDetails(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
  }))
}
