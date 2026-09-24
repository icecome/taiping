import { pinyin } from 'pinyin-pro'

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SLUG_MAX_LEN = 80

/** 中文标题取前 N 个汉字转拼音 */
export const CJK_SLUG_CHARS = 4

const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/

function isCjk(ch: string): boolean {
  return CJK_RE.test(ch)
}

/**
 * 中文 → 拼音 slug：取标题中前 4 个汉字，逐字转无声调拼音，以 `-` 连接。
 * 例：测试文章标题 → ce-shi-wen-zhang；太皮博客发布流程 → tai-pi-bo-ke
 */
export function chineseToPinyinSlug(input: string, maxChars = CJK_SLUG_CHARS): string {
  const chars = [...input].filter(isCjk).slice(0, maxChars)
  const parts: string[] = []
  for (const ch of chars) {
    const syllable = pinyin(ch, { toneType: 'none', type: 'array' })[0]
    if (!syllable) continue
    const clean = syllable.toLowerCase().replace(/[^a-z0-9]+/g, '')
    if (clean) parts.push(clean)
  }
  return parts.join('-')
}

/**
 * 生成 URL 安全 slug（仅 a-z0-9-），与 SLUG_RE 同源。
 * - 含中文：取前 4 个汉字转拼音（如 ce-shi-wen-zhang）
 * - 纯西文：小写、数字、连字符（如 hello-world）
 * - 仍为空：post-YYYYMMDD-xxxx
 */
export function slugify(input: string, fallbackPrefix = 'post'): string {
  const fromCjk = chineseToPinyinSlug(input)
  if (fromCjk) {
    return fromCjk.slice(0, SLUG_MAX_LEN).replace(/-+$/g, '')
  }
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LEN)
    .replace(/-+$/g, '')
  return base || fallbackSlug(fallbackPrefix)
}

/** 空标题等场景的可读回退：post-20260922-a3f2 */
export function fallbackSlug(prefix = 'post'): string {
  const d = new Date()
  const ymd =
    String(d.getFullYear()) +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
  const rand = Math.random().toString(36).slice(2, 6)
  return `${prefix}-${ymd}-${rand}`
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
