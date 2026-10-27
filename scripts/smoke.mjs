#!/usr/bin/env node
/**
 * 端到端验收脚本。
 *
 * 与集成测试的区别：集成测试跑在测试运行时里、用测试库；这个脚本打的是**真实跑着的
 * Worker**（本地 wrangler dev 或线上部署），用真实 HTTP 与真实 D1。上线后跑一遍它，
 * 比逐条手工 curl 可靠，也比看日志快。
 *
 * 用法：
 *   node scripts/smoke.mjs                          # 默认 http://127.0.0.1:8787
 *   BASE_URL=https://blog.example.com \
 *   OWNER_EMAIL=you@example.com OWNER_PASSWORD=... node scripts/smoke.mjs
 *
 * 只读性：脚本会创建一条标题带 `[smoke]` 前缀的草稿并在结束时移入回收站，
 * 不修改既有内容；会改一次站点设置再改回来。
 */

const BASE_URL = (process.env.BASE_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const EMAIL = process.env.OWNER_EMAIL ?? "owner@taiping.local";
const PASSWORD = process.env.OWNER_PASSWORD ?? "Taiping@2026";

const results = [];
let cookie = "";

function record(group, name, ok, detail = "") {
  results.push({ 分组: group, 检查项: name, 结果: ok ? "通过" : "失败", 说明: detail });
}

async function req(method, path, body, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (cookie && !options.anonymous) headers.cookie = cookie;
  let payload;
  if (options.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    payload = options.form.toString();
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: payload,
    redirect: "manual",
  });
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    if (raw.startsWith("taiping_session=")) cookie = raw.split(";")[0];
  }
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, text, json, headers: response.headers };
}

async function check(group, name, fn) {
  try {
    const outcome = await fn();
    if (typeof outcome === "string") record(group, name, false, outcome);
    else record(group, name, outcome !== false);
  } catch (error) {
    record(group, name, false, error.message);
  }
}

