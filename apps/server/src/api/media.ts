/**
 * 媒体库接口（R2 对象存储 + D1 元数据）
 *
 * 设计取舍：
 * - 二进制进 R2，元数据进 D1，两者用 storage_key 关联；storage_key 由内容哈希派生，
 *   因此同一张图重复上传不会在 R2 里留下多份副本（媒体库去重就靠这一点，不靠文件名）。
 * - `url` 字段是渲染期唯一需要的出口：R2 走 `/media/<key>`（app.ts 里的直出路由带强缓存），
 *   外链走登记时写入的 external_url。前台模板不需要知道驱动差异。
 * - 上传走 multipart/form-data，不套 createRoute 的 json body —— zod-openapi 的请求体校验
 *   在 multipart 上没有对应描述能力，硬套会让 OpenAPI 文档说谎；这里手动校验并逐条抛 AppError。
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, count, desc, eq, like, type SQL } from "drizzle-orm";
import { createDb } from "../db/client";
import { contents, media } from "../db/schema";
import type { AppBindings } from "../env";
import { recordAudit } from "../lib/audit";
import { bumpCacheVersion } from "../lib/cache";
import { sha256Base64, sha256Hex } from "../lib/crypto";
import { AppError, badRequest, forbidden, notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { assertAuthenticated, assertCan, canAny } from "../lib/rbac";
import { paginated, parsePagination } from "../lib/response";
import { getSiteConfig, siteSetting } from "../lib/settings";
import { envelope, IdParam, listResponse, PaginationQuery } from "./schemas";

/* ------------------------------------------------------------------ schema */

const MediaSchema = z.object({
  id: z.string(),
  filename: z.string(),
  storageKey: z.string(),
  mimeType: z.string(),
  size: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  altText: z.string().nullable(),
  caption: z.string().nullable(),
  folder: z.string(),
  driver: z.enum(["r2", "external"]),
  url: z.string(),
  createdAt: z.string(),
  uploaderId: z.string(),
});

const MediaListQuery = PaginationQuery.extend({
  folder: z.string().max(200).optional().describe("按文件夹精确过滤，如 /images/2026"),
  mimePrefix: z.string().max(60).optional().describe("按 MIME 前缀过滤，如 image/"),
});

const MediaPatchBody = z.object({
  altText: z.string().max(300).nullable().optional().describe("替代文本，给屏幕阅读器与 SEO 用"),
  caption: z.string().max(500).nullable().optional(),
  folder: z.string().max(200).nullable().optional(),
});

const FromUrlBody = z.object({
  url: z.string().url().max(1000),
  filename: z.string().min(1).max(300),
  mimeType: z.string().max(120).optional(),
  altText: z.string().max(300).optional(),
  folder: z.string().max(200).optional(),
});

/* ------------------------------------------------------------------ 工具 */

type MediaRow = typeof media.$inferSelect;

function serializeMedia(row: MediaRow) {
  return {
    id: row.id,
    filename: row.filename,
    storageKey: row.storageKey,
    mimeType: row.mimeType,
    size: row.size,
    width: row.width,
    height: row.height,
    altText: row.altText,
    caption: row.caption,
    folder: row.folder,
    driver: row.driver,
    url: row.driver === "external" ? (row.externalUrl ?? "") : `/media/${row.storageKey}`,
    createdAt: row.createdAt.toISOString(),
    uploaderId: row.uploaderId,
  };
}

/** 文件夹归一化：统一成 `/a/b` 形态（根目录为 `/`），空值回落根目录。 */
function normalizeFolder(input: string | null | undefined): string {
  if (!input) return "/";
  const trimmed = input.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  const stripped = trimmed.replace(/^\/+/, "").replace(/\/+$/, "");
  return stripped ? `/${stripped}` : "/";
}

const MIME_BY_EXT: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  css: "text/css",
  csv: "text/csv",
  gif: "image/gif",
  heic: "image/heic",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript",
  json: "application/json",
  m4a: "audio/mp4",
  md: "text/markdown",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain",
  webm: "video/webm",
  webp: "image/webp",
  woff2: "font/woff2",
  zip: "application/zip",
};

