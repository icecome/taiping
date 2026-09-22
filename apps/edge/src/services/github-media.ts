import type { MediaStorageConfig, SiteSettings } from '@taiping/content-model/settings'
import { getActiveMediaConfig } from '@taiping/content-model/settings'
import { encodeGitHubPath, githubRequest } from '../lib/github'

export interface ResolvedMediaSource {
  owner: string
  repo: string
  branch: string
  pathPrefix: string
  configured: boolean
  missingHint?: string
  config: MediaStorageConfig | null
}

export function resolveMediaSource(config: MediaStorageConfig | null): ResolvedMediaSource {
  if (!config) {
    return {
      owner: '',
      repo: '',
      branch: 'main',
      pathPrefix: '',
      configured: false,
      missingHint: '请先在「设置 → 图床」添加配置，并在图床页启用',
      config: null,
    }
  }
  if (config.source === 'external') {
    return {
      owner: '',
      repo: '',
      branch: 'main',
      pathPrefix: '',
      configured: false,
      missingHint: '当前配置为外链模式，请启用 GitHub 图床配置',
      config,
    }
  }
  const owner = config.githubOwner.trim()
  const repo = config.githubRepo.trim()
  const configured = Boolean(owner && repo)
  return {
    owner,
    repo,
    branch: config.githubBranch.trim() || 'main',
    pathPrefix: (config.pathPrefix || 'uploads').replace(/^\/+|\/+$/g, ''),
    configured,
    missingHint: configured ? undefined : `配置「${config.name}」缺少 Owner 或仓库名`,
    config,
  }
}

export function activeMediaConfig(settings: SiteSettings): MediaStorageConfig | null {
  return getActiveMediaConfig(settings)
}

export function mediaCdnUrl(config: MediaStorageConfig | null, path: string): string {
  const source = resolveMediaSource(config)
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const provider = config?.cdnProvider
  if (provider === 'custom' && config?.cdnTemplate) {
    return config.cdnTemplate
      .replaceAll('{owner}', source.owner)
      .replaceAll('{repo}', source.repo)
      .replaceAll('{branch}', source.branch)
      .replaceAll('{path}', encodedPath)
  }
  if (provider === 'github_raw') {
    return `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.branch}/${encodedPath}`
  }
  return `https://cdn.jsdmirror.cn/gh/${source.owner}/${source.repo}@${source.branch}/${encodedPath}`
}

export async function githubUploadImage(
  env: { GITHUB_TOKEN?: string },
  settings: SiteSettings,
  input: { base64Content: string; filename: string; message?: string; sha?: string },
) {
  const config = activeMediaConfig(settings)
  const source = resolveMediaSource(config)
  if (!env.GITHUB_TOKEN) {
    throw Object.assign(new Error('未配置 GITHUB_TOKEN'), { code: 'VALIDATION_FAILED' })
  }
  if (!source.configured) {
    throw Object.assign(new Error(source.missingHint || '图床未配置'), {
      code: 'VALIDATION_FAILED',
    })
  }
  const filePath = source.pathPrefix ? `${source.pathPrefix}/${input.filename}` : input.filename
  const apiPath = `/repos/${source.owner}/${source.repo}/contents/${encodeGitHubPath(filePath)}`
  const body: Record<string, unknown> = {
    message: input.message || `upload: ${filePath}`,
    content: input.base64Content,
    branch: source.branch,
  }
  if (input.sha) body.sha = input.sha
  const res = await githubRequest(env, apiPath, {
    method: 'PUT',
    body,
    timeoutMs: 30_000,
  })
  const json = (await res.json().catch(() => ({}))) as {
    content?: { sha?: string; path?: string }
    message?: string
  }
  if (!res.ok) {
    throw Object.assign(new Error(json.message || `GitHub 上传失败 ${res.status}`), {
      code: 'VALIDATION_FAILED',
    })
  }
  return {
    path: json.content?.path || filePath,
    sha: json.content?.sha || '',
    url: mediaCdnUrl(config, json.content?.path || filePath),
  }
}

export async function githubListMedia(env: { GITHUB_TOKEN?: string }, settings: SiteSettings) {
  const config = activeMediaConfig(settings)
  const source = resolveMediaSource(config)
  if (!env.GITHUB_TOKEN || !source.configured) {
    return {
      configured: source.configured,
      items: [],
      missingHint: source.missingHint,
      activeConfig: config ? { id: config.id, name: config.name } : null,
    }
  }
  const treePath = `/repos/${source.owner}/${source.repo}/git/trees/${encodeURIComponent(source.branch)}?recursive=1`
  const res = await githubRequest(env, treePath, { timeoutMs: 20_000 })
  if (!res.ok) {
    throw Object.assign(new Error(`GitHub 列表失败 ${res.status}`), { code: 'INTERNAL' })
  }
  const json = (await res.json()) as {
    tree?: Array<{ path: string; type: string; sha?: string; size?: number }>
  }
  const items = (json.tree || [])
    .filter((t) => t.type === 'blob')
    .filter((t) => {
      if (source.pathPrefix && !t.path.startsWith(`${source.pathPrefix}/`)) return false
      return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(t.path)
    })
    .map((t) => ({
      path: t.path,
      name: t.path.split('/').pop() || t.path,
      sha: t.sha || '',
      size: t.size ?? 0,
      url: mediaCdnUrl(config, t.path),
    }))
    .sort((a, b) => b.path.localeCompare(a.path))
  return {
    configured: true,
    items,
    activeConfig: { id: config!.id, name: config!.name },
  }
}

export async function githubDeleteMedia(
  env: { GITHUB_TOKEN?: string },
  settings: SiteSettings,
  path: string,
  sha: string,
) {
  if (!env.GITHUB_TOKEN) {
    throw Object.assign(new Error('未配置 GITHUB_TOKEN'), { code: 'VALIDATION_FAILED' })
  }
  const source = resolveMediaSource(activeMediaConfig(settings))
  if (!source.configured) {
    throw Object.assign(new Error(source.missingHint || '图床未配置'), { code: 'VALIDATION_FAILED' })
  }
  const delPath = `/repos/${source.owner}/${source.repo}/contents/${encodeGitHubPath(path)}`
  const res = await githubRequest(env, delPath, {
    method: 'DELETE',
    body: {
      message: `delete: ${path}`,
      sha,
      branch: source.branch,
    },
    timeoutMs: 20_000,
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw Object.assign(new Error(text.slice(0, 200) || `删除失败 ${res.status}`), {
      code: 'INTERNAL',
    })
  }
  return { deleted: true, path }
}