async function main() {
  console.log(`端到端验收：${BASE_URL}\n`);

  // ---------------------------------------------------------------- 健康与认证
  await check("基础", "GET /api/health 返回 ok", async () => {
    const response = await req("GET", "/api/health", undefined, { anonymous: true });
    return response.status === 200 && response.json?.ok === true;
  });

  await check("基础", "POST /api/auth/login 登录成功", async () => {
    const response = await req("POST", "/api/auth/login", { identifier: EMAIL, password: PASSWORD });
    return response.status === 200 && !!cookie ? true : `status=${response.status} ${response.json?.error?.message ?? ""}`;
  });

  await check("基础", "GET /api/auth/me 返回全量权限", async () => {
    const response = await req("GET", "/api/auth/me");
    return response.json?.data?.permissions?.length > 10;
  });

  // ---------------------------------------------------------------- 各 API 分组
  const groups = [
    ["内容", "GET /api/contents", "/api/contents?pageSize=5"],
    ["分类标签", "GET /api/terms 分类树", "/api/terms?type=category"],
    ["分类标签", "GET /api/terms 标签", "/api/terms?type=tag"],
    ["评论", "GET /api/comments", "/api/comments?pageSize=5&status=all"],
    ["评论", "GET /api/comments/stats", "/api/comments/stats"],
    ["媒体", "GET /api/media", "/api/media?pageSize=5"],
    ["用户", "GET /api/users", "/api/users?pageSize=5"],
    ["角色", "GET /api/roles", "/api/roles"],
    ["角色", "GET /api/roles/permissions", "/api/roles/permissions"],
    ["设置", "GET /api/settings", "/api/settings"],
    ["设置", "GET /api/settings/themes", "/api/settings/themes"],
    ["内容模型", "GET /api/fields", "/api/fields"],
    ["导航", "GET /api/nav", "/api/nav"],
    ["插件", "GET /api/plugins", "/api/plugins"],
    ["审计", "GET /api/audit", "/api/audit?pageSize=5"],
    ["审计", "GET /api/audit/actions", "/api/audit/actions"],
    ["令牌", "GET /api/tokens", "/api/tokens"],
    ["仪表盘", "GET /api/dashboard", "/api/dashboard"],
    ["文档", "GET /api/doc 是 OpenAPI 3.1", "/api/doc"],
  ];

  for (const [group, name, path] of groups) {
    await check(group, name, async () => {
      const response = await req("GET", path);
      if (response.status !== 200) return `status=${response.status}`;
      const isDoc = path === "/api/doc";
      if (isDoc) return response.json?.openapi === "3.1.0" ? true : "openapi 版本不是 3.1.0";
      return response.json?.ok === true ? true : "响应缺少 ok:true";
    });
  }

  // ---------------------------------------------------------------- 内容全流程
  let contentId = null;
  let contentSlug = null;

  await check("内容流程", "创建草稿", async () => {
    const stamp = new Date().toISOString().slice(0, 19);
    const response = await req("POST", "/api/contents", {
      type: "post",
      title: `[smoke] 验收草稿 ${stamp}`,
      bodyMarkdown: "## 验收小节\n\n这是 smoke 脚本写入的正文，含关键词 smokemarker。\n\n```js\nconst a = 1;\n```",
    });
    if (response.status !== 201) return `status=${response.status} ${response.json?.error?.message ?? ""}`;
    contentId = response.json.data.id;
    contentSlug = response.json.data.slug;
    return true;
  });

  await check("内容流程", "草稿不出现在前台", async () => {
    const response = await req("GET", `/post/${contentSlug}`, undefined, { anonymous: true });
    return response.status === 404;
  });

  await check("内容流程", "发布后前台可见", async () => {
    const publish = await req("POST", `/api/contents/${contentId}/status`, { target: "published" });
    if (publish.status !== 200) return `发布接口 status=${publish.status}`;
    const page = await req("GET", `/post/${contentSlug}`, undefined, { anonymous: true });
    return page.status === 200 && page.text.includes("[smoke]") ? true : `前台 status=${page.status}`;
  });

  await check("内容流程", "文章页含 JSON-LD 与代码高亮", async () => {
    const page = await req("GET", `/post/${contentSlug}`, undefined, { anonymous: true });
    return page.text.includes("BlogPosting") && page.text.includes("hljs");
  });

  await check("内容流程", "搜索能命中新内容", async () => {
    const page = await req("GET", `/search?q=${encodeURIComponent("smokemarker")}`, undefined, { anonymous: true });
    return page.status === 200 && page.text.includes("[smoke]");
  });

  await check("内容流程", "更新产生新版本", async () => {
    const before = await req("GET", `/api/contents/${contentId}`);
    const base = before.json?.data?.revisionCount ?? 0;
    await req("PATCH", `/api/contents/${contentId}`, { bodyMarkdown: "## 验收小节\n\n第二版 smokemarker。", changeNote: "smoke 更新" });
    const after = await req("GET", `/api/contents/${contentId}`);
    return (after.json?.data?.revisionCount ?? 0) === base + 1;
  });

  await check("内容流程", "移入回收站后前台 404", async () => {
    const trashed = await req("DELETE", `/api/contents/${contentId}`);
    if (trashed.status !== 200) return `status=${trashed.status}`;
    const page = await req("GET", `/post/${contentSlug}`, undefined, { anonymous: true });
    return page.status === 404;
  });

  await check("内容流程", "彻底删除清理干净", async () => {
    const purged = await req("DELETE", `/api/contents/${contentId}/purge`);
    if (purged.status !== 200) return `status=${purged.status}`;
    const detail = await req("GET", `/api/contents/${contentId}`);
    return detail.status === 404;
  });

  // ---------------------------------------------------------------- 评论流程
  /** 挑一条允许评论的已发布文章作为评论目标（页面类型默认关闭评论，不能拿来测）。 */
  async function pickCommentTarget() {
    const list = await req("GET", "/api/contents?type=post&status=published&pageSize=10");
    const items = list.json?.data?.items ?? [];
    const target = items.find((item) => item.allowComment) ?? items[0];
    return target ?? null;
  }

  await check("评论流程", "访客提交评论返回 303 并进入待审", async () => {
    const target = await pickCommentTarget();
    if (!target) return "没有可评论的已发布文章";
    const form = new URLSearchParams({
      contentId: target.id,
      parentId: "",
      name: "验收访客",
      email: "smoke@example.com",
      url: "",
      body: `smoke 评论 ${Date.now()}`,
      website: "",
    });
    const submitted = await req("POST", "/comment", undefined, { form, anonymous: true });
    if (submitted.status !== 303) return `status=${submitted.status}`;
    const pending = await req("GET", "/api/comments?status=pending&pageSize=5");
    return pending.json?.data?.items?.some((item) => item.authorName === "验收访客");
  });

  await check("评论流程", "蜜罐命中被拒", async () => {
    const target = await pickCommentTarget();
    if (!target) return "没有可评论的已发布文章";
    const form = new URLSearchParams({
      contentId: target.id,
      parentId: "",
      name: "机器人",
      email: "bot@example.com",
      url: "",
      body: "spam",
      website: "http://spam.example",
    });
    const response = await req("POST", "/comment", undefined, { form, anonymous: true });
    return response.status === 400;
  });

  // ---------------------------------------------------------------- 设置与缓存
  await check("设置与缓存", "改站点标题后前台立即生效", async () => {
    const before = await req("GET", "/api/settings");
    const original = before.json?.data?.site?.siteTitle ?? "太平";
    const probe = `${original}·验收`;
    await req("PATCH", "/api/settings/site", { values: { siteTitle: probe } });
    const page = await req("GET", "/", undefined, { anonymous: true });
    const ok = page.text.includes(probe);
    await req("PATCH", "/api/settings/site", { values: { siteTitle: original } });
    return ok;
  });

  await check("设置与缓存", "非法设置键被拒绝", async () => {
    const response = await req("PATCH", "/api/settings/site", { values: { totallyNotASetting: 1 } });
    return response.status >= 400 && response.status < 500;
  });

  await check("设置与缓存", "清缓存接口可用", async () => {
    const response = await req("DELETE", "/api/settings/cache");
    return response.status === 200;
  });

  // ---------------------------------------------------------------- 插件与主题
  await check("插件与主题", "启用插件后前台页面仍然 200（钩子不炸）", async () => {
    const list = await req("GET", "/api/plugins");
    const items = list.json?.data?.items ?? [];
    if (items.length === 0) return "没有已注册插件";
    const target = items[0];
    await req("PATCH", `/api/plugins/${target.key}`, { enabled: !target.enabled });
    const page = await req("GET", "/", undefined, { anonymous: true });
    await req("PATCH", `/api/plugins/${target.key}`, { enabled: target.enabled });
    return page.status === 200;
  });

  await check("插件与主题", "切到素纸主题后前台渲染", async () => {
    const list = await req("GET", "/api/settings/themes");
    const themes = list.json?.data?.items ?? list.json?.data ?? [];
    if (themes.length < 2) return "主题少于两个";
    const current = (await req("GET", "/api/settings")).json?.data?.theme?.active;
    const other = themes.find((theme) => theme.id !== current)?.id;
    await req("PATCH", "/api/settings/theme", { active: other });
    const page = await req("GET", "/", undefined, { anonymous: true });
    await req("PATCH", "/api/settings/theme", { active: current });
    return page.status === 200 && page.text.includes("<!doctype html");
  });

  // ---------------------------------------------------------------- 前台与 SEO
  const frontRoutes = [
    ["/", "首页"],
    ["/archive", "归档"],
    ["/moments", "动态"],
    ["/projects", "项目"],
    ["/search?q=a", "搜索"],
    ["/rss.xml", "RSS"],
    ["/atom.xml", "Atom"],
    ["/feed.json", "JSON Feed"],
    ["/sitemap.xml", "sitemap"],
    ["/robots.txt", "robots"],
    ["/favicon.svg", "favicon"],
    ["/manifest.webmanifest", "webmanifest"],
    ["/admin", "后台 SPA 外壳"],
    ["/this-path-should-not-exist-xyz", "404 页面"],
  ];

  for (const [path, name] of frontRoutes) {
    await check("前台", `GET ${path}（${name}）`, async () => {
      const response = await req("GET", path, undefined, { anonymous: true });
      const expected = path.includes("should-not-exist") ? 404 : 200;
      return response.status === expected ? true : `status=${response.status}，期望 ${expected}`;
    });
  }

  await check("前台", "后台静态资源可加载", async () => {
    const shell = await req("GET", "/admin", undefined, { anonymous: true });
    const match = shell.text.match(/src="(\/assets\/[^"]+\.js)"/);
    if (!match) return "后台外壳里没有 JS 引用";
    const asset = await req("GET", match[1], undefined, { anonymous: true });
    return asset.status === 200 && asset.text.length > 1000;
  });

  await check("前台", "媒体路径未命中返回 404 而非 HTML", async () => {
    const response = await req("GET", "/media/not/a/real/key.png", undefined, { anonymous: true });
    return response.status === 404;
  });

  await check("前台", "未知 API 路径返回 JSON 404", async () => {
    const response = await req("GET", "/api/does-not-exist", undefined, { anonymous: true });
    return response.status === 404 && response.json?.error?.code === "NOT_FOUND";
  });

  await check("前台", "响应带安全头", async () => {
    const response = await req("GET", "/", undefined, { anonymous: true });
    return (
      response.headers.get("content-security-policy")?.includes("frame-ancestors 'none'") &&
      response.headers.get("x-content-type-options") === "nosniff"
    );
  });

  // ---------------------------------------------------------------- 输出
  console.table(results);
  const failed = results.filter((row) => row.结果 === "失败");
  console.log(`\n共 ${results.length} 项，通过 ${results.length - failed.length} 项，失败 ${failed.length} 项。`);
  if (failed.length > 0) {
    console.log("\n失败明细：");
    for (const row of failed) console.log(`  · [${row.分组}] ${row.检查项} —— ${row.说明 || "无说明"}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("验收脚本异常：", error);
  process.exitCode = 1;
});
