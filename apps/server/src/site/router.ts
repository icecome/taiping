/**
 * 前台路由与渲染。
 *
 * 路由顺序即匹配优先级，改动前读这一段：
 *   资源路由（feed / sitemap / robots / favicon / manifest）
 *   → 固定列表页（/ /archive /moments /projects /search）
 *   → 分类标签页（/category/:slug、/tag/:slug、/series/:slug）
 *   → 内容详情（/post/:slug、/moment/:slug、/project/:slug）
 *   → 根级页面兜底（/:slug，对应内容类型 page）
 *   → 静态资源 → 404
 * `/:slug` 必须在所有固定路径之后，否则会吞掉 /search。
 */
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { eq, sql } from "drizzle-orm";
import type { Child } from "hono/jsx";
import { createDb } from "../db/client";
import { comments, contents } from "../db/schema";
import type { AppBindings, Env } from "../env";
import { bumpCacheVersion, withPageCache } from "../lib/cache";
import { sha256Hex } from "../lib/crypto";
import { badRequest, notFound } from "../lib/errors";
import { getEnabledPluginKeys, runCall, runFilter, type HookContext } from "../lib/hooks";
import { newId } from "../lib/id";
import { escapeHtml } from "../lib/markdown";
import { getSiteConfig, siteSetting, type ResolvedSiteConfig } from "../lib/settings";
import { contentPath } from "../lib/slug";
import { rateLimit } from "../middleware/security";
import { registerBuiltinPlugins } from "../plugins";
import { resolveTheme } from "../theme/registry";
import type { PageMeta, PageView, PostView, ThemeContext } from "../theme/types";
import {
  buildIdentity,
  loadArchiveView,
  loadComments,
  loadHomeView,
  loadMoments,
  loadNav,
  loadPageView,
  loadPostView,
  loadProjects,
  loadSearchView,
  loadTermView,
  type SiteDeps,
} from "./data";
import {
  buildArticleJsonLd,
  buildWebsiteJsonLd,
  renderAtom,
  renderJsonFeed,
  renderRobots,
  renderRss,
  renderSitemap,
} from "./seo";

registerBuiltinPlugins();

type SiteContext = Context<AppBindings>;

/** JSX → HTML。主题 renderer 都是同步的，这里仍 await 以兼容异步子组件。 */
async function toHtml(child: Child): Promise<string> {
  const resolved = await child;
  return resolved == null ? "" : String(resolved);
}

async function buildDeps(c: { env: Env }): Promise<SiteDeps> {
  const db = createDb(c.env.DB);
  const config = await getSiteConfig(c.env, db);
  const enabledPlugins = await getEnabledPluginKeys(c.env, db);
  const hookCtx: HookContext = { env: c.env, db, config };
  return { env: c.env, db, config, enabledPlugins, hookCtx };
}

