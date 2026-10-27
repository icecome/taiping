/**
 * 统一请求封装。
 *
 * 三件事只在这里做一次：
 *   1. 拆信封 `{ ok, data }` / `{ ok:false, error }`，业务代码只拿 data；
 *   2. 把失败转成带 code / message / fields 的 ApiError，表单据此定位到字段；
 *   3. 401 自动跳登录页（启动时的 /auth/me 探活显式关掉，避免未登录时空转刷屏）。
 *
 * 凭证一律走 HttpOnly cookie，所以每个请求都带 credentials: "include"。
 */

/** 后台在生产环境挂在 /admin，路由 basename 与这里的跳转目标必须一致。 */
export const ADMIN_BASE = "/admin";

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export class ApiError extends Error {
  readonly code: string;
  readonly fields: Record<string, string>;
  readonly status: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || "请求失败");
    this.name = "ApiError";
    this.code = body.code;
    this.fields = body.fields ?? {};
    this.status = status;
  }
}

type QueryValue = string | number | boolean | undefined | null;

/** 组装查询串：空串、null、undefined 一律不传，避免服务端把 "" 当成有效筛选值。 */
export function qs(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  json?: unknown;
  form?: FormData;
  query?: Record<string, QueryValue>;
  /** 401 时是否自动跳登录页；启动探活传 false。 */
  redirectOn401?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", json, form, query, redirectOn401 = true } = options;
  const url = `/api${path}${query ? qs(query) : ""}`;

  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (form) {
    body = form;
  } else if (json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(json);
  }

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body, credentials: "include" });
  } catch {
    throw new ApiError(0, { code: "NETWORK_ERROR", message: "网络请求失败，请检查与服务的连接" });
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const parsed = extractError(payload, response.status);
    if (response.status === 401 && redirectOn401) redirectToLogin();
    throw new ApiError(response.status, parsed);
  }

  if (payload && typeof payload === "object" && "ok" in payload) {
    const envelope = payload as { ok: boolean; data?: T; error?: ApiErrorBody };
    if (envelope.ok === true) return envelope.data as T;
    if (envelope.error) throw new ApiError(response.status, envelope.error);
  }

  throw new ApiError(response.status, {
    code: "MALFORMED_RESPONSE",
    message: "服务端返回了无法解析的响应",
  });
}

function extractError(payload: unknown, status: number): ApiErrorBody {
  if (payload && typeof payload === "object") {
    const candidate = payload as { error?: unknown; message?: unknown };
    const error = candidate.error;
    if (error && typeof error === "object") {
      const shaped = error as { code?: unknown; message?: unknown; fields?: unknown };
      return {
        code: typeof shaped.code === "string" ? shaped.code : `HTTP_${status}`,
        message: typeof shaped.message === "string" ? shaped.message : `请求失败（${status}）`,
        fields: normalizeFields(shaped.fields),
      };
    }
    if (typeof candidate.message === "string" && candidate.message) {
      return { code: `HTTP_${status}`, message: candidate.message };
    }
  }
  return { code: `HTTP_${status}`, message: `请求失败（HTTP ${status}）` };
}

function normalizeFields(input: unknown): Record<string, string> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    out[key] = typeof value === "string" ? value : String(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 跳转到后台登录页；已经在登录页时不动，避免刷新循环。 */
export function redirectToLogin(): void {
  const target = `${ADMIN_BASE}/login`;
  if (window.location.pathname !== target) window.location.assign(target);
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isUnauthorized(error: unknown): boolean {
  return isApiError(error) && (error.status === 401 || error.code === "UNAUTHORIZED");
}

export function isForbidden(error: unknown): boolean {
  return isApiError(error) && (error.status === 403 || error.code === "FORBIDDEN");
}

/** 面向界面的错误文案；未登录与无权限给更明确的说法。 */
export function errorMessage(error: unknown): string {
  if (isUnauthorized(error)) return "登录状态已失效，请重新登录";
  if (isForbidden(error)) return isApiError(error) ? error.message : "没有执行该操作的权限";
  if (isApiError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return "发生未知错误";
}
