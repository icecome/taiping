import { describe, expect, it } from "vitest";
import type { AuthContext } from "../env";
import { AppError } from "./errors";
import { assertCan, assertContentAccess, can, canAny, permissionSummary } from "./rbac";

function auth(permissions: string[], options: { superAdmin?: boolean; userId?: string; status?: string } = {}): AuthContext {
  return {
    user: {
      id: options.userId ?? "usr_me",
      email: "me@example.com",
      username: "me",
      displayName: "我",
      avatarUrl: null,
      status: options.status ?? "active",
      mustChangePassword: false,
    },
    sessionId: "ses_1",
    roles: options.superAdmin ? ["owner"] : ["author"],
    permissions,
    isSuperAdmin: options.superAdmin ?? false,
  };
}

function expectAppError(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error("预期抛出 AppError，但函数正常返回");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
}

describe("can / canAny", () => {
  it("未登录一律 false", () => {
    expect(can(null, "content.read")).toBe(false);
    expect(canAny(null, ["content.read"])).toBe(false);
  });

  it("按权限集合判定", () => {
    const context = auth(["content.read"]);
    expect(can(context, "content.read")).toBe(true);
    expect(can(context, "content.publish.any")).toBe(false);
  });

  it("超级管理员短路放行", () => {
    expect(can(auth([], { superAdmin: true }), "system.token.manage")).toBe(true);
  });

  it("canAny 命中任意一个即为 true", () => {
    const context = auth(["media.upload"]);
    expect(canAny(context, ["content.create", "media.upload"])).toBe(true);
    expect(canAny(context, ["content.create", "media.delete.any"])).toBe(false);
  });
});

describe("assertCan", () => {
  it("未登录抛 UNAUTHORIZED", () => {
    expectAppError(() => assertCan(null, "content.read"), "UNAUTHORIZED");
  });

  it("停用账号抛 FORBIDDEN", () => {
    expectAppError(() => assertCan(auth(["content.read"], { status: "suspended" }), "content.read"), "FORBIDDEN");
  });

  it("缺权限抛 FORBIDDEN 且提示权限名", () => {
    try {
      assertCan(auth(["content.read"]), "user.delete");
    } catch (error) {
      expect((error as AppError).message).toContain("user.delete");
    }
  });

  it("有权限时返回上下文", () => {
    const context = auth(["content.read"]);
    expect(assertCan(context, "content.read")).toBe(context);
  });
});

describe("assertContentAccess", () => {
  it("作者编辑自己的内容只需 .own", () => {
    const context = auth(["content.update.own"], { userId: "usr_me" });
    expect(() => assertContentAccess(context, "update", { authorId: "usr_me" })).not.toThrow();
  });

  it("作者编辑别人的内容被拒绝", () => {
    const context = auth(["content.update.own"], { userId: "usr_me" });
    expectAppError(() => assertContentAccess(context, "update", { authorId: "usr_other" }), "FORBIDDEN");
  });

  it("持有 .any 的人可以编辑任何内容", () => {
    const context = auth(["content.update.any"], { userId: "usr_me" });
    expect(() => assertContentAccess(context, "update", { authorId: "usr_other" })).not.toThrow();
  });

  it("只有 .any 的人处理自己的内容也放行", () => {
    const context = auth(["content.delete.any"], { userId: "usr_me" });
    expect(() => assertContentAccess(context, "delete", { authorId: "usr_me" })).not.toThrow();
  });

  it("发布走独立的权限档位", () => {
    const contributor = auth(["content.update.own"], { userId: "usr_me" });
    expectAppError(() => assertContentAccess(contributor, "publish", { authorId: "usr_me" }), "FORBIDDEN");
    const author = auth(["content.publish.own"], { userId: "usr_me" });
    expect(() => assertContentAccess(author, "publish", { authorId: "usr_me" })).not.toThrow();
  });

  it("未登录先抛 UNAUTHORIZED 而不是 FORBIDDEN", () => {
    expectAppError(() => assertContentAccess(null, "update", { authorId: "usr_me" }), "UNAUTHORIZED");
  });
});

describe("permissionSummary", () => {
  it("未登录返回空集合", () => {
    expect(permissionSummary(null)).toEqual({ permissions: [], roles: [] });
  });

  it("已登录返回角色与权限", () => {
    expect(permissionSummary(auth(["content.read"]))).toEqual({ permissions: ["content.read"], roles: ["author"] });
  });
});
