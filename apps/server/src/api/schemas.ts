/**
 * API 通用 schema 与响应包装。
 *
 * 约定：所有成功响应形如 `{ ok: true, data: ... }`；失败响应由 errorHandler 统一产出
 * `{ ok: false, error: { code, message, fields? } }`。
 * 业务处理器只声明成功响应，错误一律抛 AppError —— 这样既避免在每个 handler 里
 * 写 if/else 判错，也让 OpenAPI 文档里的错误码保持"可能发生"而不是"每条都返回"。
 */
import { z } from "@hono/zod-openapi";

export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ ok: z.literal(true), data });
}

export const ErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});

export const IdParam = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" }, example: "cnt_0123456789abcdef" }),
});

export const SlugParam = z.object({
  slug: z.string().min(1).openapi({ param: { name: "slug", in: "path" } }),
});

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).optional(),
  q: z.string().trim().max(120).optional(),
});

export const PageMetaSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

export const TimestampSchema = z.string().nullable().describe("ISO-8601 时间字符串，未设置为 null");

export const StatusQuery = z.object({
  status: z
    .enum(["all", "draft", "pending", "scheduled", "published", "trashed"])
    .default("all")
    .optional(),
});

/** 内容类型枚举，与 shared/content-types.ts 保持字面量一致。 */
export const ContentTypeEnum = z.enum(["post", "page", "moment", "project"]);
export const TermTypeEnum = z.enum(["category", "tag", "series"]);
export const CommentStatusEnum = z.enum(["pending", "approved", "spam", "trashed"]);
export const RoleKeyEnum = z.enum(["owner", "admin", "editor", "author", "contributor", "subscriber"]);

export function listResponse<T extends z.ZodTypeAny>(item: T) {
  return envelope(z.object({ items: z.array(item), meta: PageMetaSchema }));
}
