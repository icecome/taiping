/**
 * 统一错误类型。
 *
 * 与 LuyBlog 相比的最大差别：错误在这里带 `code`，前端可以按 code 做本地化文案，
 * 而不是把英文 message 直接摊给用户。
 */
export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INTERNAL";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  /** 直接返回给客户端的补充字段，例如字段级校验错误。 */
  readonly fields?: Record<string, string>;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { details?: unknown; fields?: Record<string, string>; status?: number },
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = options?.status ?? STATUS_BY_CODE[code];
    this.details = options?.details;
    this.fields = options?.fields;
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new AppError("BAD_REQUEST", message, { fields });
export const validationFailed = (message: string, fields?: Record<string, string>) =>
  new AppError("VALIDATION_FAILED", message, { fields });
export const unauthorized = (message = "请先登录") => new AppError("UNAUTHORIZED", message);
export const forbidden = (message = "权限不足") => new AppError("FORBIDDEN", message);
export const notFound = (message = "资源不存在") => new AppError("NOT_FOUND", message);
export const conflict = (message: string, fields?: Record<string, string>) =>
  new AppError("CONFLICT", message, { fields });
export const rateLimited = (message = "操作过于频繁，请稍后再试") => new AppError("RATE_LIMITED", message);
export const internal = (message = "服务端异常") => new AppError("INTERNAL", message);

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
