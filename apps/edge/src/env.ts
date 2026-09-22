export interface Env {
  DB: D1Database
  /** 可选 KV：渲染缓存 */
  CACHE?: KVNamespace
  /** 可选 R2：媒体存储 */
  MEDIA?: R2Bucket
  ASSETS?: Fetcher
  SESSION_SECRET: string
  ADMIN_USERNAME: string
  ADMIN_PASSWORD: string
  GITHUB_TOKEN?: string
  GITHUB_MIRROR_REPO?: string
  /** 邮件发送（Resend）：未配置时跳过发信，相关流程降级而非失败 */
  RESEND_API_KEY?: string
  RESEND_FROM?: string
  /** 后台入口路径，默认 /admin */
  ADMIN_PATH?: string
}

export const REQUIRED_SECRETS = [
  'SESSION_SECRET',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
] as const

/** 后台入口路径：规范化前后斜杠，非法值回落默认 */
export function adminPath(env: { ADMIN_PATH?: string }): string {
  const raw = (env.ADMIN_PATH ?? '').trim()
  if (!raw || raw === '/') return '/admin'
  const trimmed = raw.replace(/^\/+|\/+$/g, '')
  // 仅允许路径安全字符，避免注入或匹配到 API 前缀
  if (!/^[a-zA-Z0-9._~/-]+$/.test(trimmed)) return '/admin'
  if (trimmed.startsWith('api/') || trimmed === 'api') return '/admin'
  return `/${trimmed}`
}

/** 示例文件中的占位值，误用于生产会使会话签名可被预测 */
const PLACEHOLDER_SECRETS = [
  'please-change-me-to-a-long-random-string',
  'change-me',
  'dev-session-secret-please-change',
  'dev-admin-pass',
]

export function collectEnvProblems(env: Env): string[] {
  const problems: string[] = []
  for (const key of REQUIRED_SECRETS) {
    const value = env[key]
    if (!value || value.trim() === '') {
      problems.push(`Missing required env: ${key}`)
      continue
    }
    if (PLACEHOLDER_SECRETS.includes(value.trim())) {
      problems.push(`Env ${key} still uses a placeholder value`)
    }
  }
  if (env.SESSION_SECRET && env.SESSION_SECRET.length > 0 && env.SESSION_SECRET.length < 16) {
    problems.push('SESSION_SECRET must be at least 16 characters')
  }
  return problems
}

export function assertEnv(env: Env): void {
  const problems = collectEnvProblems(env)
  if (problems.length) {
    throw new Error(problems.join('; '))
  }
}

/**
 * 请求路径的环境校验：先以告警模式运行，观察一个发布周期后再切换为抛出。
 * 按 isolate 去重——Workers 可能为每次请求重建 env 对象，故不能依赖对象身份。
 */
let envWarned = false

export function warnEnvOnce(env: Env, warn: (message: string) => void): void {
  if (envWarned) return
  envWarned = true
  const problems = collectEnvProblems(env)
  if (problems.length) {
    warn(`[env] ${problems.join('; ')}`)
  }
}
