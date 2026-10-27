/**
 * API 令牌（PAT）。
 *
 * 明文只出现一次：创建响应里返回 token，库里只存 sha256Hex(token) 与前 8 位前缀。
 * 列表/详情永远不带 tokenHash —— 即使前缀也只是给人眼认"这把是哪把"，
 * 不构成任何可用于伪造的凭据。
 *
 * 令牌挂在用户身上，权限沿用该用户的角色权限（RBAC 判定与对话式登录完全一致），
 * 因此改角色、改密码后的 revokeAllUserSessions 会连带让旧令牌失效（见 api/users.ts）。
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, desc, eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { apiTokens } from "../db/schema";
import type { AppBindings } from "../env";
import { recordAudit } from "../lib/audit";
import { sha256Hex } from "../lib/crypto";
import { forbidden, notFound } from "../lib/errors";
import { newId, newSecretToken } from "../lib/id";
import { assertCan } from "../lib/rbac";
import { envelope } from "./schemas";

const TokenSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  tokenPrefix: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});

const CreateResponseSchema = TokenSchema.extend({
  token: z.string().describe("明文令牌，仅创建响应返回一次，请立即保存"),
});

const ListQuery = z.object({
  all: z.enum(["true", "false"]).default("false").optional().describe("置 true 且为站点所有者时可见全部用户的令牌"),
});

const CreateBody = z.object({
  name: z.string().trim().min(1).max(64),
  scopes: z.array(z.string().min(1)).max(50).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(3650).optional(),
});

function parseScopes(scopesJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(scopesJson);
    if (Array.isArray(parsed)) return parsed.filter((value): value is string => typeof value === "string");
    return [];
  } catch {
    return [];
  }
}

function serializeToken(row: typeof apiTokens.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scopes: parseScopes(row.scopesJson),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createTokensRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["API 令牌"],
      summary: "令牌列表",
      description: "默认只看自己的令牌；all=true 且为站点所有者时可看全部。响应不含 tokenHash。",
      request: { query: ListQuery },
      responses: {
        200: {
          description: "令牌列表",
          content: {
            "application/json": {
              schema: envelope(z.object({ items: z.array(TokenSchema) })),
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "system.token.manage");
      const query = c.req.valid("query");
      const db = createDb(c.env.DB);

      const seeAll = (query.all ?? "false") === "true" && auth.isSuperAdmin;
      const rows = await db
        .select()
        .from(apiTokens)
        .where(seeAll ? undefined : eq(apiTokens.userId, auth.user.id))
        .orderBy(desc(apiTokens.createdAt))
        .limit(200);

      return c.json({ ok: true as const, data: { items: rows.map((row) => serializeToken(row)) } }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      tags: ["API 令牌"],
      summary: "创建令牌",
      description: "48 字节 CSPRNG 生成，库中只存 SHA-256；明文 token 只在本次响应里出现一次。",
      request: { body: { content: { "application/json": { schema: CreateBody } } } },
      responses: {
        201: { description: "创建成功", content: { "application/json": { schema: envelope(CreateResponseSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "system.token.manage");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const token = newSecretToken(48);
      const scopes = [...new Set(body.scopes ?? [])];
      const id = newId("tok");
      const now = new Date();
      const expiresAt = body.expiresInDays ? new Date(now.getTime() + body.expiresInDays * 24 * 60 * 60 * 1000) : null;

      await db.insert(apiTokens).values({
        id,
        name: body.name,
        tokenHash: await sha256Hex(token),
        tokenPrefix: token.slice(0, 8),
        userId: auth.user.id,
        scopesJson: JSON.stringify(scopes),
        lastUsedAt: null,
        expiresAt,
        createdAt: now,
      });

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "token.create",
        targetType: "api_token",
        targetId: id,
        meta: { name: body.name, tokenPrefix: token.slice(0, 8), scopes, expiresAt: expiresAt?.toISOString() ?? null },
        ip: clientIp(c),
      });

      const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, id)).limit(1);
      return c.json({ ok: true as const, data: { ...serializeToken(row!), token } }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      tags: ["API 令牌"],
      summary: "吊销令牌",
      description: "只能吊销自己的令牌；站点所有者可以吊销任意令牌。",
      request: { params: z.object({ id: z.string().min(1).openapi({ param: { name: "id", in: "path" } }) }) },
      responses: {
        200: {
          description: "已吊销",
          content: {
            "application/json": {
              schema: envelope(z.object({ revoked: z.literal(true), id: z.string() })),
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "system.token.manage");
      const { id } = c.req.valid("param");
      const db = createDb(c.env.DB);

      const [existing] = await db.select().from(apiTokens).where(eq(apiTokens.id, id)).limit(1);
      if (!existing) throw notFound("令牌不存在");
      if (existing.userId !== auth.user.id && !auth.isSuperAdmin) {
        throw forbidden("只能吊销自己的令牌");
      }

      await db.delete(apiTokens).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, existing.userId)));

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "token.revoke",
        targetType: "api_token",
        targetId: id,
        meta: { ownerId: existing.userId, tokenPrefix: existing.tokenPrefix },
        ip: clientIp(c),
      });

      return c.json({ ok: true as const, data: { revoked: true as const, id } }, 200);
    },
  );

  return app;
}

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}

export { TokenSchema, createTokensRoutes as createTokenRoutes };