/** 后缀 → 取不到的 MIME 再回退到 octet-stream，保证写入记录的 mime_type 永不为空。 */
function resolveMime(type: string, filename: string): string {
  if (type) return type.toLowerCase();
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** 扩展名：优先取原始文件名，取不到时按 MIME 反查。 */
function resolveExtension(filename: string, mime: string): string {
  const hasDot = filename.includes(".");
  const raw = hasDot ? (filename.split(".").pop() ?? "").toLowerCase() : "";
  if (/^[a-z0-9]{1,8}$/.test(raw)) return raw;
  const hit = Object.entries(MIME_BY_EXT).find(([, value]) => value === mime);
  return hit?.[0] ?? "bin";
}

/** 按 MIME 前缀匹配白名单；白名单项支持 `image/`、`image/*`、`image` 三种写法。 */
function mimeAllowed(mime: string, allowed: string[]): boolean {
  return allowed.some((entry) => {
    const value = entry.trim().toLowerCase();
    if (!value) return false;
    if (value.endsWith("/*")) return mime.startsWith(value.slice(0, -1));
    if (value.endsWith("/")) return mime.startsWith(value);
    if (!value.includes("/")) return mime.startsWith(`${value}/`);
    return mime === value;
  });
}

function sanitizeFilename(name: string, fallback: string): string {
  const base = name.split(/[\\/]/).pop()?.trim() ?? "";
  return (base || fallback).slice(0, 200);
}

/* ------------------------------------------------------------------ 路由 */

export function createMediaRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  /* ---------------------------------------------------------------- 列表 */

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["媒体"],
      summary: "媒体库列表",
      description: "按上传时间倒序；支持文件名关键字、文件夹与 MIME 前缀过滤。",
      request: { query: MediaListQuery },
      responses: {
        200: { description: "分页列表", content: { "application/json": { schema: listResponse(MediaSchema) } } },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "media.read");
      const query = c.req.valid("query");
      const db = createDb(c.env.DB);
      const { page, pageSize } = parsePagination({
        page: query.page === undefined ? undefined : String(query.page),
        pageSize: query.pageSize === undefined ? undefined : String(query.pageSize),
      });

      const conditions: SQL[] = [];
      if (query.q) conditions.push(like(media.filename, `%${query.q}%`));
      if (query.folder) conditions.push(eq(media.folder, normalizeFolder(query.folder)));
      if (query.mimePrefix) conditions.push(like(media.mimeType, `${query.mimePrefix}%`));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select()
        .from(media)
        .where(where)
        .orderBy(desc(media.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const [totalRow] = await db.select({ value: count() }).from(media).where(where);

      return c.json(
        {
          ok: true as const,
          data: paginated(rows.map(serializeMedia), Number(totalRow?.value ?? 0), page, pageSize),
        },
        200,
      );
    },
  );

  /* ---------------------------------------------------------------- 上传 */

  app.post("/upload", async (c) => {
    const auth = assertCan(c.get("auth"), "media.upload");
    const db = createDb(c.env.DB);
    const config = await getSiteConfig(c.env, db);

    const form = await c.req.formData();
    const rawFile = form.get("file");
    if (!rawFile || typeof rawFile === "string") throw badRequest("缺少上传文件", { file: "必填" });
    const file = rawFile;

    if (file.size <= 0) throw badRequest("文件内容为空", { file: "空文件" });

    const maxMb = Number(siteSetting<number>(config, "maxUploadSizeMb") ?? 8);
    const maxBytes = Math.max(1, maxMb) * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new AppError("PAYLOAD_TOO_LARGE", `文件 ${(file.size / 1024 / 1024).toFixed(2)} MB 超过站点上限 ${maxMb} MB`);
    }

    const allowed = siteSetting<string[]>(config, "allowedUploadTypes") ?? [];
    const mime = resolveMime(file.type, file.name ?? "");
    if (!mimeAllowed(mime, allowed)) {
      throw new AppError("UNSUPPORTED_MEDIA_TYPE", `不允许上传的类型：${mime}（站点白名单：${allowed.join("、") || "空"}）`);
    }

    const buffer = await file.arrayBuffer();
    // sha256Base64 的实现返回的是十六进制摘要（见 lib/crypto.ts），这里把它同时当作内容指纹与 key 前缀。
    const checksum = await sha256Base64(buffer);

    const [duplicated] = await db.select().from(media).where(eq(media.checksum, checksum)).limit(1);
    if (duplicated) {
      return c.json({ ok: true as const, data: { ...serializeMedia(duplicated), deduplicated: true } }, 200);
    }

    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const ext = resolveExtension(file.name ?? "", mime);
    const folder = normalizeFolder(typeof form.get("folder") === "string" ? String(form.get("folder")) : "/");
    const prefix = folder.replace(/^\/+/, "");
    const storageKey = `${prefix ? `${prefix}/` : ""}${yyyy}/${mm}/${checksum.slice(0, 16)}.${ext}`;

    await c.env.MEDIA.put(storageKey, buffer, { httpMetadata: { contentType: mime } });

    const altRaw = form.get("altText");
    const altText = typeof altRaw === "string" && altRaw.trim() ? altRaw.trim().slice(0, 300) : null;
    const id = newId("med");

    await db.insert(media).values({
      id,
      storageKey,
      filename: sanitizeFilename(file.name ?? "", `${checksum.slice(0, 16)}.${ext}`),
      mimeType: mime,
      size: file.size,
      // Workers 运行时没有图片解码器（无 Canvas / ImageBitmap / sharp），
      // 因此这里不做尺寸探测，width/height 留 null，由前台按图片固有尺寸自适应布局。
      // 若确实需要尺寸，正确做法是在 R2 事件通知里挂一个带 sharp 的 Worker 异步回填这两列。
      width: null,
      height: null,
      checksum,
      altText,
      caption: null,
      folder,
      driver: "r2",
      externalUrl: null,
      uploaderId: auth.user.id,
      createdAt: now,
    });

    const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
    await bumpCacheVersion(c.env);
    await recordAudit(db, {
      actorId: auth.user.id,
      actorName: auth.user.displayName,
      action: "media.upload",
      targetType: "media",
      targetId: id,
      meta: { filename: file.name, size: file.size, mime, storageKey },
      ip: c.req.header("cf-connecting-ip") ?? null,
    });

    return c.json({ ok: true as const, data: { ...serializeMedia(row!), deduplicated: false } }, 201);
  });

  /* ---------------------------------------------------------------- 更新 */

  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      tags: ["媒体"],
      summary: "更新媒体信息",
      description: "只改元数据（替代文本、说明、文件夹），不动 R2 里的对象。",
      request: {
        params: IdParam,
        body: { content: { "application/json": { schema: MediaPatchBody } } },
      },
      responses: {
        200: { description: "更新成功", content: { "application/json": { schema: envelope(MediaSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "media.update");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const [existing] = await db.select().from(media).where(eq(media.id, id)).limit(1);
      if (!existing) throw notFound("媒体不存在");

      const patch: Partial<typeof media.$inferInsert> = {};
      if (body.altText !== undefined) patch.altText = body.altText ? body.altText.slice(0, 300) : null;
      if (body.caption !== undefined) patch.caption = body.caption ? body.caption.slice(0, 500) : null;
      if (body.folder !== undefined) patch.folder = normalizeFolder(body.folder);

      if (Object.keys(patch).length > 0) {
        await db.update(media).set(patch).where(eq(media.id, id));
      }

      const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
      // R6：写操作同时失效页面缓存版本 —— 替代文本与说明会出现在前台 img/caption 上。
      await bumpCacheVersion(c.env);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "media.update",
        targetType: "media",
        targetId: id,
        meta: { fields: Object.keys(patch) },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });
      return c.json({ ok: true as const, data: serializeMedia(row!) }, 200);
    },
  );

  /* ---------------------------------------------------------------- 删除 */

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      tags: ["媒体"],
      summary: "删除媒体",
      description:
        "先删 R2 对象再删元数据。被内容用作封面时仍然删除，响应里的 usedBy 告诉调用方有多少篇内容的封面因此失效。",
      request: { params: IdParam },
      responses: {
        200: {
          description: "已删除；usedBy > 0 表示有内容曾把它当封面",
          content: {
            "application/json": {
              schema: envelope(
                z.object({ deleted: z.literal(true), usedBy: z.number(), message: z.string() }),
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = assertAuthenticated(c.get("auth"));
      const { id } = c.req.valid("param");
      const db = createDb(c.env.DB);

      const [existing] = await db.select().from(media).where(eq(media.id, id)).limit(1);
      if (!existing) throw notFound("媒体不存在");

      // 自己的文件要 media.delete.own，别人的要 media.delete.any；
      // 持有 .any 的人天然也能删自己的，避免角色配置里漏配 .own 反而删不掉。
      const isOwner = existing.uploaderId === auth.user.id;
      const allowed = isOwner
        ? canAny(auth, ["media.delete.own", "media.delete.any"])
        : canAny(auth, ["media.delete.any"]);
      if (!allowed) throw forbidden(isOwner ? "缺少权限：media.delete.own" : "只能删除自己上传的文件");

      const [usedRow] = await db
        .select({ value: count() })
        .from(contents)
        .where(eq(contents.coverMediaId, id));
      const usedBy = Number(usedRow?.value ?? 0);

      if (existing.driver === "r2") {
        try {
          await c.env.MEDIA.delete(existing.storageKey);
        } catch (error) {
          // 对象不存在（或 R2 抖动）不应该挡住元数据清理：留下孤儿记录比留下删不掉的记录更糟。
          console.error("[media] r2 delete failed", existing.storageKey, error);
        }
      }

      await db.delete(media).where(eq(media.id, id));
      // 封面引用可能出现在已缓存的页面 HTML 里，删文件后让页面缓存整体失效。
      await bumpCacheVersion(c.env);

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "media.delete",
        targetType: "media",
        targetId: id,
        meta: { storageKey: existing.storageKey, usedBy },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });

      return c.json(
        {
          ok: true as const,
          data: {
            deleted: true as const,
            usedBy,
            message:
              usedBy > 0
                ? `已删除；该文件曾被 ${usedBy} 篇内容用作封面，这些内容的封面引用需要重新指定`
                : "已删除",
          },
        },
        200,
      );
    },
  );

  /* ---------------------------------------------------------------- 外链登记 */

  app.openapi(
    createRoute({
      method: "post",
      path: "/from-url",
      tags: ["媒体"],
      summary: "登记外部链接",
      description:
        "只写元数据、不下拉文件：适合 CDN、图床、对象存储上已有的资源。相同 URL 重复登记会复用已有记录。",
      request: { body: { content: { "application/json": { schema: FromUrlBody } } } },
      responses: {
        201: { description: "登记成功", content: { "application/json": { schema: envelope(MediaSchema) } } },
        200: { description: "该 URL 已登记，返回已有记录", content: { "application/json": { schema: envelope(MediaSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "media.upload");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      if (!/^https?:\/\//i.test(body.url)) throw badRequest("外链必须以 http:// 或 https:// 开头", { url: "协议不支持" });

      const [existing] = await db.select().from(media).where(eq(media.externalUrl, body.url)).limit(1);
      if (existing) return c.json({ ok: true as const, data: serializeMedia(existing) }, 200);

      const now = new Date();
      const yyyy = String(now.getUTCFullYear());
      const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
      const checksum = await sha256Hex(body.url);
      const mime = resolveMime(body.mimeType ?? "", body.filename).toLowerCase();
      const ext = resolveExtension(body.filename, mime);
      const folder = normalizeFolder(body.folder ?? "/");
      const prefix = folder.replace(/^\/+/, "");
      const storageKey = `${prefix ? `${prefix}/` : ""}external/${yyyy}/${mm}/${checksum.slice(0, 16)}.${ext}`;

      const id = newId("med");
      await db.insert(media).values({
        id,
        storageKey,
        filename: sanitizeFilename(body.filename, `${checksum.slice(0, 16)}.${ext}`),
        mimeType: mime,
        size: 0,
        width: null,
        height: null,
        checksum,
        altText: body.altText?.slice(0, 300) ?? null,
        caption: null,
        folder,
        driver: "external",
        externalUrl: body.url,
        uploaderId: auth.user.id,
        createdAt: now,
      });

      const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
      await bumpCacheVersion(c.env);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "media.external.register",
        targetType: "media",
        targetId: id,
        meta: { url: body.url, filename: body.filename },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });

      return c.json({ ok: true as const, data: serializeMedia(row!) }, 201);
    },
  );

  return app;
}

export { MediaSchema };
