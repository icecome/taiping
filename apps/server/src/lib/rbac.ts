/**
 * RBAC 判定。
 *
 * 关键设计：权限键分 `.own` / `.any` 两档，判定时必须同时知道"操作对象的作者是谁"，
 * 因此这里提供的是 `assertCanMutateContent` 这类带对象的断言，而不是裸的 `can()`。
 * 这样作者只能动自己的内容，编辑能动所有人的，行为差异只由角色权限表决定。
 */
import type { AuthContext } from "../env";
import type { Permission } from "../shared/permissions";
import { forbidden, unauthorized } from "./errors";

export function can(auth: AuthContext | null, permission: Permission): boolean {
  if (!auth) return false;
  if (auth.isSuperAdmin) return true;
  return auth.permissions.includes(permission);
}

export function canAny(auth: AuthContext | null, permissions: Permission[]): boolean {
  if (!auth) return false;
  if (auth.isSuperAdmin) return true;
  return permissions.some((p) => auth.permissions.includes(p));
}

export function assertAuthenticated(auth: AuthContext | null): AuthContext {
  if (!auth) throw unauthorized();
  if (auth.user.status !== "active") throw forbidden("账号已被停用");
  return auth;
}

export function assertCan(auth: AuthContext | null, permission: Permission): AuthContext {
  const context = assertAuthenticated(auth);
  if (!can(context, permission)) throw forbidden(`缺少权限：${permission}`);
  return context;
}

/**
 * 编辑/删除内容时的双档判定。
 * 自己是作者 → 走 .own；不是作者 → 必须持有 .any。
 */
export function assertContentAccess(
  auth: AuthContext | null,
  action: "update" | "delete" | "publish",
  content: { authorId: string },
): AuthContext {
  const context = assertAuthenticated(auth);
  const isOwner = content.authorId === context.user.id;
  const permission = (isOwner ? `content.${action}.own` : `content.${action}.any`) as Permission;
  if (can(context, permission)) return context;
  // 持有 .any 的人天然也能处理自己的内容，避免角色设计里漏配 own。
  if (can(context, `content.${action}.any` as Permission)) return context;
  throw forbidden(isOwner ? `缺少权限：${permission}` : "只能操作自己创建的内容");
}

/** 用户管理侧的越权保护：非 owner 不能修改 owner 账号，也不能把自己提权。 */
export function assertCanManageUser(
  auth: AuthContext | null,
  target: { id: string; isOwner: boolean },
): AuthContext {
  const context = assertAuthenticated(auth);
  if (!can(context, "user.update") && !can(context, "user.create") && !can(context, "user.delete")) {
    throw forbidden("缺少用户管理权限");
  }
  if (target.isOwner && !context.isSuperAdmin) {
    throw forbidden("只有站点所有者可以修改所有者账号");
  }
  return context;
}

export function permissionSummary(auth: AuthContext | null): { permissions: string[]; roles: string[] } {
  if (!auth) return { permissions: [], roles: [] };
  return { permissions: auth.permissions, roles: auth.roles };
}
