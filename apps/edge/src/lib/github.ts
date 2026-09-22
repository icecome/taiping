/** GitHub Contents API 封装：统一鉴权头、超时与错误处理 */
export interface GitHubEnv {
  GITHUB_TOKEN?: string
}

export interface GitHubRequestOptions {
  method?: string
  body?: unknown
  timeoutMs?: number
  accept?: string
}

export async function githubRequest(
  env: GitHubEnv,
  path: string,
  options: GitHubRequestOptions = {},
): Promise<Response> {
  const token = env.GITHUB_TOKEN
  if (!token) {
    throw Object.assign(new Error('GITHUB_TOKEN 未配置'), { code: 'CONFIG' })
  }
  const { method = 'GET', body, timeoutMs = 15_000, accept = 'application/vnd.github+json' } = options
  return fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'taiping-blog',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  })
}

/** 编码 contents 路径段 */
export function encodeGitHubPath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}
