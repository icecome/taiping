/**
 * 认证与账号自助接口。
 *
 * 与参考项目的差别：
 * - LuyBlog 只有 GitHub OAuth 一条路，session 明文入库、30 天不可撤销；
 * - 这里走"邮箱/用户名 + 口令 + 可撤销会话"，并保留 PAT（见 api/tokens.ts）给脚本用。
 *   OAuth 作为后续扩展点留白，不影响现有模型（users 表加 provider 列即可）。
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, count, desc, eq, isNull, or } from "drizzle-orm";
import { createDb } from "../db/client";
import { roles, sessions, userRoles, users } from "../db/schema";
import type { AppBindings } from "../env";
import { recordAudit } from "../lib/audit";
import { ensureBuiltinRoles } from "../lib/bootstrap";
import {
  clearSessionCookie,
  createSession,
  hashToken,
  loadAuthContext,
  revokeAllUserSessions,
  revokeCurrentSession,
  setSessionCookie,
} from "../lib/auth";
import { checkPasswordStrength, hashPassword, verifyPassword } from "../lib/crypto";
import { badRequest, conflict, forbidden, notFound, rateLimited, unauthorized } from "../lib/errors";
import { envelope, IdParam } from "./schemas";
import { created, ok, parsePagination } from "../lib/response";
import { getSiteConfig, siteSetting } from "../lib/settings";
import { rateLimit } from "../middleware/security";
import { assertCan } from "../lib/rbac";
import { newId } from "../lib/id";

const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  isSuperAdmin: z.boolean(),
  mustChangePassword: z.boolean(),
});

const LoginBody = z.object({
  identifier: z.string().min(1).describe("邮箱或用户名"),
  password: z.string().min(1),
  remember: z.boolean().optional(),
});

const SetupBody = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  displayName: z.string().min(1).max(48),
  password: z.string().min(10).max(128),
  setupToken: z.string().optional().describe("配置了 SETUP_TOKEN 时必须携带"),
});

const PasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(128),
});

const RegisterBody = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  displayName: z.string().min(1).max(48),
  password: z.string().min(10).max(128),
});

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}

export function createAuthRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  /* ---------------------------------------------------------------- 初始化 */

  app.openapi(
    createRoute({
      method: "post",
      path: "/setup",
      tags: ["认证"],
      summary: "首次初始化站点所有者",
      description: "仅当用户表为空时可调用；成功后直接返回登录态。",
      request: { body: { content: { "application/json": { schema: SetupBody } } } },
      responses: {
        201: { description: "创建成功", content: { "application/json": { schema: envelope(UserSchema) } } },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const [existing] = await db.select({ value: count() }).from(users);
      if ((existing?.value ?? 0) > 0) throw conflict("站点已初始化，请直接登录");

      if (c.env.SETUP_TOKEN && body.setupToken !== c.env.SETUP_TOKEN) {
        throw forbidden("初始化令牌不正确");
      }

      const config = await getSiteConfig(c.env, db);
      const minLength = Number(siteSetting<number>(config, "passwordMinLength") ?? 10);
      const weak = checkPasswordStrength(body.password, minLength);
      if (weak) throw badRequest(weak, { password: weak });

      // 首次初始化顺带把全部内置角色建好：这样后台一进去角色页就是可用的，
      // 而不是等管理员点进去才发现只有 owner 一个角色。
      await ensureBuiltinRoles(db);
      const ownerRole = await ensureOwnerRole(db);
      const userId = newId("usr");
      await db.insert(users).values({
        id: userId,
        email: body.email.toLowerCase(),
        username: body.username,
        displayName: body.displayName,
        passwordHash: await hashPassword(body.password),
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.insert(userRoles).values({ userId, roleId: ownerRole.id, grantedBy: null, grantedAt: new Date() });

      const session = await createSession(db, {
        userId,
        ttlDays: Number(siteSetting<number>(config, "sessionTtlDays") ?? 14),
        ip: clientIp(c),
        userAgent: c.req.header("user-agent") ?? null,
      });
      setSessionCookie(c, session.token, session.expiresAt, new URL(c.req.url).protocol === "https:");
      await recordAudit(db, {
        actorId: userId,
        actorName: body.displayName,
        action: "auth.setup",
        targetType: "user",
        targetId: userId,
        ip: clientIp(c),
      });

      const context = await loadAuthContext(db, userId);
      return created(c, {
        id: userId,
        email: body.email.toLowerCase(),
        username: body.username,
        displayName: body.displayName,
        avatarUrl: null,
        roles: context?.roles ?? ["owner"],
        permissions: context?.permissions ?? [],
        isSuperAdmin: true,
        mustChangePassword: false,
      });
    },
  );

  /* ---------------------------------------------------------------- 登录 */

  app.openapi(
    createRoute({
      method: "post",
      path: "/login",
      tags: ["认证"],
      summary: "登录",
      request: { body: { content: { "application/json": { schema: LoginBody } } } },
      responses: {
        200: { description: "登录成功", content: { "application/json": { schema: envelope(UserSchema) } } },
        401: { description: "凭据错误", content: { "application/json": { schema: z.any() } } },
        429: { description: "尝试过于频繁", content: { "application/json": { schema: z.any() } } },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);
      const config = await getSiteConfig(c.env, db);
      const ip = clientIp(c);

      const maxAttempts = Number(siteSetting<number>(config, "loginMaxAttempts") ?? 8);
      const lockMinutes = Number(siteSetting<number>(config, "loginLockMinutes") ?? 15);
      const limit = await rateLimit(c.env.KV, `login:${ip}`, maxAttempts * 5, lockMinutes * 60);
      if (!limit.allowed) {
        c.header("Retry-After", String(limit.resetSeconds));
        throw rateLimited(`尝试次数过多，请 ${Math.ceil(limit.resetSeconds / 60)} 分钟后再试`);
      }

      const identifier = body.identifier.trim().toLowerCase();
      const [user] = await db
        .select()
        .from(users)
        .where(or(eq(users.email, identifier), eq(users.username, body.identifier.trim())))
        .limit(1);

      // 用户不存在时也走一次哈希校验，避免用响应时间枚举账号。
      const valid = user
        ? await verifyPassword(body.password, user.passwordHash)
        : await verifyPassword(body.password, "pbkdf2$sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");

      if (!user || !valid) throw unauthorized("邮箱、用户名或密码不正确");
      if (user.status !== "active") throw forbidden("账号已被停用，请联系管理员");

      const ttlDays = Number(siteSetting<number>(config, "sessionTtlDays") ?? 14);
      const session = await createSession(db, {
        userId: user.id,
        ttlDays: body.remember ? Math.max(ttlDays, 30) : ttlDays,
        ip,
        userAgent: c.req.header("user-agent") ?? null,
      });
      setSessionCookie(c, session.token, session.expiresAt, new URL(c.req.url).protocol === "https:");
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      await recordAudit(db, {
        actorId: user.id,
        actorName: user.displayName,
        action: "auth.login",
        targetType: "user",
        targetId: user.id,
        ip,
      });

      const context = await loadAuthContext(db, user.id);
      return ok(c, {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        roles: context?.roles ?? [],
        permissions: context?.permissions ?? [],
        isSuperAdmin: context?.isSuperAdmin ?? false,
        mustChangePassword: user.mustChangePassword,
      });
    },
  );

  /* ---------------------------------------------------------------- 注册（前台） */

  app.openapi(
    createRoute({
      method: "post",
      path: "/register",
      tags: ["认证"],
      summary: "前台注册",
      description: "仅在站点设置开启「开放前台注册」时可用；注册用户只获得 subscriber 角色。",
      request: { body: { content: { "application/json": { schema: RegisterBody } } } },
      responses: {
        201: { description: "注册成功", content: { "application/json": { schema: envelope(UserSchema) } } },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);
      const config = await getSiteConfig(c.env, db);
      if (!siteSetting<boolean>(config, "allowRegistration")) throw forbidden("站点未开放注册");

      const limit = await rateLimit(c.env.KV, `register:${clientIp(c)}`, 5, 3600);
      if (!limit.allowed) throw rateLimited("注册过于频繁，请稍后再试");

      const weak = checkPasswordStrength(body.password, Number(siteSetting<number>(config, "passwordMinLength") ?? 10));
      if (weak) throw badRequest(weak, { password: weak });

      const [dupe] = await db
        .select({ id: users.id })
        .from(users)
        .where(or(eq(users.email, body.email.toLowerCase()), eq(users.username, body.username)))
        .limit(1);
      if (dupe) throw conflict("邮箱或用户名已被占用");

      const subscriberRole = await ensureRoleKey(db, "subscriber");
      const userId = newId("usr");
      await db.insert(users).values({
        id: userId,
        email: body.email.toLowerCase(),
        username: body.username,
        displayName: body.displayName,
        passwordHash: await hashPassword(body.password),
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.insert(userRoles).values({ userId, roleId: subscriberRole.id, grantedAt: new Date() });

      const session = await createSession(db, { userId, ttlDays: 7, ip: clientIp(c), userAgent: c.req.header("user-agent") ?? null });
      setSessionCookie(c, session.token, session.expiresAt, new URL(c.req.url).protocol === "https:");
      const context = await loadAuthContext(db, userId);
      return created(c, {
        id: userId,
        email: body.email.toLowerCase(),
        username: body.username,
        displayName: body.displayName,
        avatarUrl: null,
        roles: context?.roles ?? ["subscriber"],
        permissions: context?.permissions ?? [],
        isSuperAdmin: false,
        mustChangePassword: false,
      });
    },
  );

  /* ---------------------------------------------------------------- 会话 */

  app.openapi(
    createRoute({
      method: "get",
      path: "/me",
      tags: ["认证"],
      summary: "当前登录用户",
      responses: {
        200: { description: "已登录", content: { "application/json": { schema: envelope(UserSchema) } } },
        401: { description: "未登录", content: { "application/json": { schema: z.any() } } },
      },
    }),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) throw unauthorized();
      return ok(c, {
        id: auth.user.id,
        email: auth.user.email,
        username: auth.user.username,
        displayName: auth.user.displayName,
        avatarUrl: auth.user.avatarUrl,
        roles: auth.roles,
        permissions: auth.permissions,
        isSuperAdmin: auth.isSuperAdmin,
        mustChangePassword: auth.user.mustChangePassword,
      });
    },
  );

  app.post("/logout", async (c) => {
    const db = createDb(c.env.DB);
    const auth = c.get("auth");
    await revokeCurrentSession(c.env, db, c);
    clearSessionCookie(c);
    if (auth) {
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "auth.logout",
        ip: clientIp(c),
      });
    }
    return ok(c, { loggedOut: true });
  });

  app.openapi(
    createRoute({
      method: "post",
      path: "/password",
      tags: ["认证"],
      summary: "修改自己的密码",
      description: "改密会让该账号的其它设备会话全部失效。",
      request: { body: { content: { "application/json": { schema: PasswordBody } } } },
      responses: {
        200: { description: "修改成功", content: { "application/json": { schema: envelope(z.object({ revokedSessions: z.number() })) } } },
      },
    }),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) throw unauthorized();
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);
      const config = await getSiteConfig(c.env, db);

      const weak = checkPasswordStrength(body.newPassword, Number(siteSetting<number>(config, "passwordMinLength") ?? 10));
      if (weak) throw badRequest(weak, { newPassword: weak });

      const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, auth.user.id)).limit(1);
      if (!row) throw notFound("用户不存在");
      if (!(await verifyPassword(body.currentPassword, row.passwordHash))) {
        throw badRequest("当前密码不正确", { currentPassword: "不正确" });
      }

      await db
        .update(users)
        .set({ passwordHash: await hashPassword(body.newPassword), mustChangePassword: false, updatedAt: new Date() })
        .where(eq(users.id, auth.user.id));
      const revokedSessions = await revokeAllUserSessions(db, auth.user.id);

      // 管理员改密后重新签发当前会话，避免把自己踢出后台。
      const session = await createSession(db, {
        userId: auth.user.id,
        ttlDays: Number(siteSetting<number>(config, "sessionTtlDays") ?? 14),
        ip: clientIp(c),
        userAgent: c.req.header("user-agent") ?? null,
      });
      setSessionCookie(c, session.token, session.expiresAt, new URL(c.req.url).protocol === "https:");

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "auth.password.change",
        targetType: "user",
        targetId: auth.user.id,
        ip: clientIp(c),
      });
      return ok(c, { revokedSessions });
    },
  );

  const SessionSchema = z.object({
    id: z.string(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    createdAt: z.string(),
    expiresAt: z.string(),
    current: z.boolean(),
  });

  app.openapi(
    createRoute({
      method: "get",
      path: "/sessions",
      tags: ["认证"],
      summary: "我的登录设备",
      responses: {
        200: {
          description: "会话列表",
          content: { "application/json": { schema: envelope(z.object({ items: z.array(SessionSchema) })) } },
        },
      },
    }),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) throw unauthorized();
      const db = createDb(c.env.DB);
      const rows = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.userId, auth.user.id), isNull(sessions.revokedAt)))
        .orderBy(desc(sessions.createdAt))
        .limit(50);

      const token = c.req.header("authorization")?.replace(/^bearer\s+/i, "") ?? null;
      const currentHash = token ? await hashToken(token) : null;

      return ok(c, {
        items: rows.map((row) => ({
          id: row.id,
          ip: row.ip,
          userAgent: row.userAgent,
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
          current: currentHash ? row.tokenHash === currentHash : false,
        })),
      });
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/sessions/{id}",
      tags: ["认证"],
      summary: "下线指定设备",
      request: { params: IdParam },
      responses: {
        200: { description: "已下线", content: { "application/json": { schema: envelope(z.object({ revoked: z.boolean() })) } } },
      },
    }),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) throw unauthorized();
      const { id } = c.req.valid("param");
      const db = createDb(c.env.DB);
      const result = await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.id, id), eq(sessions.userId, auth.user.id)));
      const changed = Number((result as unknown as { meta?: { changes?: number } }).meta?.changes ?? 0);
      return ok(c, { revoked: changed > 0 });
    },
  );

  /* ---------------------------------------------------------------- 内部工具 */

  async function ensureRoleKey(db: ReturnType<typeof createDb>, key: string) {
    const [found] = await db.select().from(roles).where(eq(roles.key, key)).limit(1);
    if (found) return found;
    const { BUILTIN_ROLES } = await import("../shared/permissions");
    const definition = BUILTIN_ROLES.find((role) => role.key === key);
    const id = newId("rol");
    await db.insert(roles).values({
      id,
      key,
      name: definition?.name ?? key,
      description: definition?.description ?? null,
      isSystem: true,
      sortOrder: definition?.sortOrder ?? 99,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const [row] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
    return row!;
  }

  return app;
}

/** 首次初始化时把内置角色一次性写入（幂等）。 */
export async function ensureOwnerRole(db: ReturnType<typeof createDb>) {
  const [found] = await db.select().from(roles).where(eq(roles.key, "owner")).limit(1);
  if (found) return found;
  const [row] = await db
    .insert(roles)
    .values({
      id: newId("rol"),
      key: "owner",
      name: "站点所有者",
      description: "拥有全部权限",
      isSystem: true,
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return row!;
}
