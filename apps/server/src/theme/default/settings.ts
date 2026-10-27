/**
 * 主题设置读取层（default 主题内部）
 *
 * `ctx.settings` 是 `Record<string, unknown>`：值可能来自后台表单（字符串）、
 * 数据库 JSON（数字/布尔），也可能根本不存在（用户升级后新字段没有值）。
 * 所以这里不直接类型断言，而是逐项收敛到安全值，非法值一律回落到主题默认值。
 *
 * 主题不访问 db / env / 网络，这是契约（theme/types.ts 顶部注释）：
 * 换主题只换"怎么显示"，不换"取什么数据"。
 */
import type { ThemeContext } from "../types";

/** 取字符串设置；空白字符串视为未设置。 */
export function str(ctx: ThemeContext, key: string, fallback: string): string {
  const value = ctx.settings[key];
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return fallback;
}

/** 取数字设置并夹在 [min, max] 内；NaN / 非数字一律回落。 */
export function num(
  ctx: ThemeContext,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = ctx.settings[key];
  let parsed: number;
  if (typeof value === "number") parsed = value;
  else if (typeof value === "string" && value.trim() !== "") parsed = Number(value);
  else return fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

/** 取布尔设置；表单可能把它序列化成 "true" / "1"。 */
export function flag(ctx: ThemeContext, key: string, fallback: boolean): boolean {
  const value = ctx.settings[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1" || value === "on";
  if (typeof value === "number") return value !== 0;
  return fallback;
}

/**
 * 颜色设置：只接受 #rgb / #rrggbb / #rrggbbaa。
 * 这里必须白名单校验，因为值会拼进 `<style>` 的 `:root`，
 * 而 `<style>` 是原始文本元素（不做实体解码），一个 `}` 就能改写整站样式。
 */
const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function color(ctx: ThemeContext, key: string, fallback: string): string {
  const value = str(ctx, key, "");
  return COLOR_RE.test(value) ? value : fallback;
}

/**
 * 把十六进制色按比例混白，得到"同一个色相的亮版本"。
 * 用途：暗色模式下不能直接复用为浅底挑的强调色（对比度会掉），
 * 所以给每个用户色派生一个更亮的同色系版本，由 CSS 变量按主题模式分别取用。
 */
export function lighten(hex: string, amount = 0.42): string {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return hex;
  let body = match[1]!;
  if (body.length === 3) {
    body = body
      .split("")
      .map((char) => char + char)
      .join("");
  }
  const value = Number.parseInt(body, 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const mixed = channels
    .map((channel) => Math.round(channel + (255 - channel) * amount))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("");
  return `#${mixed}`;
}

/**
 * 正文字体：select 的值只当"键"用，真正的字体栈写死在下面。
 * 理由同上——字体栈里带引号与逗号，不能把用户输入直接塞进 style。
 */
const BODY_FONTS: Record<string, string> = {
  sans: '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, -apple-system, "Segoe UI", sans-serif',
  serif: '"Noto Serif SC", "Songti SC", "Source Han Serif SC", SimSun, Georgia, "Times New Roman", serif',
  kai: '"Kaiti SC", "STKaiti", KaiTi, "Noto Serif SC", serif',
};

export function bodyFont(ctx: ThemeContext): string {
  const key = str(ctx, "bodyFont", "sans");
  return BODY_FONTS[key] ?? BODY_FONTS["sans"]!;
}

/* ---------------------------------------------------------------- 时间格式化 */

/**
 * 只做字符串层面的取日期。
 * 原因：Workers 运行时是 UTC，直接 `new Date(x).toLocaleString()` 会跟站点时区
 * 漂移一天；而 ISO 串前缀就是作者录入的那一天，取前缀最稳。
 */
export function isoDate(value: string | null): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function isoYear(value: string | null): string {
  return isoDate(value).slice(0, 4);
}

/** 列表里的紧凑日期：2026-10-26。 */
export function shortDate(value: string | null): string {
  return isoDate(value);
}

/** 正文头部的完整日期：2026 年 10 月 26 日。 */
export function longDate(value: string | null): string {
  const day = isoDate(value);
  if (!day) return "";
  return `${day.slice(0, 4)} 年 ${day.slice(5, 7)} 月 ${day.slice(8, 10)} 日`;
}

/** 时间的机器可读值，给 `<time datetime>` 用。 */
export function dateAttr(value: string | null): string | undefined {
  if (!value) return undefined;
  return value;
}

/* ---------------------------------------------------------------- 文本处理 */

/** 按字符截断，超出加省略号。CJK 与英文混排都按 UTF-16 长度算，够用。 */
export function clampText(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit).trimEnd()}…`;
}

/** 数字千分位，浏览量 / 字数用。 */
export function groupNumber(value: number): string {
  return String(Math.max(0, Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 当前年份，页脚版权用。 */
export function currentYear(): string {
  return String(new Date().getUTCFullYear());
}

/** 标签云的权重分级：按 count 排序后落到 1..4 档，避免内联 font-size。 */
export function tagWeight(tag: { count: number }, maxCount: number): number {
  if (maxCount <= 0) return 1;
  const ratio = tag.count / maxCount;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.45) return 3;
  if (ratio >= 0.2) return 2;
  return 1;
}
