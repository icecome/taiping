import type { Context } from 'hono'
import { jsonFail } from '../lib/http'

export function errorHandler(err: Error, c: Context): Response {
  const code = (err as { code?: string }).code
  if (code === 'CONFLICT') {
    return jsonFail(c, 'CONFLICT', err.message || '资源冲突')
  }
  if (code === 'NOT_FOUND') {
    return jsonFail(c, 'NOT_FOUND', err.message || '资源不存在')
  }
  if (code === 'AUTH_INVALID') {
    return jsonFail(c, 'AUTH_INVALID', '账号或密码错误')
  }
  if (code === 'VALIDATION_FAILED') {
    return jsonFail(c, 'VALIDATION_FAILED', err.message || '校验失败')
  }
  console.error('[edge]', err)
  return jsonFail(c, 'INTERNAL', '服务器内部错误')
}
