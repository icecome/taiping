/**
 * 订阅源、站点地图、robots 与结构化数据。
 *
 * 不引入 feed 之类的生成库：三种格式的差异只在包装层，手写反而更可控，
 * 也避免把大量只用到一次的代码打进 Worker 包。
 */
import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { contents } from "../db/schema";
import { contentPath } from "../lib/slug";
import type { ResolvedSiteConfig } from "../lib/settings";
import { siteSetting } from "../lib/settings";
import { escapeHtml } from "../lib/markdown";

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function absolute(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

async function feedRows(db: Db, limit: number) {
  return db
    .select()
    .from(contents)
    .where(
      and(
        eq(contents.status, "published"),
        isNull(contents.deletedAt),
        or(isNull(contents.publishedAt), lte(contents.publishedAt, new Date())),
        sql`${contents.type} <> 'page'`,
      ),
    )
    .orderBy(desc(contents.publishedAt))
    .limit(limit);
}

function plainSummary(row: { excerpt: string | null; bodyHtml: string }): string {
  if (row.excerpt?.trim()) return row.excerpt;
  return row.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

export async function renderRss(db: Db, config: ResolvedSiteConfig, baseUrl: string): Promise<string> {
  const limit = Number(siteSetting<number>(config, "seoFeedLimit") ?? 20);
  const rows = await feedRows(db, limit);
  const title = String(config.site.siteTitle ?? "太平");
  const description = String(config.site.siteDescription ?? "");
  const updated = rows[0]?.publishedAt ?? new Date();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>${escapeXml(description)}</description>
    <language>${escapeXml(String(config.site.siteLanguage ?? "zh-CN"))}</language>
    <lastBuildDate>${updated.toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(absolute(baseUrl, "/rss.xml"))}" rel="self" type="application/rss+xml" />
${rows
  .map((row) => {
    const url = absolute(baseUrl, contentPath(row.type, row.slug));
    return `    <item>
      <title>${escapeXml(row.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${(row.publishedAt ?? row.createdAt).toUTCString()}</pubDate>
      <description>${escapeXml(plainSummary(row))}</description>
    </item>`;
  })
  .join("\n")}
  </channel>
</rss>`;
}

export async function renderAtom(db: Db, config: ResolvedSiteConfig, baseUrl: string): Promise<string> {
  const limit = Number(siteSetting<number>(config, "seoFeedLimit") ?? 20);
  const rows = await feedRows(db, limit);
  const title = String(config.site.siteTitle ?? "太平");
  const updated = rows[0]?.publishedAt ?? new Date();

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(title)}</title>
  <link href="${escapeXml(baseUrl)}" />
  <link href="${escapeXml(absolute(baseUrl, "/atom.xml"))}" rel="self" />
  <updated>${updated.toISOString()}</updated>
  <id>${escapeXml(baseUrl)}</id>
${rows
  .map((row) => {
    const url = absolute(baseUrl, contentPath(row.type, row.slug));
    return `  <entry>
    <title>${escapeXml(row.title)}</title>
    <link href="${escapeXml(url)}" />
    <id>${escapeXml(url)}</id>
    <updated>${(row.updatedAt ?? row.createdAt).toISOString()}</updated>
    <published>${(row.publishedAt ?? row.createdAt).toISOString()}</published>
    <summary>${escapeXml(plainSummary(row))}</summary>
  </entry>`;
  })
  .join("\n")}
</feed>`;
}

export async function renderJsonFeed(db: Db, config: ResolvedSiteConfig, baseUrl: string): Promise<string> {
  const limit = Number(siteSetting<number>(config, "seoFeedLimit") ?? 20);
  const rows = await feedRows(db, limit);
  return JSON.stringify(
    {
      version: "https://jsonfeed.org/version/1.1",
      title: String(config.site.siteTitle ?? "太平"),
      home_page_url: baseUrl,
      feed_url: absolute(baseUrl, "/feed.json"),
      description: String(config.site.siteDescription ?? ""),
      items: rows.map((row) => ({
        id: absolute(baseUrl, contentPath(row.type, row.slug)),
        url: absolute(baseUrl, contentPath(row.type, row.slug)),
        title: row.title,
        summary: plainSummary(row),
        date_published: (row.publishedAt ?? row.createdAt).toISOString(),
        date_modified: row.updatedAt.toISOString(),
        tags: [],
      })),
    },
    null,
    2,
  );
}

export async function renderSitemap(db: Db, baseUrl: string): Promise<string> {
  const rows = await db
    .select({
      type: contents.type,
      slug: contents.slug,
      updatedAt: contents.updatedAt,
    })
    .from(contents)
    .where(
      and(
        eq(contents.status, "published"),
        isNull(contents.deletedAt),
        or(isNull(contents.publishedAt), lte(contents.publishedAt, new Date())),
      ),
    )
    .orderBy(desc(contents.updatedAt))
    .limit(5000);

  const { terms } = await import("../db/schema");
  const termRows = await db.select({ type: terms.type, slug: terms.slug, updatedAt: terms.updatedAt }).from(terms);

  const urls = [
    { loc: baseUrl, lastmod: rows[0]?.updatedAt?.toISOString(), priority: "1.0" },
    ...rows.map((row) => ({
      loc: absolute(baseUrl, contentPath(row.type, row.slug)),
      lastmod: row.updatedAt?.toISOString(),
      priority: row.type === "page" ? "0.6" : "0.8",
    })),
    ...termRows.map((row) => ({
      loc: absolute(baseUrl, `/${row.type}/${row.slug}`),
      lastmod: row.updatedAt?.toISOString(),
      priority: "0.4",
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) =>
      `  <url><loc>${escapeXml(url.loc)}</loc>${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ""}<priority>${url.priority}</priority></url>`,
  )
  .join("\n")}
</urlset>`;
}

export function renderRobots(config: ResolvedSiteConfig, baseUrl: string): string {
  const policy = String(config.site.seoRobots ?? "index,follow");
  const disallowAll = policy.includes("noindex") && policy.includes("nofollow");
  return [
    "User-agent: *",
    disallowAll ? "Disallow: /" : "Disallow: /admin\nDisallow: /api",
    ...(disallowAll ? [] : [`Sitemap: ${absolute(baseUrl, "/sitemap.xml")}`]),
    "",
  ].join("\n");
}

/** 文章结构化数据（JSON-LD），交给 layout 注入 <head>。 */
export function buildArticleJsonLd(input: {
  baseUrl: string;
  url: string;
  title: string;
  description: string;
  authorName: string;
  publishedAt: string | null;
  modifiedAt: string | null;
  image: string | null;
}): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title,
    description: input.description,
    url: absolute(input.baseUrl, input.url),
    datePublished: input.publishedAt,
    dateModified: input.modifiedAt,
    author: { "@type": "Person", name: input.authorName },
    image: input.image ? [input.image] : undefined,
    mainEntityOfPage: { "@type": "WebPage", "@id": absolute(input.baseUrl, input.url) },
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

export function buildWebsiteJsonLd(input: { baseUrl: string; title: string; description: string }): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: input.title,
    description: input.description,
    url: input.baseUrl,
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

export { escapeHtml };
