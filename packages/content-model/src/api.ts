import { z } from 'zod'

export const apiErrorCodeSchema = z.enum([
  'AUTH_REQUIRED',
  'AUTH_INVALID',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
  'MIRROR_PENDING',
])
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>

export interface ApiError {
  code: ApiErrorCode
  message: string
  details?: unknown
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError }

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export function ok<T>(data: T): ApiResponse<T> {
  return { ok: true, data }
}

export function fail(code: ApiErrorCode, message: string, details?: unknown): ApiResponse<never> {
  return {
    ok: false,
    error: details === undefined ? { code, message } : { code, message, details },
  }
}

export const httpStatusByErrorCode: Record<ApiErrorCode, number> = {
  AUTH_REQUIRED: 401,
  AUTH_INVALID: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  MIRROR_PENDING: 200,
}

export const zodDetailsSchema = z.array(
  z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  }),
)
