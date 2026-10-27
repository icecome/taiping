import type { ErrorHandler, NotFoundHandler } from "hono";
import type { AppBindings } from "../env";
import { AppError, isAppError } from "../lib/errors";

/** 统一错误响应：`{ ok:false, error:{ code, message, fields? } }`。 */
export const errorHandler: ErrorHandler<AppBindings> = (error, c) => {
  const requestId = c.get("requestId") ?? "-";
  if (isAppError(error)) {
    if (error.status >= 500) console.error(`[${requestId}] app error`, error);
    return c.json(
      {
        ok: false as const,
        error: { code: error.code, message: error.message, fields: error.fields },
      },
      error.status as never,
    );
  }
  console.error(`[${requestId}] unhandled error`, error);
  return c.json(
    {
      ok: false as const,
      error: { code: "INTERNAL", message: "服务端异常，请稍后重试" },
    },
    500,
  );
};

export const notFoundHandler: NotFoundHandler<AppBindings> = (c) => {
  const path = c.req.path;
  if (path.startsWith("/api/")) {
    return c.json(
      { ok: false as const, error: { code: "NOT_FOUND", message: `接口不存在：${path}` } },
      404,
    );
  }
  return c.json(
    { ok: false as const, error: { code: "NOT_FOUND", message: "页面不存在" } },
    404,
  );
};

export function toAppError(error: unknown): AppError {
  return isAppError(error) ? error : new AppError("INTERNAL", "服务端异常");
}
