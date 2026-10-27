/**
 * 角色与权限。
 *
 * 权限目录（shared/permissions.ts）是单一真值：这里只负责把它按组吐给后台、
 * 以及维护 roles / role_permissions 两张表。三条不变量：
 *   1. 内置角色 key 不可被自定义角色占用，内置角色行不可删除；
 *   2. owner 始终等价于全部权限 —— 库里怎么存都不影响判定，所以改 owner 的权限集合直接拒绝；
 *   3. 还有用户挂着的角色不能删，冲突响应里带上占用人数，让后台能给出可读提示。
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { asc, count, eq } from "drizzle-orm";
import { createDb, type Db } from "../db/client";
import { rolePermissions, roles, userRoles } from "../db/schema";
import type { AppBindings } from "../env";
import { recordAudit } from "../lib/audit";
import { badRequest, conflict, notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { assertCan } from "../lib/rbac";
import { ALL_PERMISSIONS, BUILTIN_ROLES, PERMISSIONS, PERMISSION_GROUPS, ROLE_KEYS, isPermission } from "../shared/permissions";
import { envelope, IdParam } from "./schemas";

const PermissionSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
});

const PermissionGroupSchema = z.object({
  group: z.string(),
  label: z.string(),
  permissions: z.array(PermissionSchema),
});

const RoleSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  sortOrder: z.number(),
  permissions: z.array(z.string()),
  userCount: z.number(),
  builtin: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const CreateBody = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/, "角色 key 需以小写字母开头，只含小写字母、数字、下划线与连字符"),
  name: z.string().trim().min(1).max(48),
  description: z.string().max(400).nullable().optional(),
  permissions: z.array(z.string().min(1)).max(200),
});

const UpdateBody = z.object({
  name: z.string().trim().min(1).max(48).optional(),
  description: z.string().max(400).nullable().optional(),
  permissions: z.array(z.string().min(1)).max(200).optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});

function isBuiltinKey(key: string): boolean {
  return (ROLE_KEYS as readonly string[]).includes(key);
}

/** 非法权限键整批拒绝并列出来，避免"存进去了但永远不生效"的静默错误。 */
function assertPermissions(keys: string[]): string[] {
  const invalid = keys.filter((key) => !isPermission(key));
  if (invalid.length > 0) {
    throw badRequest(`存在未知权限键：${invalid.join("、")}`, { permissions: invalid.join("、") });
  }
  return [...new Set(keys)];
}

