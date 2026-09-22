export const MEDIA_PAGE_SIZE = 40
export const MAX_IMAGE_DIM = 4096
export const MAX_FILE_SIZE = 20 * 1024 * 1024

export interface MediaFile {
  name: string
  path: string
  sha: string
  size?: number
  url: string
}

/** Bloath 同源：客户端压缩为 WebP */
export function compressImage(file: File, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { naturalWidth: width, naturalHeight: height } = img
      if (width > MAX_IMAGE_DIM || height > MAX_IMAGE_DIM) {
        const scale = MAX_IMAGE_DIM / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Canvas 不可用'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url)
          if (blob) resolve(blob)
          else reject(new Error('压缩失败'))
        },
        'image/webp',
        quality / 100,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const commaIndex = result.indexOf(',')
      resolve(commaIndex >= 0 ? result.substring(commaIndex + 1) : result)
    }
    reader.onerror = () => reject(new Error('Base64 转换失败'))
    reader.readAsDataURL(blob)
  })
}

function padZero(n: number, len = 2): string {
  return String(n).padStart(len, '0')
}

function randomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < length; i++) {
    result += chars[(bytes[i] ?? 0) % chars.length]
  }
  return result
}

/** Bloath 同源：重命名模板 */
export function resolveRenameTemplate(template: string, originalFilename?: string): string {
  const now = new Date()
  const filename = originalFilename ? originalFilename.replace(/\.[^/.]+$/, '') : 'image'
  return template.replace(/\{([^}]+)\}/g, (match, placeholder: string) => {
    switch (placeholder) {
      case 'Y':
        return String(now.getFullYear())
      case 'm':
        return padZero(now.getMonth() + 1)
      case 'd':
        return padZero(now.getDate())
      case 'h':
        return padZero(now.getHours())
      case 'i':
        return padZero(now.getMinutes())
      case 's':
        return padZero(now.getSeconds())
      case 'filename':
        return filename
      default: {
        const strMatch = placeholder.match(/^str-(\d+)$/)
        if (strMatch) return randomString(parseInt(strMatch[1]!, 10))
        return match
      }
    }
  })
}

export function formatSize(bytes?: number): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function markdownImage(url: string, alt = ''): string {
  return `![${alt}](${url})`
}
