export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SLUG_MAX_LEN = 80

/** 生成 URL 安全 slug（仅 a-z0-9-）；与 SLUG_RE 同源 */
export function slugify(input: string, fallbackPrefix = 'post'): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LEN)
    .replace(/-+$/g, '')
  return base || `${fallbackPrefix}-${Date.now().toString(36)}`
}

/** 冲突时追加 -1/-2（Typecho 风格） */
export function slugWithSuffix(base: string, n: number): string {
  if (n <= 0) return base
  const suffix = `-${n}`
  return base.slice(0, SLUG_MAX_LEN - suffix.length) + suffix
}

export function isValidSlug(slug: string, maxLen = SLUG_MAX_LEN): boolean {
  return SLUG_RE.test(slug) && slug.length <= maxLen
}
