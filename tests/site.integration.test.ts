/**
 * 前台（SSR 主题 + SEO + 评论）集成测试。
 *
 * 这一层验证的是"访问者真正看到的东西"：状态码、渲染出来的标记、订阅源格式、
 * 搜索命中、评论的审核流，以及定时内容靠读时判断生效这条规则。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { createClient, resetState, setupOwner, type ApiEnvelope, type Client } from "./helpers";

let client: Client;

beforeEach(async () => {
  await resetState();
  client = createClient();
  const setup = await setupOwner(client);
  expect(setup.status).toBe(201);
  await client.patch("/api/settings/site", { values: { siteTitle: "太平测试站", siteDescription: "集成测试站点。" } });
});

async function publishPost(overrides: Record<string, unknown> = {}) {
  const created = await client.post<ApiEnvelope<{ id: string; slug: string }>>("/api/contents", {
    type: "post",
    title: "服务端渲染的一篇文章",
    excerpt: "用来验证前台渲染。",
    bodyMarkdown: "## 第一节\n\n正文里有独特词 azurepebble 方便搜索。\n\n```ts\nconst value: number = 1;\n```\n\n## 第二节\n\n结尾。",
    ...overrides,
  });
  expect(created.status).toBe(201);
  const published = await client.post(`/api/contents/${created.body.data.id}/status`, { target: "published" });
  expect(published.status).toBe(200);
  return created.body.data;
}

describe("首页与文档渲染", () => {
  it("首页返回 200 并渲染站点标题与描述", async () => {
    const page = await client.get<string>("/");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(page.body).toContain("太平测试站");
    expect(page.body).toContain("<!doctype html>");
  });

  it("首页输出 favicon、RSS 链接与内联主题样式", async () => {
    const page = await client.get<string>("/");
    expect(page.body).toContain('rel="icon"');
    expect(page.body).toContain("rss.xml");
    expect(page.body).toContain("<style");
  });

  it("文章页渲染正文、代码高亮与 JSON-LD", async () => {
    const post = await publishPost();
    const page = await client.get<string>(`/post/${post.slug}`);
    expect(page.status).toBe(200);
    expect(page.body).toContain("服务端渲染的一篇文章");
    expect(page.body).toContain("id=\"di-yi-jie\"");
    expect(page.body).toContain("hljs");
    expect(page.body).toContain("application/ld+json");
    expect(page.body).toContain("BlogPosting");
  });

  it("独立页面走根路径渲染", async () => {
    const created = await client.post<ApiEnvelope<{ id: string; slug: string }>>("/api/contents", {
      type: "page",
      title: "关于本站",
      bodyMarkdown: "这是一个独立页面。",
    });
    await client.post(`/api/contents/${created.body.data.id}/status`, { target: "published" });

    const page = await client.get<string>(`/${created.body.data.slug}`);
    expect(page.status).toBe(200);
    expect(page.body).toContain("这是一个独立页面");
  });

  it("不存在的路径返回 404 状态码而不是 200", async () => {
    const page = await client.get<string>("/this-does-not-exist");
    expect(page.status).toBe(404);
    expect(page.body).toContain("页面不存在");
  });

  it("归档页按年份分组可访问", async () => {
    await publishPost();
    const page = await client.get<string>("/archive");
    expect(page.status).toBe(200);
    expect(page.body).toContain("服务端渲染的一篇文章");
  });

  it("/admin 回落到后台 SPA 的 index.html", async () => {
    const page = await client.get<string>("/admin/posts");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    // 断言"返回的是 SPA 外壳，不是前台主题渲染的 404"。
    // 不校验外壳内部结构：后台产物由 pnpm build:console 生成，随前端迭代变化。
    expect(page.body).toContain("<!doctype html");
    expect(page.body).not.toContain("页面不存在");
  });

  it("后台路径不被前台路由吞掉（不会当成 slug 渲染）", async () => {
    const page = await client.get<string>("/admin");
    expect(page.status).toBe(200);
    expect(page.body).not.toContain("页面不存在");
  });
});

describe("SEO 与订阅源", () => {
  it("rss.xml 是合法 RSS 并包含文章条目", async () => {
    const post = await publishPost();
    const response = await client.get<string>("/rss.xml");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/rss+xml");
    expect(response.body.startsWith("<?xml")).toBe(true);
    expect(response.body).toContain("<rss version=\"2.0\"");
    expect(response.body).toContain(post.slug);
  });

  it("atom.xml 与 feed.json 都可用", async () => {
    await publishPost();
    const atom = await client.get<string>("/atom.xml");
    expect(atom.status).toBe(200);
    expect(atom.body).toContain("<feed xmlns=\"http://www.w3.org/2005/Atom\">");

    // 测试客户端会自动把合法 JSON 解析成对象（feed.json 的 content-type 是 application/feed+json）
    const json = await client.get<{ version: string; items: unknown[] }>("/feed.json");
    expect(json.status).toBe(200);
    expect(json.body.version).toContain("jsonfeed.org");
    expect(json.body.items.length).toBe(1);
  });

  it("sitemap.xml 包含首页与文章地址", async () => {
    const post = await publishPost();
    const response = await client.get<string>("/sitemap.xml");
    expect(response.status).toBe(200);
    expect(response.body).toContain("<urlset");
    expect(response.body).toContain(`/post/${post.slug}`);
  });

  it("robots.txt 指向 sitemap 且屏蔽后台", async () => {
    const response = await client.get<string>("/robots.txt");
    expect(response.status).toBe(200);
    expect(response.body).toContain("Disallow: /admin");
    expect(response.body).toContain("Sitemap:");
  });

  it("关闭订阅后 rss.xml 返回 404", async () => {
    await client.patch("/api/settings/site", { values: { seoFeedEnabled: false } });
    const response = await client.get<string>("/rss.xml");
    expect(response.status).toBe(404);
  });
});

describe("搜索", () => {
  it("中文关键词能命中已发布内容", async () => {
    await publishPost();
    const page = await client.get<string>("/search?q=" + encodeURIComponent("服务端渲染"));
    expect(page.status).toBe(200);
    expect(page.body).toContain("服务端渲染的一篇文章");
  });

  it("英文关键词走同一套索引", async () => {
    await publishPost();
    const page = await client.get<string>("/search?q=azurepebble");
    expect(page.status).toBe(200);
    expect(page.body).toContain("服务端渲染的一篇文章");
  });

  it("索引里只有已发布内容", async () => {
    await client.post("/api/contents", { type: "post", title: "草稿不该被搜到", bodyMarkdown: "draftonlyword" });
    const page = await client.get<string>("/search?q=draftonlyword");
    expect(page.body).not.toContain("草稿不该被搜到");
  });

  it("空查询不报错", async () => {
    const page = await client.get<string>("/search?q=");
    expect(page.status).toBe(200);
  });
});

describe("评论", () => {
  async function submitComment(contentId: string, body: string, name = "访客") {
    return client.request<string>("POST", "/comment", {
      form: new URLSearchParams({ contentId, parentId: "", name, email: "guest@example.com", url: "", body, website: "" }),
    });
  }

  it("默认进入待审核，审核通过后出现在页面", async () => {
    const post = await publishPost();
    const detail = await client.get<ApiEnvelope<{ id: string }>>(`/api/contents/${(await client.get<ApiEnvelope<{ items: { id: string; slug: string }[] }>>("/api/contents")).body.data.items[0]!.id}`);
    const contentId = detail.body.data.id;

    const submitted = await submitComment(contentId, "这是一条待审核的评论。");
    expect(submitted.status).toBe(303);

    const before = await client.get<string>(`/post/${post.slug}`);
    expect(before.body).not.toContain("这是一条待审核的评论");

    const pending = await client.get<ApiEnvelope<{ items: { id: string; status: string }[] }>>("/api/comments?status=pending");
    const comment = pending.body.data.items[0]!;
    expect(comment.status).toBe("pending");

    await client.post(`/api/comments/${comment.id}/moderate`, { status: "approved" });
    const after = await client.get<string>(`/post/${post.slug}`);
    expect(after.body).toContain("这是一条待审核的评论");
  });

  it("蜜罐字段命中时拒绝提交", async () => {
    const post = await publishPost();
    const list = await client.get<ApiEnvelope<{ items: { id: string }[] }>>("/api/contents");
    const contentId = list.body.data.items[0]!.id;
    const response = await client.request<string>("POST", "/comment", {
      form: new URLSearchParams({ contentId, parentId: "", name: "机器人", email: "bot@example.com", url: "", body: "spam", website: "http://spam.example" }),
    });
    expect(response.status).toBe(400);
    void post;
  });

  it("关闭评论后提交被拒绝", async () => {
    const post = await publishPost();
    const list = await client.get<ApiEnvelope<{ items: { id: string }[] }>>("/api/contents");
    const contentId = list.body.data.items[0]!.id;
    await client.patch(`/api/contents/${contentId}`, { allowComment: false });
    const response = await submitComment(contentId, "关评后的评论。");
    expect(response.status).toBe(400);
    void post;
  });

  it("回复形成嵌套结构", async () => {
    const created = await client.post<ApiEnvelope<{ id: string; slug: string }>>("/api/contents", {
      type: "post",
      title: "带回复的文章",
      bodyMarkdown: "正文。",
    });
    const contentId = created.body.data.id;
    await client.post(`/api/contents/${contentId}/status`, { target: "published" });

    await submitComment(contentId, "根评论。");
    const pending = await client.get<ApiEnvelope<{ items: { id: string }[] }>>("/api/comments?status=pending");
    const rootId = pending.body.data.items[0]!.id;
    await client.post(`/api/comments/${rootId}/moderate`, { status: "approved" });

    await client.request<string>("POST", "/comment", {
      form: new URLSearchParams({ contentId, parentId: rootId, name: "回复者", email: "r@example.com", url: "", body: "这是一条回复。", website: "" }),
    });
    const all = await client.get<ApiEnvelope<{ items: { id: string; depth: number }[] }>>("/api/comments?status=all");
    const reply = all.body.data.items.find((item) => item.depth === 1);
    expect(reply).toBeTruthy();
  });
});

describe("可见性规则", () => {
  it("发布时间在未来的内容对访客不可见（不依赖 cron 准时）", async () => {
    const post = await publishPost();
    const future = Date.now() + 3_600_000;
    await env.DB.prepare("update contents set published_at = ?1 where slug = ?2").bind(future, post.slug).run();

    expect((await client.get(`/post/${post.slug}`)).status).toBe(404);

    const home = await client.get<string>("/");
    expect(home.body).not.toContain("服务端渲染的一篇文章");
  });

  it("被移入回收站的内容不出现在 sitemap", async () => {
    const post = await publishPost();
    const list = await client.get<ApiEnvelope<{ items: { id: string; slug: string }[] }>>("/api/contents");
    const id = list.body.data.items.find((item) => item.slug === post.slug)!.id;
    await client.del(`/api/contents/${id}`);
    const sitemap = await client.get<string>("/sitemap.xml");
    expect(sitemap.body).not.toContain(post.slug);
  });
});