export function createRolesRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  /* ---------------------------------------------------------------- 读取 */

  app.openapi(
    createRoute({
      method: "get",
      path: "/permissions",
      tags: ["角色与权限"],
      summary: "权限目录",
      description: "按 PERMISSION_GROUPS 分组返回，供后台渲染权限矩阵。",
      responses: {
        200: {
          description: "分组后的权限目录",
          content: {
            "application/json": {
              schema: envelope(z.object({ groups: z.array(PermissionGroupSchema) })),
            },
          },
        },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "role.read");
      const groups = PERMISSION_GROUPS.map((group) => ({
        group: group.key as string,
        label: group.label as string,
        permissions: PERMISSIONS.filter((permission) => permission.group === group.key).map((permission) => ({
          key: permission.key as string,
          label: permission.label as string,
          description: permission.description as string,
        })),
      }));
      return c.json({ ok: true as const, data: { groups } }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["角色与权限"],
      summary: "角色列表",
      description: "每个角色带权限集合、用户数、是否内置与是否系统行。owner 恒为全部权限。",
      responses: {
        200: {
          description: "角色列表",
          content: {
            "application/json": {
              schema: envelope(z.object({ items: z.array(RoleSchema) })),
            },
          },
        },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "role.read");
      const db = createDb(c.env.DB);

      const rows = await db.select().from(roles).orderBy(asc(roles.sortOrder), asc(roles.key));
      const permissionRows = await db
        .select({ roleId: rolePermissions.roleId, permission: rolePermissions.permission })
        .from(rolePermissions);
      const userCountRows = await db
        .select({ roleId: userRoles.roleId, value: count() })
        .from(userRoles)
        .groupBy(userRoles.roleId);

      const permissionMap = new Map<string, string[]>();
      for (const row of permissionRows) {
        const bucket = permissionMap.get(row.roleId);
        if (bucket) bucket.push(row.permission);
        else permissionMap.set(row.roleId, [row.permission]);
      }
      const userCountMap = new Map(userCountRows.map((row) => [row.roleId, Number(row.value)]));

      const items = rows.map((row) =>
        serializeRole(
          row,
          resolvePermissions(row.key, permissionMap.get(row.id) ?? []),
          userCountMap.get(row.id) ?? 0,
        ),
      );
      return c.json({ ok: true as const, data: { items } }, 200);
    },
  );

  /* ---------------------------------------------------------------- 写入 */

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      tags: ["角色与权限"],
      summary: "新建自定义角色",
      description: "key 不能与内置角色或既有角色冲突；权限键必须是权限目录里的键。",
      request: { body: { content: { "application/json": { schema: CreateBody } } } },
      responses: {
        201: { description: "创建成功", content: { "application/json": { schema: envelope(RoleSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "role.manage");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      if (isBuiltinKey(body.key)) {
        throw conflict("该 key 属于内置角色，请换一个", { key: "与内置角色冲突" });
      }
      const [dupe] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, body.key)).limit(1);
      if (dupe) throw conflict("角色 key 已存在", { key: "已存在" });

      const permissions = assertPermissions(body.permissions);

      const id = newId("rol");
      const now = new Date();
      await db.insert(roles).values({
        id,
        key: body.key,
        name: body.name,
        description: body.description ?? null,
        isSystem: false,
        sortOrder: 50,
        createdAt: now,
        updatedAt: now,
      });
      if (permissions.length > 0) {
        await db.insert(rolePermissions).values(permissions.map((permission) => ({ roleId: id, permission })));
      }

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "role.create",
        targetType: "role",
        targetId: id,
        meta: { key: body.key, permissions: permissions.length },
        ip: clientIp(c),
      });

      const [row] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
      return c.json({ ok: true as const, data: serializeRole(row!, permissions, 0) }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      tags: ["角色与权限"],
      summary: "更新角色",
      description: "内置角色的权限集合允许调整（owner 除外：owner 恒为全部权限，改权限的请求直接拒绝）。",
      request: {
        params: IdParam,
        body: { content: { "application/json": { schema: UpdateBody } } },
      },
      responses: {
        200: { description: "更新成功", content: { "application/json": { schema: envelope(RoleSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "role.manage");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const [existing] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
      if (!existing) throw notFound("角色不存在");

      if (existing.key === "owner" && body.permissions !== undefined) {
        throw badRequest("owner 角色始终拥有全部权限，无法调整其权限集合", {
          permissions: "owner 权限不可修改",
        });
      }

      const patch: Partial<typeof roles.$inferInsert> = { updatedAt: new Date() };
      if (body.name !== undefined) patch.name = body.name;
      if (body.description !== undefined) patch.description = body.description;
      if (body.sortOrder !== undefined) patch.sortOrder = body.sortOrder;
      await db.update(roles).set(patch).where(eq(roles.id, id));

      if (body.permissions !== undefined) {
        const permissions = assertPermissions(body.permissions);
        await db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
        if (permissions.length > 0) {
          await db.insert(rolePermissions).values(permissions.map((permission) => ({ roleId: id, permission })));
        }
      }

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "role.update",
        targetType: "role",
        targetId: id,
        meta: {
          key: existing.key,
          fields: Object.keys(patch).filter((key) => key !== "updatedAt"),
          permissions: body.permissions?.length,
        },
        ip: clientIp(c),
      });

      const [row] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
      const [usage] = await db
        .select({ value: count() })
        .from(userRoles)
        .where(eq(userRoles.roleId, id));
      const current = await db
        .select({ permission: rolePermissions.permission })
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, id));
      const permissions = resolvePermissions(row!.key, current.map((entry) => entry.permission));

      return c.json({ ok: true as const, data: serializeRole(row!, permissions, Number(usage?.value ?? 0)) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      tags: ["角色与权限"],
      summary: "删除角色",
      description: "内置角色不可删除；仍有用户占用时返回冲突并带上占用人数。",
      request: {
        params: IdParam,
      },
      responses: {
        200: {
          description: "删除成功",
          content: {
            "application/json": {
              schema: envelope(z.object({ deleted: z.literal(true), key: z.string() })),
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "role.manage");
      const { id } = c.req.valid("param");
      const db = createDb(c.env.DB);

      const [existing] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
      if (!existing) throw notFound("角色不存在");
      if (existing.isSystem || isBuiltinKey(existing.key)) {
        throw badRequest("内置角色不能删除", { id: "内置角色" });
      }

      const [usage] = await db.select({ value: count() }).from(userRoles).where(eq(userRoles.roleId, id));
      const occupied = Number(usage?.value ?? 0);
      if (occupied > 0) throw conflict(`该角色仍被 ${occupied} 个用户使用，请先调整这些用户的角色`);

      await db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
      await db.delete(roles).where(eq(roles.id, id));

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "role.delete",
        targetType: "role",
        targetId: id,
        meta: { key: existing.key, name: existing.name },
        ip: clientIp(c),
      });

      return c.json({ ok: true as const, data: { deleted: true as const, key: existing.key } }, 200);
    },
  );

  return app;
}

/* ------------------------------------------------------------------ 内部工具 */

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}

/**
 * owner 恒为全部权限（判定侧短路，不看 role_permissions）；
 * 其余角色以库里的权限集合为准，内置角色缺行时回落到 BUILTIN_ROLES 的默认集合。
 */
function resolvePermissions(key: string, stored: string[]): string[] {
  if (key === "owner") return [...ALL_PERMISSIONS];
  if (stored.length > 0) return [...new Set(stored)].sort();
  const definition = BUILTIN_ROLES.find((role) => role.key === key);
  if (!definition) return [];
  return definition.permissions.length === 1 && definition.permissions[0] === "*"
    ? [...ALL_PERMISSIONS]
    : [...new Set(definition.permissions as string[])].sort();
}

function serializeRole(row: typeof roles.$inferSelect, permissions: string[], userCount: number) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    isSystem: row.isSystem,
    sortOrder: row.sortOrder,
    permissions,
    userCount,
    builtin: isBuiltinKey(row.key),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export { RoleSchema, PermissionGroupSchema, createRolesRoutes as createRoleRoutes };
