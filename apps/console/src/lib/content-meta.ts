/**
 * 内容域的展示元数据。
 *
 * 标签与色调直接读 `@shared/content-types`，不在后台重抄一份枚举：
 * 服务端加一种状态时，后台的徽章与筛选器跟着变，不会出现"前台有、后台没有"的漂移。
 */
import {
  COMMENT_STATUSES,
  CONTENT_STATUSES,
  CONTENT_TYPES,
  CONTENT_VISIBILITIES,
  FIELD_TYPES,
  TERM_TYPES,
} from "@shared/content-types";
import type { BadgeTone } from "@/components/ui";

const STATUS_TONES: Record<string, BadgeTone> = {
  neutral: "neutral",
  warn: "warn",
  info: "info",
  ok: "ok",
  danger: "danger",
};

export function contentStatusLabel(status: string): string {
  return CONTENT_STATUSES.find((entry) => entry.key === status)?.label ?? status;
}

export function contentStatusTone(status: string): BadgeTone {
  const tone = CONTENT_STATUSES.find((entry) => entry.key === status)?.tone;
  return tone ? STATUS_TONES[tone] ?? "neutral" : "neutral";
}

export function contentTypeLabel(type: string): string {
  return CONTENT_TYPES.find((entry) => entry.key === type)?.label ?? type;
}

export function contentVisibilityLabel(visibility: string): string {
  return CONTENT_VISIBILITIES.find((entry) => entry.key === visibility)?.label ?? visibility;
}

export function commentStatusLabel(status: string): string {
  return COMMENT_STATUSES.find((entry) => entry.key === status)?.label ?? status;
}

export function commentStatusTone(status: string): BadgeTone {
  switch (status) {
    case "approved":
      return "ok";
    case "pending":
      return "warn";
    case "spam":
      return "danger";
    case "trashed":
      return "neutral";
    default:
      return "neutral";
  }
}

export function termTypeLabel(type: string): string {
  return TERM_TYPES.find((entry) => entry.key === type)?.label ?? type;
}

export function fieldTypeLabel(type: string): string {
  return FIELD_TYPES.find((entry) => entry.key === type)?.label ?? type;
}

/** 内容类型能力表：编辑页据此决定哪些区块要显示（页面不显示分类、动态不显示 SEO 等）。 */
export function contentTypeSupports(type: string) {
  return (
    CONTENT_TYPES.find((entry) => entry.key === type)?.supports ?? {
      terms: false,
      comments: false,
      cover: false,
      excerpt: false,
      seo: false,
      password: false,
      revisions: false,
      scheduling: false,
    }
  );
}
