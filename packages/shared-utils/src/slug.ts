export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SLUG_MAX_LEN = 80

export function slugify(input: string, fallbackPrefix = 'post'): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LEN)
  return base || `${fallbackPrefix}-${Date.now().toString(36)}`
}

export function isValidSlug(slug: string, maxLen = SLUG_MAX_LEN): boolean {
  return SLUG_RE.test(slug) && slug.length <= maxLen
}
