/**
 * 后台用户管理。
 *
 * 三条贯穿全文件的规则：
 *   1. 响应永不带 passwordHash —— 序列化集中在 serializeUser 一处，避免某个接口漏掉；
 *   2. 跨用户操作先过 assertCanManageUser：持有 user.* 权限还不够，非 owner 碰不到 owner 账号；
 *   3. 改密、改角色、停用一律 revokeAllUserSessions，权限变更后旧会话不能继续生效。
 *
 * 删除用户不删内容：内容作者列做孤立引用保留（内容是有价值的，账号不是），
 * 响应里用 contentKept 明确告知，避免管理员以为内容一起被清了。
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, count, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { createDb, type Db } from "../db/client";
import { apiTokens, contents, rolePermissions, roles, sessions, userRoles, users } from "../db/schema";
import type { AppBindings } from "../env";
import { recordAudit } from "../lib/audit";
import { revokeAllUserSessions } from "../lib/auth";
import { checkPasswordStrength, hashPassword } from "../lib/crypto";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { assertCan, assertCanManageUser } from "../lib/rbac";
import { paginated, parsePagination, type PaginationInput } from "../lib/response";
import { getSiteConfig, siteSetting } from "../lib/settings";
import { ALL_PERMISSIONS, ROLE_KEYS, BUILTIN_ROLES } from "../shared/permissions";
import { envelope, IdParam, listResponse } from "./schemas";

type UserRow = typeof users.$inferSelect;

const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
  displayName: z.string(),
  status: z.string(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  website: z.string().nullable(),
  locale: z.string(),
  mustChangePassword: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  roles: z.array(z.string()),
  contentCount: z.number(),
});

const SessionSchema = z.object({
  id: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
});

const UserDetailSchema = UserSchema.extend({ sessions: z.array(SessionSchema) });

const ListQuery = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.string().trim().max(64).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

const CreateBody = z.object({
  email: z.string().email().max(200),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, "只能包含字母、数字、下划线与连字符"),
  displayName: z.string().trim().min(1).max(48),
  password: z.string().min(1).max(200).describe("明文口令，服务端只存 PBKDF2 哈希"),
  roles: z.array(z.string().min(1)).max(16).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  bio: z.string().max(600).nullable().optional(),
  website: z.string().max(300).nullable().optional(),
});

const UpdateBody = z.object({
  displayName: z.string().trim().min(1).max(48).optional(),
  bio: z.string().max(600).nullable().optional(),
  website: z.string().max(300).nullable().optional(),
  avatarUrl: z.string().max(400).nullable().optional(),
  status: z.enum(["active", "suspended"]).optional(),
  locale: z.string().trim().min(2).max(16).optional(),
});

const PasswordBody = z.object({ newPassword: z.string().min(1).max(200) });

const RolesBody = z.object({ roles: z.array(z.string().min(1)).max(16) });

function paginationOf(query: { page?: unknown; pageSize?: unknown }): PaginationInput {
  const raw = (value: unknown): string | undefined =>
    value === undefined || value === null ? undefined : String(value);
  return parsePagination({ page: raw(query.page), pageSize: raw(query.pageSize) });
}

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}

function serializeUser(row: UserRow, roleKeys: string[], contentCount: number) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.displayName,
    status: row.status,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    website: row.website,
    locale: row.locale,
    mustChangePassword: row.mustChangePassword,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    roles: roleKeys,
    contentCount,
  };
}

export function createUsersRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  /* ---------------------------------------------------------------- 读取 */

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["用户"],
      summary: "用户列表",
      description: "关键词匹配邮箱/用户名/昵称；role 按角色 key 过滤。内容数走 select count 子查询，不做 N+1。",
      request: { query: ListQuery },
      responses: {
        200: { description: "分页列表", content: { "application/json": { schema: listResponse(UserSchema) } } },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "user.read");
      const query = c.req.valid("query");
      const db = createDb(c.env.DB);
      const { page, pageSize, offset } = paginationOf(query);

      const conditions = [];
      if (query.q) {
        const needle = `%${query.q}%`;
        conditions.push(
          or(like(users.email, needle), like(users.username, needle), like(users.displayName, needle)),
        );
      }
      if (query.status) conditions.push(eq(users.status, query.status));
      if (query.role) {
        conditions.push(
          inArray(
            users.id,
            db
              .select({ id: userRoles.userId })
              .from(userRoles)
              .innerJoin(roles, eq(roles.id, userRoles.roleId))
              .where(eq(roles.key, query.role)),
          ),
        );
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select({
          user: users,
          contentCount: sql<number>`(select count(*) from contents c where c.author_id = ${users.id} and c.deleted_at is null)`,
        })
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(pageSize)
        .offset(offset);

      const [totalRow] = await db.select({ value: count() }).from(users).where(where);
      const roleMap = await loadRoleKeys(db, rows.map((row) => row.user.id));

      const items = rows.map((row) =>
        serializeUser(row.user, roleMap.get(row.user.id) ?? [], Number(row.contentCount ?? 0)),
      );
      return c.json(
        { ok: true as const, data: paginated(items, Number(totalRow?.value ?? 0), page, pageSize) },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/{id}",
      tags: ["用户"],
      summary: "用户详情",
      description: "含角色与最近 10 条会话（只给会话元信息，不含 tokenHash）。",
      request: { params: IdParam },
      responses: {
        200: { description: "详情", content: { "application/json": { schema: envelope(UserDetailSchema) } } },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "user.read");
      const { id } = c.req.valid("param");
      const db = createDb(c.env.DB);

      const detail = await loadUserSummary(db, id);
      const sessionRows = await db
        .select({
          id: sessions.id,
          ip: sessions.ip,
          userAgent: sessions.userAgent,
          createdAt: sessions.createdAt,
          expiresAt: sessions.expiresAt,
          revokedAt: sessions.revokedAt,
        })
        .from(sessions)
        .where(eq(sessions.userId, id))
        .orderBy(desc(sessions.createdAt))
        .limit(10);

      return c.json(
        {
          ok: true as const,
          data: {
            ...detail,
            sessions: sessionRows.map((row) => ({
              id: row.id,
              ip: row.ip,
              userAgent: row.userAgent,
              createdAt: row.createdAt.toISOString(),
              expiresAt: row.expiresAt.toISOString(),
              revokedAt: row.revokedAt?.toISOString() ?? null,
            })),
          },
        },
        200,
      );
    },
  );

  /* ---------------------------------------------------------------- 写入 */

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      tags: ["用户"],
      summary: "新建用户",
      description: "口令按站点设置 passwordMinLength 校验强度；roles 缺省为 ['author']。授予 owner 仅限站点所有者。",
      request: { body: { content: { "application/json": { schema: CreateBody } } } },
      responses: {
        201: { description: "创建成功", content: { "application/json": { schema: envelope(UserSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "user.create");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const config = await getSiteConfig(c.env, db);
      const minLength = Number(siteSetting<number>(config, "passwordMinLength") ?? 10);
      const weak = checkPasswordStrength(body.password, minLength);
      if (weak) throw badRequest(weak, { password: weak });

      const email = body.email.toLowerCase();
      const [dupe] = await db
        .select({ email: users.email, username: users.username })
        .from(users)
        .where(or(eq(users.email, email), eq(users.username, body.username)))
        .limit(1);
      if (dupe) {
        const fields: Record<string, string> = {};
        if (dupe.email === email) fields.email = "邮箱已被占用";
        if (dupe.username === body.username) fields.username = "用户名已被占用";
        throw conflict("邮箱或用户名已被占用", fields);
      }

      const roleRows = await ensureRoles(db, body.roles && body.roles.length > 0 ? body.roles : ["author"], auth.isSuperAdmin);

      const userId = newId("usr");
      const now = new Date();
      await db.insert(users).values({
        id: userId,
        email,
        username: body.username,
        displayName: body.displayName,
        passwordHash: await hashPassword(body.password),
        status: body.status ?? "active",
        bio: body.bio ?? null,
        avatarUrl: null,
        website: body.website ?? null,
        locale: "zh-CN",
        mustChangePassword: false,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(userRoles).values(
        roleRows.map((role) => ({ userId, roleId: role.id, grantedBy: auth.user.id, grantedAt: now })),
      );

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "user.create",
        targetType: "user",
        targetId: userId,
        meta: { email, username: body.username, roles: roleRows.map((role) => role.key) },
        ip: clientIp(c),
      });

      const summary = await loadUserSummary(db, userId);
      return c.json({ ok: true as const, data: summary }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      tags: ["用户"],
      summary: "更新用户资料",
      description:
        "可改昵称、简介、主页、头像、状态与语言。停用会立刻吊销该用户全部会话；owner 账号的状态只有 owner 自己能改，且不能停用自己。",
      request: { params: IdParam, body: { content: { "application/json": { schema: UpdateBody } } } },
      responses: {
        200: { description: "更新成功", content: { "application/json": { schema: envelope(UserSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "user.update");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!target) throw notFound("用户不存在");

      const targetIsOwner = await isOwner(db, id);
      assertCanManageUser(auth, { id, isOwner: targetIsOwner });

      const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
      if (body.displayName !== undefined) patch.displayName = body.displayName;
      if (body.bio !== undefined) patch.bio = body.bio;
      if (body.website !== undefined) patch.website = body.website;
      if (body.avatarUrl !== undefined) patch.avatarUrl = body.avatarUrl;
      if (body.locale !== undefined) patch.locale = body.locale;

      if (body.status !== undefined && body.status !== target.status) {
        if (targetIsOwner && auth.user.id !== target.id) {
          throw forbidden("只有站点所有者本人可以修改所有者账号的状态");
        }
        if (body.status === "suspended" && auth.user.id === target.id) {
          throw forbidden("不能停用自己的账号");
        }
        patch.status = body.status;
      }

      await db.update(users).set(patch).where(eq(users.id, id));
      if (patch.status === "suspended") await revokeAllUserSessions(db, id);

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "user.update",
        targetType: "user",
        targetId: id,
        meta: { fields: Object.keys(patch).filter((key) => key !== "updatedAt") },
        ip: clientIp(c),
      });

      const summary = await loadUserSummary(db, id);
      return c.json({ ok: true as const, data: summary }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/{id}/password",
      tags: ["用户"],
      summary: "重置用户密码",
      description: "只接受明文新口令，落库即哈希；重置后吊销该用户全部会话。",
      request: { params: IdParam, body: { content: { "application/json": { schema: PasswordBody } } } },
      responses: {
        200: {
          description: "重置成功",
          content: {
            "application/json": {
              schema: envelope(z.object({ reset: z.literal(true), revokedSessions: z.number() })),
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "user.update");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!target) throw notFound("用户不存在");
      assertCanManageUser(auth, { id, isOwner: await isOwner(db, id) });

      const config = await getSiteConfig(c.env, db);
      const minLength = Number(siteSetting<number>(config, "passwordMinLength") ?? 10);
      const weak = checkPasswordStrength(body.newPassword, minLength);
      if (weak) throw badRequest(weak, { newPassword: weak });

      await db
        .update(users)
        .set({
          passwordHash: await hashPassword(body.newPassword),
          mustChangePassword: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));
      const revokedSessions = await revokeAllUserSessions(db, id);

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "user.password.reset",
        targetType: "user",
        targetId: id,
        meta: { revokedSessions },
        ip: clientIp(c),
      });

      return c.json({ ok: true as const, data: { reset: true as const, revokedSessions } }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/{id}/roles",
      tags: ["用户"],
      summary: "分配角色",
      description:
        "整体替换用户角色集合。内置角色 key 若库里还没有会按 BUILTIN_ROLES 补建；授予 owner 仅限站点所有者，且不允许把最后一个 owner 降级。改完吊销该用户全部会话。",
      request: { params: IdParam, body: { content: { "application/json": { schema: RolesBody } } } },
      responses: {
        200: { description: "分配成功", content: { "application/json": { schema: envelope(UserSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "user.assignRole");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!target) throw notFound("用户不存在");

      const targetIsOwner = await isOwner(db, id);
      assertCanManageUser(auth, { id, isOwner: targetIsOwner });

      const nextKeys = [...new Set(body.roles)];
      if (nextKeys.length === 0) throw badRequest("至少要保留一个角色", { roles: "不能为空" });
      if (nextKeys.includes("owner") && !auth.isSuperAdmin) {
        throw forbidden("只有站点所有者可以授予 owner 角色");
      }
      if (targetIsOwner && !nextKeys.includes("owner") && (await countOwners(db)) <= 1) {
        throw conflict("站点必须至少保留一个所有者，不能降级最后一个 owner");
      }

      const roleRows = await ensureRoles(db, nextKeys, auth.isSuperAdmin);
      const now = new Date();
      await db.delete(userRoles).where(eq(userRoles.userId, id));
      await db
        .insert(userRoles)
        .values(roleRows.map((role) => ({ userId: id, roleId: role.id, grantedBy: auth.user.id, grantedAt: now })));
      const revokedSessions = await revokeAllUserSessions(db, id);

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "user.role.assign",
        targetType: "user",
        targetId: id,
        meta: { roles: roleRows.map((role) => role.key), revokedSessions },
        ip: clientIp(c),
      });

      const summary = await loadUserSummary(db, id);
      return c.json({ ok: true as const, data: summary }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      tags: ["用户"],
      summary: "删除用户",
      description:
        "连同 user_roles、sessions、api_tokens 一起删除；内容保留（作者列成为孤立引用），响应里用 contentKept 告知保留了多少条。不能删自己，也不能删最后一个 owner。",
      request: { params: IdParam },
      responses: {
        200: {
          description: "删除成功",
          content: {
            "application/json": {
              schema: envelope(z.object({ deleted: z.literal(true), contentKept: z.number() })),
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "user.delete");
      const { id } = c.req.valid("param");
      const db = createDb(c.env.DB);

      if (id === auth.user.id) throw badRequest("不能删除自己的账号");

      const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!target) throw notFound("用户不存在");

      const targetIsOwner = await isOwner(db, id);
      assertCanManageUser(auth, { id, isOwner: targetIsOwner });
      if (targetIsOwner && (await countOwners(db)) <= 1) {
        throw conflict("站点必须至少保留一个所有者，不能删除最后一个 owner");
      }

      const [kept] = await db
        .select({ value: count() })
        .from(contents)
        .where(eq(contents.authorId, id));

      await db.delete(userRoles).where(eq(userRoles.userId, id));
      await db.delete(sessions).where(eq(sessions.userId, id));
      // 令牌是账号的延伸，账号没了令牌必须一起失效，否则等于留了一把不记名的钥匙。
      await db.delete(apiTokens).where(eq(apiTokens.userId, id));
      await db.delete(users).where(eq(users.id, id));

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "user.delete",
        targetType: "user",
        targetId: id,
        meta: { email: target.email, username: target.username, contentKept: Number(kept?.value ?? 0) },
        ip: clientIp(c),
      });

      return c.json(
        { ok: true as const, data: { deleted: true as const, contentKept: Number(kept?.value ?? 0) } },
        200,
      );
    },
  );

  return app;
}

/* ------------------------------------------------------------------ 内部工具 */

async function loadRoleKeys(db: Db, userIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (userIds.length === 0) return result;
  const rows = await db
    .select({ userId: userRoles.userId, key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(userRoles.userId, userIds));
  for (const row of rows) {
    const bucket = result.get(row.userId);
    if (bucket) bucket.push(row.key);
    else result.set(row.userId, [row.key]);
  }
  return result;
}

async function loadUserSummary(db: Db, id: string) {
  const [row] = await db
    .select({
      user: users,
      contentCount: sql<number>`(select count(*) from contents c where c.author_id = ${users.id} and c.deleted_at is null)`,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!row) throw notFound("用户不存在");
  const roleMap = await loadRoleKeys(db, [id]);
  return serializeUser(row.user, roleMap.get(id) ?? [], Number(row.contentCount ?? 0));
}

async function isOwner(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ roleId: roles.id })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, userId), eq(roles.key, "owner")))
    .limit(1);
  return !!row;
}

async function countOwners(db: Db): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(roles.key, "owner"));
  return Number(row?.value ?? 0);
}

/**
 * 把角色 key 解析成角色行。
 * 内置 key 即使库里缺行也认（按 BUILTIN_ROLES 补建并写入权限集合），
 * 自定义 key 则必须已经在 roles 表里存在 —— 否则打错一个字就能造出一个空角色。
 */
async function ensureRoles(db: Db, keys: string[], isSuperAdmin: boolean) {
  const unique = [...new Set(keys)];
  if (unique.includes("owner") && !isSuperAdmin) {
    throw forbidden("只有站点所有者可以授予 owner 角色");
  }

  const existing = await db.select({ id: roles.id, key: roles.key }).from(roles);
  const byKey = new Map(existing.map((row) => [row.key, row]));

  const unknown = unique.filter((key) => !byKey.has(key) && !(ROLE_KEYS as readonly string[]).includes(key));
  if (unknown.length > 0) {
    throw badRequest(`角色不存在：${unknown.join("、")}`, { roles: unknown.join("、") });
  }

  for (const key of unique) {
    if (byKey.has(key)) continue;
    const definition = BUILTIN_ROLES.find((role) => role.key === key);
    if (!definition) throw badRequest(`角色不存在：${key}`, { roles: key });

    const roleId = newId("rol");
    const now = new Date();
    await db.insert(roles).values({
      id: roleId,
      key: definition.key,
      name: definition.name,
      description: definition.description,
      isSystem: true,
      sortOrder: definition.sortOrder,
      createdAt: now,
      updatedAt: now,
    });

    const permissions =
      definition.permissions.length === 1 && definition.permissions[0] === "*"
        ? ALL_PERMISSIONS
        : (definition.permissions as string[]);
    if (permissions.length > 0) {
      await db.insert(rolePermissions).values(permissions.map((permission) => ({ roleId, permission })));
    }
    byKey.set(key, { id: roleId, key });
  }

  return unique.map((key) => byKey.get(key)!);
}

export { UserSchema, UserDetailSchema, createUsersRoutes as createUserRoutes };
