/**
 * 内置角色的初始化与同步。
 *
 * 为什么放在代码里而不是迁移文件里：角色与权限是一份会演进的目录（shared/permissions.ts），
 * 写成 SQL 就出现第二个真值，加一个权限要同时改两处并且容易漏。
 * 这里的原则是：
 *   - 角色不存在 → 按代码定义创建，并写入权限；
 *   - 角色已存在 → **不动它的权限**，避免把管理员在后台的调整覆盖掉；
 *   - 需要强制回滚到代码定义时，显式调用 syncPermissions = true（维护接口里有入口）。
 */
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { rolePermissions, roles, userRoles } from "../db/schema";
import { BUILTIN_ROLES, ALL_PERMISSIONS } from "../shared/permissions";
import { newId } from "./id";

export interface BootstrapResult {
  created: string[];
  existing: string[];
  permissionsWritten: number;
}

export async function ensureBuiltinRoles(db: Db, options: { syncPermissions?: boolean } = {}): Promise<BootstrapResult> {
  const created: string[] = [];
  const existing: string[] = [];
  let permissionsWritten = 0;

  const currentRows = await db.select().from(roles);
  const byKey = new Map(currentRows.map((row) => [row.key, row]));

  for (const definition of BUILTIN_ROLES) {
    let role = byKey.get(definition.key);
    if (!role) {
      const id = newId("rol");
      await db.insert(roles).values({
        id,
        key: definition.key,
        name: definition.name,
        description: definition.description,
        isSystem: true,
        sortOrder: definition.sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      role = {
        id,
        key: definition.key,
        name: definition.name,
        description: definition.description,
        isSystem: true,
        sortOrder: definition.sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as typeof roles.$inferSelect;
      created.push(definition.key);
    } else {
      existing.push(definition.key);
    }

    const isNew = created.includes(definition.key);
    if (!isNew && !options.syncPermissions) continue;

    const permissionList = definition.permissions[0] === "*" ? ALL_PERMISSIONS : (definition.permissions as string[]);
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
    if (permissionList.length > 0) {
      await db
        .insert(rolePermissions)
        .values(permissionList.map((permission) => ({ roleId: role.id, permission })));
      permissionsWritten += permissionList.length;
    }
  }

  return { created, existing, permissionsWritten };
}

/** 强制把所有内置角色的权限重置为代码定义（owner 保持全权限）。 */
export async function resyncBuiltinRoles(db: Db): Promise<BootstrapResult> {
  return ensureBuiltinRoles(db, { syncPermissions: true });
}

/** 当前有几个 owner（用于"最后一个 owner 不能删/不能降级"这类判定）。 */
export async function countOwners(db: Db): Promise<{ ownerRoleId: string | null; userCount: number }> {
  const [ownerRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "owner")).limit(1);
  if (!ownerRole) return { ownerRoleId: null, userCount: 0 };
  const links = await db.select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, ownerRole.id));
  return { ownerRoleId: ownerRole.id, userCount: links.length };
}
