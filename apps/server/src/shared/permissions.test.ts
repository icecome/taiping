import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  BUILTIN_ROLES,
  PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_KEYS,
  isPermission,
  roleGrants,
} from "./permissions";

describe("权限目录", () => {
  it("权限键唯一", () => {
    const keys = PERMISSIONS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("权限键格式统一为 资源.动作[.范围]", () => {
    for (const permission of PERMISSIONS) {
      expect(permission.key).toMatch(/^[a-z]+(\.[a-zA-Z]+){1,2}$/);
    }
  });

  it("每个权限的 group 都在分组目录里", () => {
    const groups = new Set(PERMISSION_GROUPS.map((g) => g.key));
    for (const permission of PERMISSIONS) {
      expect(groups.has(permission.group)).toBe(true);
    }
  });

  it("isPermission 只认目录里的键", () => {
    expect(isPermission("content.read")).toBe(true);
    expect(isPermission("content.readAll")).toBe(false);
    expect(isPermission("")).toBe(false);
  });
});

describe("内置角色", () => {
  it("角色 key 与 ROLE_KEYS 一致", () => {
    expect(BUILTIN_ROLES.map((role) => role.key)).toEqual([...ROLE_KEYS]);
  });

  it("每个角色的权限都在权限目录里", () => {
    for (const role of BUILTIN_ROLES) {
      if (role.permissions[0] === "*") continue;
      for (const permission of role.permissions) {
        expect(ALL_PERMISSIONS).toContain(permission);
      }
    }
  });

  it("只有 owner 拥有通配权限", () => {
    const wildcardRoles = BUILTIN_ROLES.filter((role) => role.permissions[0] === "*").map((role) => role.key);
    expect(wildcardRoles).toEqual(["owner"]);
  });

  it("订阅者没有任何后台权限", () => {
    const subscriber = BUILTIN_ROLES.find((role) => role.key === "subscriber");
    expect(subscriber?.permissions).toEqual([]);
  });

  it("作者不能发布别人的内容，编辑可以", () => {
    const author = BUILTIN_ROLES.find((role) => role.key === "author")!;
    const editor = BUILTIN_ROLES.find((role) => role.key === "editor")!;
    expect(roleGrants(author.key, author.permissions as string[], "content.publish.any")).toBe(false);
    expect(roleGrants(author.key, author.permissions as string[], "content.publish.own")).toBe(true);
    expect(roleGrants(editor.key, editor.permissions as string[], "content.publish.any")).toBe(true);
  });

  it("owner 短路放行任何权限", () => {
    expect(roleGrants("owner", [], "system.token.manage")).toBe(true);
  });

  it("投稿者没有发布权限", () => {
    const contributor = BUILTIN_ROLES.find((role) => role.key === "contributor")!;
    expect(roleGrants("contributor", contributor.permissions as string[], "content.publish.own")).toBe(false);
  });
});
