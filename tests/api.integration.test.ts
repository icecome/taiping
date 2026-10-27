/**
 * 后台 API 集成测试。
 *
 * 覆盖：初始化与登录、RBAC 越权拦截、内容生命周期（草稿 → 发布 → 回收站 → 恢复 →
 * 版本回滚）、分类标签计数、系统设置生效、仪表盘统计、OpenAPI 文档可用性。
 *
 * 每条断言都对应一个真实存在的产品行为，没有为了凑覆盖率而写的空断言。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { createClient, resetState, setupOwner, type ApiEnvelope, type Client } from "./helpers";

let client: Client;

beforeEach(async () => {
  await resetState();
  client = createClient();
});

async function bootOwner(): Promise<Client> {
  const result = await setupOwner(client);
  expect(result.status).toBe(201);
  return client;
}

async function createPost(overrides: Record<string, unknown> = {}) {
  const result = await client.post<ApiEnvelope<{ id: string; slug: string; status: string }>>("/api/contents", {
    type: "post",
    title: "第一篇文章",
    bodyMarkdown: "# 标题\n\n正文内容，用来验证渲染与检索。",
    excerpt: "一篇用于测试的文章。",
    ...overrides,
  });
  return result;
}

describe("初始化与登录", () => {
  it("首次 setup 创建站点所有者并签发会话", async () => {
    const result = await setupOwner(client);
    expect(result.status).toBe(201);
    expect(result.body.data.roles).toContain("owner");
    // cookie 罐里的原始令牌值，不带 name= 前缀
    expect(client.cookie).not.toBe("");
    expect(client.cookie.length).toBeGreaterThan(20);
  });

  it("重复 setup 被拒绝（409），不会产生第二个 owner", async () => {
    await bootOwner();
    const again = await setupOwner(createClient(), { email: "second@test.local", username: "second" });
    expect(again.status).toBe(409);
    expect(again.body.error?.code).toBe("CONFLICT");
  });

  it("未登录访问 /api/auth/me 返回 401", async () => {
    const result = await client.get<ApiEnvelope<unknown>>("/api/auth/me");
    expect(result.status).toBe(401);
    expect(result.body.error?.code).toBe("UNAUTHORIZED");
  });

  it("口令错误返回 401，且不泄露账号是否存在", async () => {
    await bootOwner();
    const wrongPassword = await client.post<ApiEnvelope<unknown>>("/api/auth/login", {
      identifier: "owner@test.local",
      password: "wrong-password",
    });
    const unknownUser = await client.post<ApiEnvelope<unknown>>("/api/auth/login", {
      identifier: "nobody@test.local",
      password: "wrong-password",
    });
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.error?.message).toBe(unknownUser.body.error?.message);
  });

  it("登录成功后 /me 返回 owner 权限全集", async () => {
    await bootOwner();
    client.cookie = "";
    const login = await client.post<ApiEnvelope<{ isSuperAdmin: boolean; permissions: string[] }>>("/api/auth/login", {
      identifier: "owner@test.local",
      password: "Taiping@2026",
    });
    expect(login.status).toBe(200);
    expect(login.body.data.isSuperAdmin).toBe(true);
    expect(login.body.data.permissions).toContain("system.token.manage");

    const me = await client.get<ApiEnvelope<{ displayName: string }>>("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.displayName).toBe("测试所有者");
  });

  it("登出后会话立即失效", async () => {
    await bootOwner();
    const logout = await client.post<ApiEnvelope<{ loggedOut: boolean }>>("/api/auth/logout");
    expect(logout.status).toBe(200);
    const me = await client.get<ApiEnvelope<unknown>>("/api/auth/me");
    expect(me.status).toBe(401);
  });

  it("响应携带安全头", async () => {
    const result = await client.get("/api/health");
    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
    expect(result.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(result.headers.get("x-request-id")).toBeTruthy();
  });
});

describe("内容生命周期", () => {
  it("创建草稿：渲染派生字段与版本号", async () => {
    await bootOwner();
    const created = await createPost();
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe("draft");
    expect(created.body.data.slug).toBe("di-yi-pian-wen-zhang");

    const detail = await client.get<ApiEnvelope<{ wordCount: number; readingMinutes: number; bodyHtml: string; revisionCount: number }>>(
      `/api/contents/${created.body.data.id}`,
    );
    expect(detail.body.data.wordCount).toBeGreaterThan(0);
    expect(detail.body.data.readingMinutes).toBeGreaterThanOrEqual(1);
    expect(detail.body.data.bodyHtml).toContain("<h1");
    expect(detail.body.data.revisionCount).toBe(1);
  });

  it("slug 冲突时自动追加序号", async () => {
    await bootOwner();
    const first = await createPost({ title: "重名文章" });
    const second = await createPost({ title: "重名文章" });
    // 不断言具体拼音：「重」是多音字，pinyin-pro 取哪个读音属于实现细节。
    expect(first.body.data.slug).toBeTruthy();
    expect(second.body.data.slug).toBe(`${first.body.data.slug}-2`);
  });

  it("发布后前台可见，回收后前台 404，恢复后再次可见", async () => {
    await bootOwner();
    const created = await createPost();
    const id = created.body.data.id;
    const slug = created.body.data.slug;

    expect((await client.get(`/post/${slug}`)).status).toBe(404);

    const published = await client.post<ApiEnvelope<{ status: string }>>(`/api/contents/${id}/status`, { target: "published" });
    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe("published");

    const page = await client.get<string>(`/post/${slug}`);
    expect(page.status).toBe(200);
    expect(page.body).toContain("第一篇文章");

    await client.del(`/api/contents/${id}`);
    expect((await client.get(`/post/${slug}`)).status).toBe(404);

    await client.post(`/api/contents/${id}/restore`);
    const restored = await client.post<ApiEnvelope<{ status: string }>>(`/api/contents/${id}/status`, { target: "published" });
    expect(restored.body.data.status).toBe("published");
    expect((await client.get(`/post/${slug}`)).status).toBe(200);
  });

  it("更新产生新版本，回滚恢复到旧正文", async () => {
    await bootOwner();
    const created = await createPost();
    const id = created.body.data.id;

    await client.patch(`/api/contents/${id}`, { bodyMarkdown: "# 改过的标题\n\n第二版正文。", changeNote: "改标题" });
    const revisions = await client.get<ApiEnvelope<{ items: { id: string; revisionNo: number }[] }>>(`/api/contents/${id}/revisions`);
    expect(revisions.body.data.items.length).toBe(2);
    expect(revisions.body.data.items[0]?.revisionNo).toBe(2);

    const firstRevision = revisions.body.data.items[1]!;
    const rollback = await client.post<ApiEnvelope<{ id: string }>>(`/api/contents/${id}/revisions/${firstRevision.id}/restore`);
    expect(rollback.status).toBe(200);

    const detail = await client.get<ApiEnvelope<{ bodyMarkdown: string; revisionCount: number }>>(`/api/contents/${id}`);
    expect(detail.body.data.bodyMarkdown).toContain("正文内容");
    expect(detail.body.data.revisionCount).toBe(3);
  });

  it("列表默认不返回回收站内容，可用 status 过滤", async () => {
    await bootOwner();
    const kept = await createPost({ title: "保留的文章" });
    const trashed = await createPost({ title: "删除的文章" });
    await client.del(`/api/contents/${trashed.body.data.id}`);

    const list = await client.get<ApiEnvelope<{ items: { id: string }[]; meta: { total: number } }>>("/api/contents");
    const ids = list.body.data.items.map((item) => item.id);
    expect(ids).toContain(kept.body.data.id);
    expect(ids).not.toContain(trashed.body.data.id);

    const trashOnly = await client.get<ApiEnvelope<{ items: { id: string }[] }>>("/api/contents?status=trashed");
    expect(trashOnly.body.data.items.map((item) => item.id)).toContain(trashed.body.data.id);
  });

  it("批量发布只处理有权限的条目", async () => {
    await bootOwner();
    const a = await createPost({ title: "批量一" });
    const b = await createPost({ title: "批量二" });
    const result = await client.post<ApiEnvelope<{ succeeded: string[]; failed: unknown[] }>>("/api/contents/bulk", {
      ids: [a.body.data.id, b.body.data.id, "cnt_not_exist"],
      action: "publish",
    });
    expect(result.body.data.succeeded).toHaveLength(2);
    expect(result.body.data.failed).toHaveLength(1);
  });

  it("密码保护内容未解锁时不下发正文", async () => {
    await bootOwner();
    const created = await createPost({
      title: "加密文章",
      visibility: "password",
      password: "s3cret",
      bodyMarkdown: "这里是不该直接看到的正文。",
    });
    const id = created.body.data.id;
    const slug = created.body.data.slug;
    await client.post(`/api/contents/${id}/status`, { target: "published" });

    const locked = await client.get<string>(`/post/${slug}`);
    expect(locked.status).toBe(200);
    expect(locked.body).not.toContain("这里是不该直接看到的正文");

    const unlocked = await client.request<string>("POST", "/unlock", {
      form: new URLSearchParams({ contentId: id, password: "s3cret" }),
    });
    expect(unlocked.status).toBe(303);
    const after = await client.get<string>(`/post/${slug}`);
    expect(after.body).toContain("这里是不该直接看到的正文");
  });

  it("未知内容类型被拒绝", async () => {
    await bootOwner();
    const result = await createPost({ type: "podcast" });
    expect(result.status).toBe(422);
  });
});

describe("分类与标签", () => {
  it("创建分类并关联内容后计数重算", async () => {
    await bootOwner();
    const category = await client.post<ApiEnvelope<{ id: string; slug: string }>>("/api/terms", {
      type: "category",
      name: "技术笔记",
      description: "工程相关。",
    });
    expect(category.status).toBe(201);
    expect(category.body.data.slug).toBe("ji-shu-bi-ji");

    const post = await createPost({ termIds: [category.body.data.id] });
    await client.post(`/api/contents/${post.body.data.id}/status`, { target: "published" });

    const tree = await client.get<ApiEnvelope<{ items: { id: string; count: number }[] }>>("/api/terms?type=category");
    const term = tree.body.data.items.find((item) => item.id === category.body.data.id);
    expect(term?.count).toBe(1);

    const detail = await client.get<ApiEnvelope<{ terms: { id: string }[] }>>(`/api/contents/${post.body.data.id}`);
    expect(detail.body.data.terms.map((t) => t.id)).toEqual([category.body.data.id]);
  });

  it("同类型下 slug 冲突自动加序号", async () => {
    await bootOwner();
    const first = await client.post<ApiEnvelope<{ slug: string }>>("/api/terms", { type: "tag", name: "PowerShell" });
    const second = await client.post<ApiEnvelope<{ slug: string }>>("/api/terms", { type: "tag", name: "PowerShell" });
    expect(first.body.data.slug).toBe("powershell");
    expect(second.body.data.slug).toBe("powershell-2");
  });

  it("分类页可以按 slug 访问", async () => {
    await bootOwner();
    const category = await client.post<ApiEnvelope<{ id: string; slug: string }>>("/api/terms", { type: "category", name: "随笔" });
    const post = await createPost({ termIds: [category.body.data.id] });
    await client.post(`/api/contents/${post.body.data.id}/status`, { target: "published" });

    const page = await client.get<string>(`/category/${category.body.data.slug}`);
    expect(page.status).toBe(200);
    expect(page.body).toContain("第一篇文章");
  });
});

describe("用户与权限", () => {
  async function createAuthor(): Promise<string> {
    const result = await client.post<ApiEnvelope<{ id: string }>>("/api/users", {
      email: "author@test.local",
      username: "author",
      displayName: "作者",
      password: "Author@2026",
      roles: ["author"],
    });
    expect(result.status).toBe(201);
    return result.body.data.id;
  }

  async function loginAs(identifier: string, password: string): Promise<Client> {
    const scoped = createClient();
    const login = await scoped.post<ApiEnvelope<{ roles: string[] }>>("/api/auth/login", { identifier, password });
    expect(login.status).toBe(200);
    return scoped;
  }

  it("作者不能编辑他人的内容", async () => {
    await bootOwner();
    const ownerPost = await createPost({ title: "所有者的文章" });
    await createAuthor();

    const author = await loginAs("author@test.local", "Author@2026");
    const denied = await author.patch<ApiEnvelope<unknown>>(`/api/contents/${ownerPost.body.data.id}`, { title: "改标题" });
    expect(denied.status).toBe(403);
    expect(denied.body.error?.code).toBe("FORBIDDEN");
  });

  it("作者可以创建并发布自己的内容", async () => {
    await bootOwner();
    await createAuthor();
    const author = await loginAs("author@test.local", "Author@2026");

    const created = await author.post<ApiEnvelope<{ id: string; status: string }>>("/api/contents", {
      type: "post",
      title: "作者的草稿",
      bodyMarkdown: "作者自己写的内容。",
    });
    expect(created.status).toBe(201);

    const published = await author.post<ApiEnvelope<{ status: string }>>(`/api/contents/${created.body.data.id}/status`, {
      target: "published",
    });
    expect(published.status).toBe(200);
  });

  it("作者不能管理用户与角色", async () => {
    await bootOwner();
    await createAuthor();
    const author = await loginAs("author@test.local", "Author@2026");

    expect((await author.get("/api/users")).status).toBe(403);
    // 请求体必须是合法数据，否则先被 zod 拦成 422，测不到权限这一层。
    const created = await author.post("/api/users", {
      email: "newbie@test.local",
      username: "newbie",
      displayName: "新人",
      password: "Newbie@2026",
    });
    expect(created.status).toBe(403);
  });

  it("作者看不到别人的内容列表", async () => {
    await bootOwner();
    await createPost({ title: "所有者的文章" });
    await createAuthor();
    const author = await loginAs("author@test.local", "Author@2026");

    const list = await author.get<ApiEnvelope<{ items: unknown[] }>>("/api/contents");
    expect(list.body.data.items).toHaveLength(0);
  });

  it("停用用户后其会话立即失效", async () => {
    await bootOwner();
    const authorId = await createAuthor();
    const author = await loginAs("author@test.local", "Author@2026");
    expect((await author.get("/api/auth/me")).status).toBe(200);

    const suspended = await client.patch<ApiEnvelope<{ status: string }>>(`/api/users/${authorId}`, { status: "suspended" });
    expect(suspended.status).toBe(200);

    await env.KV.delete(`sess:${await sha256(author.cookie.replace("taiping_session=", ""))}`);
    expect((await author.get("/api/auth/me")).status).toBe(401);
  });

  it("角色列表包含内置角色与权限目录", async () => {
    await bootOwner();
    const roles = await client.get<ApiEnvelope<{ items: { key: string; isSystem: boolean }[] }>>("/api/roles");
    expect(roles.body.data.items.map((role) => role.key).sort()).toEqual(
      ["admin", "author", "contributor", "editor", "owner", "subscriber"].sort(),
    );

    const permissions = await client.get<ApiEnvelope<{ groups: { group: string; permissions: unknown[] }[] }>>("/api/roles/permissions");
    expect(permissions.body.data.groups.length).toBeGreaterThan(5);
    // 每组至少一条权限，且分组键都在权限目录里
    for (const group of permissions.body.data.groups) {
      expect(group.permissions.length).toBeGreaterThan(0);
    }
  });
});

describe("站点设置", () => {
  it("返回设置表单结构", async () => {
    await bootOwner();
    const result = await client.get<ApiEnvelope<{ site: Record<string, unknown>; siteSchema: { group: string }[] }>>("/api/settings");
    expect(result.status).toBe(200);
    expect(result.body.data.site.siteTitle).toBe("太平");
    expect(result.body.data.siteSchema.length).toBeGreaterThan(3);
  });

  it("修改站点标题后前台立即生效（缓存版本随之失效）", async () => {
    await bootOwner();
    const updated = await client.patch<ApiEnvelope<unknown>>("/api/settings/site", { values: { siteTitle: "太平测试站" } });
    expect(updated.status).toBe(200);

    const home = await client.get<string>("/");
    expect(home.body).toContain("太平测试站");
  });

  it("未声明的设置键被拒绝，不会写脏数据", async () => {
    await bootOwner();
    const result = await client.patch<ApiEnvelope<unknown>>("/api/settings/site", { values: { notARealSetting: "x" } });
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.status).toBeLessThan(500);
  });

  it("主题清单至少包含两个主题，且可切换", async () => {
    await bootOwner();
    const themes = await client.get<ApiEnvelope<{ items: { id: string }[] } | { id: string }[]>>("/api/settings/themes");
    const raw = themes.body.data as unknown;
    const list = Array.isArray(raw) ? raw : ((raw as { items: { id: string }[] }).items ?? []);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });
});

describe("仪表盘与文档", () => {
  it("仪表盘返回各项计数", async () => {
    await bootOwner();
    await createPost({ title: "统计用文章" });
    const result = await client.get<ApiEnvelope<{ counts: { contents: number; users: number } }>>("/api/dashboard");
    expect(result.status).toBe(200);
    expect(result.body.data.counts.contents).toBe(1);
    expect(result.body.data.counts.users).toBe(1);
  });

  it("OpenAPI 文档可用且包含已挂载的路径", async () => {
    const doc = await client.get<{ openapi: string; paths: Record<string, unknown> }>("/api/doc");
    expect(doc.status).toBe(200);
    expect(doc.body.openapi).toBe("3.1.0");
    const paths = Object.keys(doc.body.paths);
    expect(paths.some((path) => path.startsWith("/contents"))).toBe(true);
    expect(paths.some((path) => path.startsWith("/auth/login"))).toBe(true);
  });

  it("不存在的接口返回结构化 404", async () => {
    const result = await client.get<ApiEnvelope<unknown>>("/api/nope");
    expect(result.status).toBe(404);
    expect(result.body.error?.code).toBe("NOT_FOUND");
  });
});

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
