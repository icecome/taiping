export interface ApiError {
  code: string
  message: string
  details?: unknown
}

export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError }

export class HttpError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(status: number, error: ApiError) {
    super(error.message)
    this.name = 'HttpError'
    this.status = status
    this.code = error.code
    this.details = error.details
  }
}

/**
 * 跳转到登录页。
 * 后台入口路径可由服务端 ADMIN_PATH 配置，故不能硬编码 /admin，
 * 改从当前 URL 推导基路径（hash 路由下 location.pathname 即入口）。
 */
export function goToLogin(): void {
  const base = window.location.pathname.replace(/\/+$/, '')
  window.location.href = `${base}/#/login`
}

/**
 * 统一 HTTP 客户端：全部后台请求必须经此，禁止业务侧另写 fetch 封装。
 */
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (init.method && init.method !== 'GET' && init.method !== 'HEAD') {
    headers.set('X-Requested-With', 'XMLHttpRequest')
  }

  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers,
      credentials: 'same-origin',
    })
  } catch (error) {
    throw new HttpError(0, {
      code: 'NETWORK',
      message: error instanceof Error ? error.message : '网络请求失败',
    })
  }

  if (res.status === 401) {
    // 统一拦截：清空缓存由调用方 QueryClient 处理，这里跳转登录
    if (!path.includes('/auth/login')) {
      goToLogin()
    }
  }

  let json: ApiEnvelope<T>
  try {
    json = (await res.json()) as ApiEnvelope<T>
  } catch {
    throw new HttpError(res.status, {
      code: 'INTERNAL',
      message: `响应解析失败（HTTP ${res.status}）`,
    })
  }

  if (!json.ok) {
    throw new HttpError(res.status, json.error)
  }
  return json.data
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

/**
 * 带上传进度的 POST。
 * fetch 无法获取上传进度，故此处用 XMLHttpRequest 实现；
 * 鉴权、请求头、401 跳转与信封解析保持与 request() 一致。
 */
export function postWithProgress<T>(
  path: string,
  body: unknown,
  onProgress?: (percent: number) => void,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const { signal, timeoutMs = 60_000 } = options

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', path, true)
    xhr.withCredentials = true
    xhr.timeout = timeoutMs
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')

    const payload = JSON.stringify(body)

    xhr.upload.onprogress = (e) => {
      if (!onProgress || !e.lengthComputable) return
      const percent = Math.min(100, Math.round((e.loaded / e.total) * 100))
      onProgress(percent)
    }

    xhr.onload = () => {
      let json: ApiEnvelope<T>
      try {
        json = JSON.parse(xhr.responseText) as ApiEnvelope<T>
      } catch {
        reject(
          new HttpError(xhr.status, {
            code: 'INTERNAL',
            message: `响应解析失败（HTTP ${xhr.status}）`,
          }),
        )
        return
      }
      if (xhr.status === 401 && !path.includes('/auth/login')) {
        goToLogin()
      }
      if (!json.ok) {
        reject(new HttpError(xhr.status, json.error))
        return
      }
      resolve(json.data)
    }

    xhr.onerror = () =>
      reject(new HttpError(0, { code: 'NETWORK', message: '网络请求失败' }))

    xhr.ontimeout = () =>
      reject(new HttpError(0, { code: 'TIMEOUT', message: '请求超时，请重试' }))

    xhr.onabort = () =>
      reject(new HttpError(0, { code: 'ABORTED', message: '上传已取消' }))

    if (signal) {
      if (signal.aborted) {
        xhr.abort()
        return
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }

    xhr.send(payload)
  })
}
