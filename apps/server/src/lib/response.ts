import type { Context } from "hono";

export interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * 成功响应统一包一层，前端 fetch 封装只需要判断 ok。
 *
 * 注意：**不要**给下面两个函数标注 `: Response` 返回类型。
 * @hono/zod-openapi 的 handler 要求返回 `TypedResponse`，把返回值宽化成 `Response`
 * 会让所有 `app.openapi(...)` 的响应类型校验失败。让 TS 自行推断即可。
 */
export function ok<T>(c: Context, data: T) {
  return c.json({ ok: true as const, data }, 200);
}

export function created<T>(c: Context, data: T) {
  return c.json({ ok: true as const, data }, 201);
}

export function noContent(c: Context): Response {
  return c.body(null, 204);
}

export function fail(c: Context, status: number, error: ApiError): Response {
  return c.json({ ok: false as const, error }, status as never);
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PageMeta;
}

export function paginated<T>(items: T[], total: number, page: number, pageSize: number): PaginatedResult<T> {
  return {
    items,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export interface PaginationInput {
  page: number;
  pageSize: number;
  offset: number;
}

const MAX_PAGE_SIZE = 100;

/**
 * 分页参数解析的唯一入口。
 * `pageSize` 上限在这里强制，新增列表接口不要自己写 `Number(query.pageSize)`，
 * 否则会出现能一次拉全表的接口。
 */
export function parsePagination(query: Record<string, unknown>): PaginationInput {
  const rawPage = Number(query.page ?? 1);
  const rawSize = Number(query.pageSize ?? 20);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawSize) && rawSize > 0 ? Math.min(MAX_PAGE_SIZE, Math.floor(rawSize)) : 20;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** 数据库状态 → 是否对匿名访客可见。定时发布依赖时间判断，不依赖定时任务准时。 */
export function isPubliclyVisible(status: string, publishedAt: Date | null): boolean {
  if (status !== "published") return false;
  if (!publishedAt) return true;
  return publishedAt.getTime() <= Date.now();
}

export function toIso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}
