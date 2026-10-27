/**
 * slug 生成：中文标题转拼音，ASCII 原样保留。
 *
 * 与 LuyBlog 的差别：它在后台多处用 seoTitle/slug 手工兜底，出网 URL 里混着中文；
 * 这里把"标题 → slug"作为服务端唯一入口，保存时若冲突自动追加序号。
 */
import { pinyin } from "pinyin-pro";

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

export function slugify(input: string, maxLength = 80): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";

  const source = CJK_RE.test(raw)
    ? pinyin(raw, { toneType: "none", type: "array", nonZh: "consecutive" }).join("-")
    : raw;

  const ascii = source
    .normalize("NFKD")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");

  return ascii;
}

/** slug 不可用时（例如标题全是标点）落到带随机后缀的占位，保证唯一索引不炸。 */
export function slugifyOrFallback(input: string, fallbackPrefix = "item"): string {
  const slug = slugify(input);
  if (slug) return slug;
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${fallbackPrefix}-${suffix}`;
}

/**
 * 在给定 slug 已被占用时追加 -2、-3…；`exists` 由调用方注入（查库或查内存集合）。
 */
export function withNumericSuffix(slug: string, index: number): string {
  return index <= 1 ? slug : `${slug}-${index}`;
}

/**
 * 为保存动作求解一个可用 slug。
 * 最多尝试 50 次，超出后落到随机后缀，避免死循环。
 */
export async function resolveUniqueSlug(
  desired: string,
  exists: (candidate: string) => Promise<boolean>,
  fallbackPrefix = "item",
): Promise<string> {
  const base = slugifyOrFallback(desired, fallbackPrefix);
  for (let i = 1; i <= 50; i += 1) {
    const candidate = withNumericSuffix(base, i);
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 内容路径：页面在根，其余带类型前缀。 */
export function contentPath(type: string, slug: string): string {
  if (type === "page") return `/${slug}`;
  return `/${type}/${slug}`;
}
