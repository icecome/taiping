export type ImageBedType = 's3' | 'webdav' | 'github' | 'custom_http'

export type ImageBedConfig = {
  /** S3 兼容（AWS/MinIO/R2/OSS/COS） */
  s3?: {
    endpoint: string
    region: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
    pathStyle?: boolean
    publicUrl?: string
    keyPrefix?: string
  }
  /** WebDAV */
  webdav?: {
    endpoint: string
    username: string
    password: string
    basePath?: string
    publicUrl?: string
  }
  /** GitHub 仓库 */
  github?: {
    token: string
    owner: string
    repo: string
    branch: string
    path: string
    /** 使用 raw.githubusercontent 或 jsDelivr 等 */
    cdnBase?: string
  }
  /** 自定义 HTTP（POST multipart） */
  custom_http?: {
    uploadUrl: string
    method?: string
    fieldName?: string
    headers?: Record<string, string>
    /** 响应中取 URL 的 JSON 路径，如 data.url */
    urlJsonPath?: string
  }
}

export type ImageBedRow = {
  id: number
  name: string
  type: ImageBedType
  is_default: number
  enabled: number
  config: string
  created_at: string
  updated_at: string
}

export type UploadResult = {
  url: string
  filename: string
  size: number
  mime: string
}