function baseUrlOf(c: { env: Env; req: { url: string } }): string {
  const configured = c.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  return configured && configured.length > 0 ? configured : new URL(c.req.url).origin;
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function pageSizeOf(config: ResolvedSiteConfig): number {
  return Number(siteSetting<number>(config, "postsPerPage") ?? 10);
}

function cacheTtl(deps: SiteDeps): number {
  if (!siteSetting<boolean>(deps.config, "pageCacheEnabled")) return 0;
  return Number(siteSetting<number>(deps.config, "pageCacheSeconds") ?? siteSetting<number>(deps.config, "pageCacheTtlSeconds") ?? 300);
}

function themeSettings(config: ResolvedSiteConfig, themeId: string): Record<string, unknown> {
  const theme = resolveTheme(themeId);
  const out: Record<string, unknown> = {};
  for (const field of theme.manifest.settings) {
    out[field.key] = Array.isArray(field.default) ? [...field.default] : field.default;
  }
  return { ...out, ...(config.theme ?? {}) };
}

async function buildThemeContext(
  deps: SiteDeps,
  input: { baseUrl: string; currentPath: string; route: string; headHtml: string },
): Promise<ThemeContext> {
  const theme = resolveTheme(deps.config.activeTheme);
  const headFiltered = await runFilter("site.headHtml", { html: input.headHtml, route: input.route }, deps.hookCtx, deps.enabledPlugins);
  const footerFiltered = await runFilter("site.footerHtml", { html: "", route: input.route }, deps.hookCtx, deps.enabledPlugins);
  return {
    identity: buildIdentity(deps.config, input.baseUrl),
    nav: await loadNav(deps.db),
    theme: theme.manifest,
    settings: themeSettings(deps.config, theme.manifest.id),
    currentPath: input.currentPath,
    basePath: "",
    headExtraHtml: headFiltered.html,
    footerExtraHtml: footerFiltered.html,
  };
}

/**
 * 页面渲染统一出口。
 * 调用方只需要给出"用哪个 renderer 渲染哪个 view"，上下文与布局由这里负责，
 * 避免每个路由各写一遍 buildThemeContext（这是最容易漏掉插件注入点的地方）。
 */
async function renderDocument(
  deps: SiteDeps,
  c: SiteContext,
  input: {
    route: string;
    currentPath: string;
    meta: PageMeta;
    build: (ctx: ThemeContext) => Child;
  },
): Promise<string> {
  const theme = resolveTheme(deps.config.activeTheme);
  const ctx = await buildThemeContext(deps, {
    baseUrl: baseUrlOf(c),
    currentPath: input.currentPath,
    route: input.route,
    headHtml: input.meta.headHtml ?? "",
  });
  return toHtml(theme.render.layout(ctx, input.meta, input.build(ctx)));
}

function htmlResponse(body: string, headers: Record<string, string> = {}, status = 200): Response {
  const merged = new Headers({ "Content-Type": "text/html; charset=UTF-8" });
  for (const [key, value] of Object.entries(headers)) merged.set(key, value);
  return new Response(body, { status, headers: merged });
}

/* ------------------------------------------------------------------ 受保护内容的解锁令牌 */

function unlockCookieName(contentId: string): string {
  return `tp_pw_${contentId}`;
}

/** 无状态解锁令牌：内容密码变了，旧 cookie 自然失效。 */
function contentUnlockToken(contentId: string, password: string): Promise<string> {
  return sha256Hex(`tp-unlock:${contentId}:${password}`);
}

async function isUnlocked(
  c: SiteContext,
  db: ReturnType<typeof createDb>,
  slug: string,
  type?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: contents.id, password: contents.password })
    .from(contents)
    .where(type ? sql`${contents.slug} = ${slug} and ${contents.type} = ${type}` : eq(contents.slug, slug))
    .limit(1);
  const row = rows[0];
  if (!row || !row.password) return true;
  const cookie = getCookie(c, unlockCookieName(row.id));
  if (!cookie) return false;
  return cookie === (await contentUnlockToken(row.id, row.password));
}

function noticeText(value: string | null): string | null {
  if (value === "ok") return "评论已发布。";
  if (value === "pending") return "评论已提交，等待审核通过后显示。";
  if (value === "failed") return "密码不正确，请重试。";
  return null;
}

/* ------------------------------------------------------------------ 应用 */

