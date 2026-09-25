import type { ImageBedConfig, ImageBedType, UploadResult } from './imagebed-types'

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
  }
  return map[mime] || 'bin'
}

function makeFilename(original: string, mime: string): string {
  const safe = (original || `img.${extFromMime(mime)}`).replace(/[^\w.\-]+/g, '_')
  const stamp = Date.now().toString(36)
  return `${stamp}_${safe}`
}

function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
}

async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const digest = await crypto.subtle.digest('SHA-256', buf as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** AWS SigV4（S3 兼容端点） */
async function uploadS3(
  cfg: NonNullable<ImageBedConfig['s3']>,
  file: File | Blob,
  filename: string,
): Promise<UploadResult> {
  const body = new Uint8Array(await file.arrayBuffer())
  const mime = file.type || 'application/octet-stream'
  const key = `${(cfg.keyPrefix || '').replace(/^\/+|\/+$/g, '')}${cfg.keyPrefix ? '/' : ''}${filename}`
  const endpoint = cfg.endpoint.replace(/\/+$/, '')
  const pathStyle = cfg.pathStyle !== false
  const host = new URL(endpoint).host
  const canonicalUri = pathStyle ? `/${cfg.bucket}/${encodeRfc3986(key).replace(/%2F/g, '/')}` : `/${encodeRfc3986(key).replace(/%2F/g, '/')}`

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = await sha256Hex(body.buffer as ArrayBuffer)

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256Hex(canonicalRequest)}`
  const kDate = await hmac(new TextEncoder().encode(`AWS4${cfg.secretAccessKey}`), dateStamp)
  const kRegion = await hmac(kDate, cfg.region)
  const kService = await hmac(kRegion, 's3')
  const kSigning = await hmac(kService, 'aws4_request')
  const sigBuf = await hmac(kSigning, stringToSign)
  const signature = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, '0')).join('')

  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const url = pathStyle
    ? `${endpoint}/${cfg.bucket}/${key.split('/').map(encodeRfc3986).join('/')}`
    : `${endpoint.replace('://', `://${cfg.bucket}.`)}/${key.split('/').map(encodeRfc3986).join('/')}`

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Type': mime,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
    body,
  })
  if (!res.ok) {
    throw new Error(`S3 上传失败: ${res.status} ${await res.text()}`)
  }

  const publicUrl =
    cfg.publicUrl?.replace(/\/+$/, '') ||
    `${endpoint}/${cfg.bucket}/${key}`
  return { url: publicUrl, filename, size: body.length, mime }
}

async function uploadWebdav(
  cfg: NonNullable<ImageBedConfig['webdav']>,
  file: File | Blob,
  filename: string,
): Promise<UploadResult> {
  const base = cfg.endpoint.replace(/\/+$/, '')
  const dir = (cfg.basePath || '').replace(/^\/+|\/+$/g, '')
  const path = dir ? `${dir}/${filename}` : filename
  const url = `${base}/${path.split('/').map(encodeRfc3986).join('/')}`
  const body = new Uint8Array(await file.arrayBuffer())
  const auth = btoa(`${cfg.username}:${cfg.password}`)

  // 确保目录存在（MKCOL 失败可忽略）
  if (dir) {
    await fetch(`${base}/${dir.split('/').map(encodeRfc3986).join('/')}`, {
      method: 'MKCOL',
      headers: { Authorization: `Basic ${auth}` },
    }).catch(() => undefined)
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body,
  })
  if (!res.ok) throw new Error(`WebDAV 上传失败: ${res.status} ${await res.text()}`)

  const publicUrl = cfg.publicUrl?.replace(/\/+$/, '')
    ? `${cfg.publicUrl.replace(/\/+$/, '')}/${path}`
    : url
  return { url: publicUrl, filename, size: body.length, mime: file.type || 'application/octet-stream' }
}

async function uploadGithub(
  cfg: NonNullable<ImageBedConfig['github']>,
  file: File | Blob,
  filename: string,
): Promise<UploadResult> {
  const path = `${(cfg.path || '').replace(/^\/+|\/+$/g, '')}/${filename}`.replace(/^\//, '')
  const content = new Uint8Array(await file.arrayBuffer())
  const b64 = btoa(String.fromCharCode(...content))
  const api = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path.split('/').map(encodeRfc3986).join('/')}`

  const res = await fetch(api, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `upload ${filename}`,
      content: b64,
      branch: cfg.branch || 'main',
    }),
  })
  if (!res.ok) throw new Error(`GitHub 上传失败: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { content?: { download_url?: string; path?: string } }

  const cdn = (cfg.cdnBase || '').replace(/\/+$/, '')
  const url = cdn
    ? `${cdn}/${path}`
    : data.content?.download_url ||
      `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch || 'main'}/${path}`
  return {
    url,
    filename,
    size: content.length,
    mime: file.type || 'application/octet-stream',
  }
}

async function uploadCustomHttp(
  cfg: NonNullable<ImageBedConfig['custom_http']>,
  file: File | Blob,
  filename: string,
): Promise<UploadResult> {
  const form = new FormData()
  form.append(cfg.fieldName || 'file', file, filename)
  const res = await fetch(cfg.uploadUrl, {
    method: cfg.method || 'POST',
    headers: cfg.headers || {},
    body: form,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`自定义图床失败: ${res.status} ${text}`)

  let url = text.trim()
  try {
    const json = JSON.parse(text) as Record<string, unknown>
    const path = cfg.urlJsonPath || 'url'
    const parts = path.split('.')
    let cur: unknown = json
    for (const p of parts) {
      cur = (cur as Record<string, unknown>)?.[p]
    }
    if (typeof cur === 'string') url = cur
  } catch {
    // 纯文本 URL
  }
  if (!/^https?:\/\//i.test(url)) throw new Error('未能从响应解析出图片 URL')
  return { url, filename, size: file.size, mime: file.type || 'application/octet-stream' }
}

export async function uploadToImageBed(
  type: ImageBedType,
  config: ImageBedConfig,
  file: File | Blob,
  originalName: string,
): Promise<UploadResult> {
  const filename = makeFilename(originalName, file.type)
  switch (type) {
    case 's3': {
      if (!config.s3) throw new Error('缺少 S3 配置')
      return uploadS3(config.s3, file, filename)
    }
    case 'webdav': {
      if (!config.webdav) throw new Error('缺少 WebDAV 配置')
      return uploadWebdav(config.webdav, file, filename)
    }
    case 'github': {
      if (!config.github) throw new Error('缺少 GitHub 配置')
      return uploadGithub(config.github, file, filename)
    }
    case 'custom_http': {
      if (!config.custom_http) throw new Error('缺少自定义 HTTP 配置')
      return uploadCustomHttp(config.custom_http, file, filename)
    }
    default:
      throw new Error(`未知图床类型: ${type}`)
  }
}

export function maskConfig(type: ImageBedType, config: ImageBedConfig): ImageBedConfig {
  const clone = JSON.parse(JSON.stringify(config)) as ImageBedConfig
  const mask = (v?: string) => (v && v.length > 4 ? `${v.slice(0, 2)}***${v.slice(-2)}` : v ? '***' : '')
  if (clone.s3) {
    clone.s3.secretAccessKey = mask(clone.s3.secretAccessKey) || ''
    clone.s3.accessKeyId = mask(clone.s3.accessKeyId) || ''
  }
  if (clone.webdav) clone.webdav.password = mask(clone.webdav.password) || ''
  if (clone.github) clone.github.token = mask(clone.github.token) || ''
  if (clone.custom_http?.headers) {
    for (const k of Object.keys(clone.custom_http.headers)) {
      clone.custom_http.headers[k] = mask(clone.custom_http.headers[k]) || ''
    }
  }
  return clone
}
