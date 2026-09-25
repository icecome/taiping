const SAFE_RESOURCE = /^(https?:\/\/|\/|#|data:image\/)/i
const SAFE_HTTP = /^https?:\/\//i
const SAFE_NAV = /^(\/|#|https?:\/\/)/i

export function safeResourceSrc(value?: string | null): string {
  if (!value) return ''
  const v = value.trim()
  return SAFE_RESOURCE.test(v) ? v : ''
}

export function safeExternalHref(value?: string | null): string {
  if (!value) return ''
  const v = value.trim()
  return SAFE_HTTP.test(v) ? v : ''
}

export function safeNavHref(value?: string | null): string {
  if (!value) return ''
  const v = value.trim()
  return SAFE_NAV.test(v) ? v : ''
}