export function createSiteApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  /* ------------------------------------------------------------ 资源路由 */

  app.get("/rss.xml", async (c) => {
    const deps = await buildDeps(c);
    if (!siteSetting<boolean>(deps.config, "seoFeedEnabled")) throw notFound();
    return new Response(await renderRss(deps.db, deps.config, baseUrlOf(c)), {
      headers: { "Content-Type": "application/rss+xml; charset=UTF-8", "Cache-Control": "public, max-age=600" },
    });
  });

  app.get("/atom.xml", async (c) => {
    const deps = await buildDeps(c);
    if (!siteSetting<boolean>(deps.config, "seoFeedEnabled")) throw notFound();
    return new Response(await renderAtom(deps.db, deps.config, baseUrlOf(c)), {
      headers: { "Content-Type": "application/atom+xml; charset=UTF-8", "Cache-Control": "public, max-age=600" },
    });
  });

  app.get("/feed.json", async (c) => {
    const deps = await buildDeps(c);
    if (!siteSetting<boolean>(deps.config, "seoFeedEnabled")) throw notFound();
    return new Response(await renderJsonFeed(deps.db, deps.config, baseUrlOf(c)), {
      headers: { "Content-Type": "application/feed+json; charset=UTF-8", "Cache-Control": "public, max-age=600" },
    });
  });

  app.get("/sitemap.xml", async (c) => {
    const deps = await buildDeps(c);
    if (!siteSetting<boolean>(deps.config, "seoSitemapEnabled")) throw notFound();
    return new Response(await renderSitemap(deps.db, baseUrlOf(c)), {
      headers: { "Content-Type": "application/xml; charset=UTF-8", "Cache-Control": "public, max-age=3600" },
    });
  });

  app.get("/robots.txt", async (c) => {
    const deps = await buildDeps(c);
    return new Response(renderRobots(deps.config, baseUrlOf(c)), {
      headers: { "Content-Type": "text/plain; charset=UTF-8", "Cache-Control": "public, max-age=3600" },
    });
  });

  /** 未上传 favicon 时给一个由站点名首字生成的 SVG，避免 404 噪音。 */
  app.get("/favicon.svg", async (c) => {
    const deps = await buildDeps(c);
    const configured = String(deps.config.site.siteFavicon ?? "");
    if (configured && configured !== "/favicon.svg") return c.redirect(configured, 302);
    const letter = escapeHtml(String(deps.config.site.siteTitle ?? "太").slice(0, 1));
    const accent = escapeHtml(String((deps.config.theme?.primaryColor as string) ?? "#b4552d"));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${accent}"/><text x="32" y="45" font-size="38" font-family="Georgia,serif" text-anchor="middle" fill="#ffffff">${letter}</text></svg>`;
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
  });

  app.get("/manifest.webmanifest", async (c) => {
    const deps = await buildDeps(c);
    return c.json({
      name: String(deps.config.site.siteTitle ?? "太平"),
      short_name: String(deps.config.site.siteTitle ?? "太平"),
      start_url: "/",
      display: "standalone",
      description: String(deps.config.site.siteDescription ?? ""),
      icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
    });
  });

  /* ------------------------------------------------------------ 列表页 */

  app.get("/", async (c) => {
    const deps = await buildDeps(c);
    return withPageCache(c.req.raw, c.env, { ttlSeconds: cacheTtl(deps) }, async () => {
      const url = new URL(c.req.url);
      const page = positiveInt(url.searchParams.get("page"), 1);
      const view = await loadHomeView(deps, page, pageSizeOf(deps.config), url.pathname, url.searchParams);
      const title = String(deps.config.site.siteTitle ?? "太平");
      const description = String(deps.config.site.siteDescription ?? "");
      const body = await renderDocument(deps, c, {
        route: "home",
        currentPath: url.pathname,
        meta: {
          title,
          description,
          canonical: `${baseUrlOf(c)}${page > 1 ? `/?page=${page}` : "/"}`,
          headHtml: buildWebsiteJsonLd({ baseUrl: baseUrlOf(c), title, description }),
          ogType: "website",
          ogImage: String(deps.config.site.seoDefaultImage ?? "") || null,
        },
        build: (ctx) => resolveTheme(deps.config.activeTheme).render.home(ctx, view),
      });
      return htmlResponse(body);
    });
  });

  app.get("/archive", async (c) => {
    const deps = await buildDeps(c);
    const url = new URL(c.req.url);
    const page = positiveInt(url.searchParams.get("page"), 1);
    const view = await loadArchiveView(deps, page, pageSizeOf(deps.config) * 2, url.pathname, url.searchParams);
    const body = await renderDocument(deps, c, {
      route: "archive",
      currentPath: url.pathname,
      meta: {
        title: "归档",
        description: view.description,
        canonical: baseUrlOf(c) + url.pathname,
      },
      build: (ctx) => resolveTheme(deps.config.activeTheme).render.archive(ctx, view),
    });
    return htmlResponse(body);
  });

  app.get("/archive/:year", async (c) => {
    const deps = await buildDeps(c);
    const url = new URL(c.req.url);
    const page = positiveInt(url.searchParams.get("page"), 1);
    const view = await loadArchiveView(deps, page, pageSizeOf(deps.config) * 2, url.pathname, url.searchParams, {
      year: c.req.param("year"),
    });
    const body = await renderDocument(deps, c, {
      route: "archive",
      currentPath: url.pathname,
      meta: { title: view.title, description: view.description, canonical: baseUrlOf(c) + url.pathname },
      build: (ctx) => resolveTheme(deps.config.activeTheme).render.archive(ctx, view),
    });
    return htmlResponse(body);
  });

  app.get("/moments", async (c) => {
    const deps = await buildDeps(c);
    const url = new URL(c.req.url);
    const page = positiveInt(url.searchParams.get("page"), 1);
    const view = await loadMoments(deps, page, pageSizeOf(deps.config) * 2, url.pathname, url.searchParams);
    const body = await renderDocument(deps, c, {
      route: "moments",
      currentPath: url.pathname,
      meta: { title: "动态", description: "短内容与日常记录。", canonical: baseUrlOf(c) + url.pathname },
      build: (ctx) => resolveTheme(deps.config.activeTheme).render.moments(ctx, view),
    });
    return htmlResponse(body);
  });

  app.get("/projects", async (c) => {
    const deps = await buildDeps(c);
    const url = new URL(c.req.url);
    const page = positiveInt(url.searchParams.get("page"), 1);
    const view = await loadProjects(deps, page, pageSizeOf(deps.config), url.pathname, url.searchParams);
    const body = await renderDocument(deps, c, {
      route: "projects",
      currentPath: url.pathname,
      meta: { title: "项目", description: "做过的项目与工具。", canonical: baseUrlOf(c) + url.pathname },
      build: (ctx) => resolveTheme(deps.config.activeTheme).render.projects(ctx, view),
    });
    return htmlResponse(body);
  });

  app.get("/search", async (c) => {
    const deps = await buildDeps(c);
    const url = new URL(c.req.url);
    const query = url.searchParams.get("q") ?? "";
    const page = positiveInt(url.searchParams.get("page"), 1);
    const view = await loadSearchView(deps, query, page, pageSizeOf(deps.config));
    const body = await renderDocument(deps, c, {
      route: "search",
      currentPath: url.pathname,
      meta: {
        title: query ? `搜索「${query}」` : "搜索",
        description: query ? `站内搜索：${query}` : "站内搜索。",
        canonical: `${baseUrlOf(c)}${url.pathname}${query ? `?q=${encodeURIComponent(query)}` : ""}`,
        noindex: true,
      },
      build: (ctx) => resolveTheme(deps.config.activeTheme).render.search(ctx, view),
    });
    return htmlResponse(body);
  });

  for (const termType of ["category", "tag", "series"] as const) {
    app.get(`/${termType}/:slug`, async (c) => {
      const deps = await buildDeps(c);
      const url = new URL(c.req.url);
      const page = positiveInt(url.searchParams.get("page"), 1);
      const view = await loadTermView(deps, termType, c.req.param("slug"), page, pageSizeOf(deps.config), url.pathname, url.searchParams);
      if (!view) return notFoundDocument(deps, c, url.pathname);
      const body = await renderDocument(deps, c, {
        route: "term",
        currentPath: url.pathname,
        meta: {
          title: view.term.name,
          description: view.term.description ?? `「${view.term.name}」下的全部内容，共 ${view.term.count} 篇。`,
          canonical: baseUrlOf(c) + url.pathname,
        },
        build: (ctx) => resolveTheme(deps.config.activeTheme).render.term(ctx, view),
      });
      return htmlResponse(body);
    });
  }

  /* ------------------------------------------------------------ 内容详情 */

  for (const contentType of ["post", "moment", "project"] as const) {
    app.get(`/${contentType}/:slug`, async (c) => {
      const deps = await buildDeps(c);
      const url = new URL(c.req.url);
      const slug = c.req.param("slug");
      return withPageCache(c.req.raw, c.env, { ttlSeconds: cacheTtl(deps) }, async () => {
        const unlock = await isUnlocked(c, deps.db, slug, contentType);
        const detail = await loadPostView(deps, contentType, slug, { unlock });
        if (!detail) return notFoundDocument(deps, c, url.pathname);

        const commentRows = await loadComments(
          deps.db,
          detail.content.id,
          Number(siteSetting<number>(deps.config, "commentMaxDepth") ?? 3),
        );
        const view: PostView = {
          content: detail.content,
          comments: commentRows,
          commentCount: countComments(commentRows),
          commentsOpen: detail.content.allowComment,
          notice: noticeText(url.searchParams.get("comment")),
        };
        const body = await renderDocument(deps, c, {
          route: contentType,
          currentPath: url.pathname,
          meta: {
            title: detail.content.title,
            description: detail.content.excerpt,
            canonical: `${baseUrlOf(c)}${contentPath(contentType, slug)}`,
            ogType: "article",
            ogImage: detail.content.coverUrl,
            publishedTime: detail.content.publishedAt,
            modifiedTime: detail.content.updatedAt,
            authorName: detail.content.author?.name ?? null,
            headHtml: buildArticleJsonLd({
              baseUrl: baseUrlOf(c),
              url: contentPath(contentType, slug),
              title: detail.content.title,
              description: detail.content.excerpt,
              authorName: detail.content.author?.name ?? "",
              publishedAt: detail.content.publishedAt,
              modifiedAt: detail.content.updatedAt,
              image: detail.content.coverUrl,
            }),
          },
          build: (ctx) => resolveTheme(deps.config.activeTheme).render.post(ctx, view),
        });
        return htmlResponse(body);
      });
    });
  }

  /* ------------------------------------------------------------ 评论与解锁 */

  app.post("/comment", async (c) => {
    const deps = await buildDeps(c);

    const form = await c.req.formData();
    if (String(form.get("website") ?? "")) throw badRequest("提交被拒绝");

    const contentId = String(form.get("contentId") ?? "");
    const parentId = String(form.get("parentId") ?? "") || null;
    const name = String(form.get("name") ?? "").trim().slice(0, 32);
    const email = String(form.get("email") ?? "").trim().slice(0, 120);
    const visitorUrl = String(form.get("url") ?? "").trim().slice(0, 200);
    const body = String(form.get("body") ?? "").trim().slice(0, 2000);

    const [content] = await deps.db
      .select({
        id: contents.id,
        type: contents.type,
        slug: contents.slug,
        allowComment: contents.allowComment,
        status: contents.status,
      })
      .from(contents)
      .where(eq(contents.id, contentId))
      .limit(1);

    if (!content || content.status !== "published") throw notFound("内容不存在");
    if (!content.allowComment || !siteSetting<boolean>(deps.config, "commentsEnabled")) throw badRequest("该内容已关闭评论");
    if (!name) throw badRequest("请填写昵称", { name: "必填" });
    if (!body) throw badRequest("请填写评论内容", { body: "必填" });
    if (siteSetting<boolean>(deps.config, "commentRequireEmail") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw badRequest("请填写有效的邮箱", { email: "格式不正确" });
    }

    const ip = c.req.header("cf-connecting-ip") ?? "0.0.0.0";
    const limit = await rateLimit(
      c.env.KV,
      `comment:${ip}`,
      Number(siteSetting<number>(deps.config, "commentRateLimitPerHour") ?? 10),
      3600,
    );
    if (!limit.allowed) throw badRequest("评论提交过于频繁，请稍后再试");

    let depth = 0;
    if (parentId) {
      const [parent] = await deps.db
        .select({ depth: comments.depth })
        .from(comments)
        .where(eq(comments.id, parentId))
        .limit(1);
      depth = Math.min(Number(siteSetting<number>(deps.config, "commentMaxDepth") ?? 3), (parent?.depth ?? 0) + 1);
    }

    // 敏感词命中直接进待审，不拒绝 —— 拒绝会误伤正常讨论。
    const words = (deps.config.site.commentModerationWords as string[] | undefined) ?? [];
    const hitWord = words.find((word) => word && body.includes(word));
    const defaultStatus = String(siteSetting<string>(deps.config, "defaultCommentStatus") ?? "pending");
    const status = hitWord ? "pending" : defaultStatus === "approved" ? "approved" : "pending";

    const filtered = await runFilter("comment.beforeCreate", { body, authorName: name, contentId }, deps.hookCtx, deps.enabledPlugins);

    const id = newId("cmt");
    await deps.db.insert(comments).values({
      id,
      contentId,
      parentId,
      rootId: parentId ?? null,
      depth,
      authorUserId: c.get("auth")?.user.id ?? null,
      authorName: name,
      authorEmail: email || null,
      authorUrl: visitorUrl || null,
      body: filtered.body,
      status,
      isOwner: Boolean(c.get("auth")?.isSuperAdmin),
      ip,
      userAgent: c.req.header("user-agent")?.slice(0, 400) ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (status === "approved") {
      await deps.db
        .update(contents)
        .set({ commentCount: sql`${contents.commentCount} + 1` })
        .where(eq(contents.id, contentId));
    }

    await runCall(
      "comment.afterCreate",
      { commentId: id, contentId, authorName: name, body: filtered.body, status },
      deps.hookCtx,
      deps.enabledPlugins,
    );
    await bumpCacheVersion(c.env);

    const target = `${contentPath(content.type, content.slug)}?comment=${status === "approved" ? "ok" : "pending"}#comment-${id}`;
    return c.redirect(target, 303);
  });

  app.post("/unlock", async (c) => {
    const deps = await buildDeps(c);
    const form = await c.req.formData();
    const contentId = String(form.get("contentId") ?? "");
    const password = String(form.get("password") ?? "");

    const [row] = await deps.db
      .select({ id: contents.id, type: contents.type, slug: contents.slug, password: contents.password })
      .from(contents)
      .where(eq(contents.id, contentId))
      .limit(1);
    if (!row) throw notFound("内容不存在");

    const target = contentPath(row.type, row.slug);
    if (!row.password || row.password !== password) return c.redirect(`${target}?unlock=failed`, 303);

    setCookie(c, unlockCookieName(contentId), await contentUnlockToken(contentId, row.password), {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: new URL(c.req.url).protocol === "https:",
      maxAge: 60 * 60 * 12,
    });
    return c.redirect(target, 303);
  });

  /* ------------------------------------------------------------ 根级页面兜底 */

  app.get("/:slug", async (c) => {
    const deps = await buildDeps(c);
    const url = new URL(c.req.url);
    const slug = c.req.param("slug");
    const unlock = await isUnlocked(c, deps.db, slug, "page");
    const view: PageView | null = await loadPageView(deps, slug, { unlock });
    if (!view) return fallbackToAssetsOr404(c, deps);
    const body = await renderDocument(deps, c, {
      route: "page",
      currentPath: url.pathname,
      meta: {
        title: view.content.title,
        description: view.content.excerpt,
        canonical: baseUrlOf(c) + url.pathname,
        ogType: "article",
      },
      build: (ctx) => resolveTheme(deps.config.activeTheme).render.page(ctx, view),
    });
    return htmlResponse(body);
  });

  /* ------------------------------------------------------------ 静态资源与 404 */

  app.get("*", async (c) => {
    const deps = await buildDeps(c);
    return fallbackToAssetsOr404(c, deps);
  });

  /**
   * 静态资源兜底。
   *
   * 因为 wrangler 配了 run_worker_first，所有请求都会先到 Worker，
   * 所以这里必须显式把静态文件与后台 SPA 交还给 ASSETS —— 否则 assets 永远收不到请求。
   * 这也是参考项目里被忽略的一处：assets 没设 run_worker_first 时，
   * SSR 分支对"有同名静态文件的路径"永远不生效。
   */
  async function fallbackToAssetsOr404(c: SiteContext, deps: SiteDeps): Promise<Response> {
    const path = new URL(c.req.url).pathname;

    if (path === "/admin" || path.startsWith("/admin/")) {
      const asset = await c.env.ASSETS.fetch(new Request(new URL("/index.html", c.req.url), { method: "GET" }));
      if (asset.ok) {
        return new Response(asset.body, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-cache" },
        });
      }
      const body = await renderDocument(deps, c, {
        route: "admin-missing",
        currentPath: path,
        meta: { title: "后台尚未构建", description: "", canonical: baseUrlOf(c) + path, noindex: true },
        build: (ctx) =>
          resolveTheme(deps.config.activeTheme).render.error(ctx, {
            status: 503,
            title: "后台尚未构建",
            message: "请先执行 pnpm build:console，再重启 Worker。",
          }),
      });
      return htmlResponse(body, { "Cache-Control": "no-store" }, 503);
    }

    const asset = await c.env.ASSETS.fetch(c.req.raw);
    if (asset.status !== 404 && asset.status !== 405) {
      const headers = new Headers(asset.headers);
      if (path.startsWith("/assets/")) headers.set("Cache-Control", "public, max-age=31536000, immutable");
      return new Response(asset.body, { status: asset.status, headers });
    }
    return notFoundDocument(deps, c, path);
  }

  async function notFoundDocument(deps: SiteDeps, c: SiteContext, path: string): Promise<Response> {
    const body = await renderDocument(deps, c, {
      route: "404",
      currentPath: path,
      meta: { title: "页面不存在", description: "请求的内容不存在或已被移除。", canonical: baseUrlOf(c) + path, noindex: true },
      build: (ctx) =>
        resolveTheme(deps.config.activeTheme).render.error(ctx, {
          status: 404,
          title: "页面不存在",
          message: "这个地址下没有内容，可能是链接过期或内容已被移除。",
        }),
    });
    return htmlResponse(body, { "Cache-Control": "no-store" }, 404);
  }

  return app;
}

function countComments(nodes: { replies: unknown[] }[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1;
    const replies = node.replies as { replies: unknown[] }[];
    if (replies.length > 0) total += countComments(replies);
  }
  return total;
}

export { toHtml, buildIdentity };
