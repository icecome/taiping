/**
 * 用户可控 URL 协议白名单。
 * zod 的 .url() 基于 new URL()，会放行 javascript: 等协议，
 * 故凡是要渲染进 href/src 的字段都必须经此校验。
 */
export const SAFE_URL_SCHEME = /^https?:\/\//i

/** 站内相对路径（拒绝 // 协议相对 URL） */
const RELATIVE_PATH = /^\/(?!\/)/

const MAILTO = /^mailto:[^\s]+/i
const BARE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 外链（href 外跳）：仅 http/https */
export function isSafeExternalUrl(value: string): boolean {
  if (!value) return false
  return SAFE_URL_SCHEME.test(value)
}

/** 资源地址（img/video src）：站内相对路径或 http/https */
export function isSafeResourceUrl(value: string): boolean {
  if (!value) return false
  return RELATIVE_PATH.test(value) || isSafeExternalUrl(value)
}

/** 导航/社交链接：相对路径、http/https、mailto 或纯邮箱 */
export function isSafeNavUrl(value: string): boolean {
  if (!value) return false
  return (
    RELATIVE_PATH.test(value) ||
    isSafeExternalUrl(value) ||
    MAILTO.test(value) ||
    BARE_EMAIL.test(value)
  )
}

export function safeExternalHref(value: string | undefined | null): string | undefined {
  return value && isSafeExternalUrl(value) ? value : undefined
}

export function safeResourceSrc(value: string | undefined | null): string | undefined {
  return value && isSafeResourceUrl(value) ? value : undefined
}

export function safeNavHref(value: string | undefined | null): string | undefined {
  return value && isSafeNavUrl(value) ? value : undefined
}
