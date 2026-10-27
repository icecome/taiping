/**
 * 会话与登录态。
 *
 * 相比参考项目做的三处收紧：
 * 1. token 由 32 字节 CSPRNG 生成，库里只存 SHA-256 —— 泄库不等于账号被接管；
 * 2. token 带 sameSite=Lax + HttpOnly + Secure cookie，前端不落 localStorage；
 * 3. 会话可单条吊销，也可按用户批量吊销（改密、停用、角色变更时调用）。
 *
 * KV 里再缓存 30 秒的已解析上下文，把"每请求一次 D1 查角色"的成本压掉；
 * 代价是改权限最多 30 秒生效，对 CMS 场景可接受。
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Db } from "../db/client";
import type { AuthContext, Env } from "../env";
import { rolePermissions, roles, sessions, userRoles, users } from "../db/schema";
import { ALL_PERMISSIONS } from "../shared/permissions";
import { sha256Hex } from "./crypto";
import { unauthorized } from "./errors";
import { newId, newSecretToken } from "./id";

export const SESSION_COOKIE = "taiping_session";
const SESSION_CACHE_TTL = 30;

export interface SessionUserRow {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  mustChangePassword: boolean;
}

export async function loadAuthContext(db: Db, userId: string): Promise<AuthContext | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  const roleRows = await db
    .select({ roleId: roles.id, roleKey: roles.key, permission: rolePermissions.permission })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  const roleKeys = [...new Set(roleRows.map((row) => row.roleKey))];
  const isSuperAdmin = roleKeys.includes("owner");
  const permissions = isSuperAdmin
    ? [...ALL_PERMISSIONS]
    : [...new Set(roleRows.map((row) => row.permission).filter((p): p is string => !!p))];

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
    },
    sessionId: null,
    roles: roleKeys,
    permissions,
    isSuperAdmin,
  };
}

function readToken(c: Context): string | null {
  const cookieToken = getCookie(c, SESSION_COOKIE);
  if (cookieToken) return cookieToken;
  const header = c.req.header("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return null;
}

/** 解析当前请求的登录态。返回 null 表示匿名。 */
export async function resolveAuth(env: Env, db: Db, c: Context): Promise<AuthContext | null> {
  const token = readToken(c);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const cacheKey = `sess:${tokenHash}`;

  try {
    const cached = await env.KV.get(cacheKey, "json");
    if (cached) {
      const context = cached as AuthContext;
      const [row] = await db
        .select({ revokedAt: sessions.revokedAt, expiresAt: sessions.expiresAt })
        .from(sessions)
        .where(eq(sessions.tokenHash, tokenHash))
        .limit(1);
      if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) {
        await env.KV.delete(cacheKey);
        return null;
      }
      return context;
    }
  } catch {
    /* KV 不可用时走 D1 全量校验 */
  }

  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!session) return null;

  const context = await loadAuthContext(db, session.userId);
  if (!context) return null;
  context.sessionId = session.id;

  try {
    await env.KV.put(cacheKey, JSON.stringify(context), { expirationTtl: SESSION_CACHE_TTL });
  } catch {
    /* 忽略 */
  }
  return context;
}

export interface CreatedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export async function createSession(
  db: Db,
  options: {
    userId: string;
    ttlDays: number;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<CreatedSession> {
  const token = newSecretToken(32);
  const tokenHash = await sha256Hex(token);
  const sessionId = newId("ses");
  const expiresAt = new Date(Date.now() + options.ttlDays * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: sessionId,
    userId: options.userId,
    tokenHash,
    ip: options.ip ?? null,
    userAgent: options.userAgent?.slice(0, 400) ?? null,
    expiresAt,
    createdAt: new Date(),
  });

  return { token, sessionId, expiresAt };
}

export async function revokeSession(env: Env, db: Db, tokenHash: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, tokenHash));
  try {
    await env.KV.delete(`sess:${tokenHash}`);
  } catch {
    /* 忽略 */
  }
}

export async function revokeCurrentSession(env: Env, db: Db, c: Context): Promise<void> {
  const token = readToken(c);
  if (!token) return;
  await revokeSession(env, db, await sha256Hex(token));
}

/** 改密 / 停用 / 角色变更后调用，强制所有设备重新登录。 */
export async function revokeAllUserSessions(db: Db, userId: string): Promise<number> {
  const rows = await db
    .select({ tokenHash: sessions.tokenHash })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  if (rows.length === 0) return 0;
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, userId));
  return rows.length;
}

export function setSessionCookie(c: Context, token: string, expiresAt: Date, secure: boolean): void {
  setCookie(c, SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure,
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export async function requireUser(auth: AuthContext | null): Promise<AuthContext> {
  if (!auth) throw unauthorized();
  return auth;
}
