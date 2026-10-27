/**
 * 前台数据装载层。
 *
 * 主题只拿到这里的输出（view model），不接触 db/env —— 这条边界的作用是：
 * 换主题不会把查询逻辑一起换掉，也不会因为主题作者写了 N+1 查询而拖垮 TTFB。
 *
 * 可见性规则集中在这里：只有 status='published' 且 published_at <= now 且未删除的内容
 * 对匿名访客可见。定时内容靠"读时判断"生效，不依赖 cron 准时执行。
 */
import { and, asc, desc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import type { Env } from "../env";
import {
  comments,
  contents,
  contentTerms,
  fieldDefinitions,
  media,
  navItems,
  terms,
  users,
} from "../db/schema";
import { deriveExcerpt, escapeHtml, renderMarkdown } from "../lib/markdown";
import { runFilter, type HookContext } from "../lib/hooks";
import { contentPath } from "../lib/slug";
import { siteSetting, type ResolvedSiteConfig } from "../lib/settings";
import type {
  ArchiveView,
  CommentNode,
  ContentDetail,
  ContentSummary,
  HomeView,
  MomentView,
  NavLink,
  PaginationView,
  PageView,
  PostView,
  ProjectView,
  SearchView,
  SiteIdentity,
  TermSummary,
  TermView,
} from "../theme/types";

export interface SiteDeps {
  env: Env;
  db: Db;
  config: ResolvedSiteConfig;
  enabledPlugins: ReadonlySet<string>;
  hookCtx: HookContext;
}

const now = () => new Date();

function publicCondition() {
  return and(
    eq(contents.status, "published"),
    isNull(contents.deletedAt),
    or(isNull(contents.publishedAt), lte(contents.publishedAt, now())),
  );
}

/* ------------------------------------------------------------------ 站点身份与导航 */

export function buildIdentity(config: ResolvedSiteConfig, baseUrl: string): SiteIdentity {
  const socialRaw = (config.site.socialLinks as string[] | undefined) ?? [];
  return {
    title: String(config.site.siteTitle ?? "太平"),
    description: String(config.site.siteDescription ?? ""),
    logo: String(config.site.siteLogo ?? ""),
    favicon: String(config.site.siteFavicon ?? "/favicon.svg"),
    language: String(config.site.siteLanguage ?? "zh-CN"),
    footerText: String(config.site.footerText ?? ""),
    icpNumber: String(config.site.icpNumber ?? ""),
    policeNumber: String(config.site.policeNumber ?? ""),
    copyright: String(config.site.copyright ?? ""),
    socialLinks: socialRaw
      .map((line) => {
        const [label, href] = line.split("|");
        return label && href ? { label: label.trim(), href: href.trim() } : null;
      })
      .filter((item): item is { label: string; href: string } => item !== null),
    baseUrl,
  };
}

export async function loadNav(db: Db): Promise<NavLink[]> {
  const rows = await db
    .select()
    .from(navItems)
    .where(and(eq(navItems.enabled, true), eq(navItems.location, "header")))
    .orderBy(asc(navItems.sortOrder));
  const roots = rows.filter((row) => !row.parentId);
  return roots.map((row) => ({
    label: row.label,
    href: row.href,
    target: row.target,
    icon: row.icon,
    children: rows
      .filter((child) => child.parentId === row.id)
      .map((child) => ({ label: child.label, href: child.href, target: child.target, icon: child.icon, children: [] })),
  }));
}

/* ------------------------------------------------------------------ 术语 */

export function termUrl(type: string, slug: string): string {
  return `/${type === "category" ? "category" : type}/${slug}`;
}

function toTermSummary(row: typeof terms.$inferSelect): TermSummary {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    slug: row.slug,
    url: termUrl(row.type, row.slug),
    count: row.count,
    description: row.description,
  };
}

export async function loadTerms(db: Db, type: string, limit = 50): Promise<TermSummary[]> {
  const rows = await db
    .select()
    .from(terms)
    .where(eq(terms.type, type))
    .orderBy(desc(terms.count), asc(terms.sortOrder), asc(terms.name))
    .limit(limit);
  return rows.map(toTermSummary);
}

/* ------------------------------------------------------------------ 内容映射 */

interface MapContext {
  deps: SiteDeps;
  authors: Map<string, { id: string; displayName: string; avatarUrl: string | null }>;
  termsByContent: Map<string, { id: string; type: string; name: string; slug: string }[]>;
  coverById: Map<string, string>;
  fieldsByContent: Map<string, { key: string; label: string; value: string }[]>;
}

async function buildMapContext(deps: SiteDeps, rows: { id: string; authorId: string; coverMediaId: string | null }[]): Promise<MapContext> {
  const ids = rows.map((row) => row.id);
  const authorIds = [...new Set(rows.map((row) => row.authorId))];
  const coverIds = rows.map((row) => row.coverMediaId).filter((v): v is string => !!v);

  const [authorRows, termRows, coverRows, fieldRows] = await Promise.all([
    authorIds.length
      ? deps.db.select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl }).from(users).where(inArray(users.id, authorIds))
      : Promise.resolve([]),
    ids.length
      ? deps.db
          .select({
            contentId: contentTerms.contentId,
            id: terms.id,
            type: terms.type,
            name: terms.name,
            slug: terms.slug,
            sortOrder: contentTerms.sortOrder,
          })
          .from(contentTerms)
          .innerJoin(terms, eq(terms.id, contentTerms.termId))
          .where(inArray(contentTerms.contentId, ids))
      : Promise.resolve([]),
    coverIds.length
      ? deps.db.select({ id: media.id, storageKey: media.storageKey, externalUrl: media.externalUrl }).from(media).where(inArray(media.id, coverIds))
      : Promise.resolve([]),
    ids.length
      ? deps.db
          .select({
            contentId: fieldValuesContentView.contentId,
            key: fieldValuesContentView.fieldKey,
            label: fieldDefinitions.label,
            valueText: fieldValuesContentView.valueText,
            valueNumber: fieldValuesContentView.valueNumber,
            sortOrder: fieldDefinitions.sortOrder,
          })
          .from(fieldValuesContentView)
          .innerJoin(fieldDefinitions, eq(fieldDefinitions.key, fieldValuesContentView.fieldKey))
          .where(inArray(fieldValuesContentView.contentId, ids))
      : Promise.resolve([]),
  ]);

  const termsByContent = new Map<string, { id: string; type: string; name: string; slug: string }[]>();
  for (const term of termRows.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const list = termsByContent.get(term.contentId) ?? [];
    list.push({ id: term.id, type: term.type, name: term.name, slug: term.slug });
    termsByContent.set(term.contentId, list);
  }

  const fieldsByContent = new Map<string, { key: string; label: string; value: string }[]>();
  for (const field of fieldRows.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const list = fieldsByContent.get(field.contentId) ?? [];
    list.push({ key: field.key, label: field.label, value: field.valueText ?? (field.valueNumber !== null ? String(field.valueNumber) : "") });
    fieldsByContent.set(field.contentId, list);
  }

  return {
    deps,
    authors: new Map(authorRows.map((row) => [row.id, row])),
    termsByContent,
    coverById: new Map(coverRows.map((row) => [row.id, row.externalUrl ?? `/media/${row.storageKey}`])),
    fieldsByContent,
  };
}

// 单独引用，避免与上面 select 的列名冲突
import { fieldValues as fieldValuesContentView } from "../db/schema";

function toSummary(row: typeof contents.$inferSelect, map: MapContext): ContentSummary {
  const termsForRow = map.termsByContent.get(row.id) ?? [];
  const author = map.authors.get(row.authorId) ?? null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    slug: row.slug,
    url: contentPath(row.type, row.slug),
    excerpt: row.excerpt ?? "",
    coverUrl: row.coverMediaId ? (map.coverById.get(row.coverMediaId) ?? null) : null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    readingMinutes: row.readingMinutes,
    wordCount: row.wordCount,
    viewCount: row.viewCount,
    commentCount: row.commentCount,
    isPinned: row.isPinned,
    author: author ? { id: author.id, name: author.displayName, avatarUrl: author.avatarUrl } : null,
    categories: termsForRow.filter((term) => term.type === "category").map((term) => ({
      id: term.id,
      type: term.type,
      name: term.name,
      slug: term.slug,
      url: termUrl(term.type, term.slug),
      count: 0,
      description: null,
    })),
    tags: termsForRow.filter((term) => term.type !== "category").map((term) => ({
      id: term.id,
      type: term.type,
      name: term.name,
      slug: term.slug,
      url: termUrl(term.type, term.slug),
      count: 0,
      description: null,
    })),
    fields: map.fieldsByContent.get(row.id) ?? [],
  };
}

export async function toSummaries(deps: SiteDeps, rows: (typeof contents.$inferSelect)[]): Promise<ContentSummary[]> {
  const map = await buildMapContext(deps, rows);
  return rows.map((row) => toSummary(row, map));
}

/* ------------------------------------------------------------------ 分页 */

export function buildPagination(
  page: number,
  pageSize: number,
  total: number,
  pathname: string,
  searchParams: URLSearchParams,
): PaginationView {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const link = (target: number): string => {
    const params = new URLSearchParams(searchParams);
    if (target <= 1) params.delete("page");
    else params.set("page", String(target));
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const pages: { page: number; url: string }[] = [];
  const window = 2;
  for (let index = 1; index <= totalPages; index += 1) {
    if (index === 1 || index === totalPages || Math.abs(index - page) <= window) {
      pages.push({ page: index, url: link(index) });
    } else if (pages[pages.length - 1]?.page !== 0) {
      pages.push({ page: 0, url: "" });
    }
  }

  return {
    page,
    totalPages,
    total,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    prevUrl: page > 1 ? link(page - 1) : null,
    nextUrl: page < totalPages ? link(page + 1) : null,
    pages,
  };
}

/* ------------------------------------------------------------------ 列表查询 */

export interface ListQuery {
  type?: string;
  termId?: string;
  /** 排除某内容类型（首页不显示 page）。 */
  excludeType?: string;
  authorId?: string;
  pinnedOnly?: boolean;
  page: number;
  pageSize: number;
}

export async function queryPublished(deps: SiteDeps, query: ListQuery): Promise<{ rows: (typeof contents.$inferSelect)[]; total: number }> {
  const conditions = [publicCondition()];
  if (query.type) conditions.push(eq(contents.type, query.type));
  if (query.excludeType) conditions.push(ne(contents.type, query.excludeType));
  if (query.authorId) conditions.push(eq(contents.authorId, query.authorId));
  if (query.pinnedOnly) conditions.push(eq(contents.isPinned, true));
  if (query.termId) {
    conditions.push(
      sql`exists (select 1 from content_terms ct where ct.content_id = ${contents.id} and ct.term_id = ${query.termId})`,
    );
  }
  const where = and(...conditions);

  const rows = await deps.db
    .select()
    .from(contents)
    .where(where)
    .orderBy(desc(contents.isPinned), desc(contents.publishedAt), desc(contents.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const [totalRow] = await deps.db.select({ value: sql<number>`count(*)` }).from(contents).where(where);
  return { rows, total: Number(totalRow?.value ?? 0) };
}

/* ------------------------------------------------------------------ 各页 view model */

export async function loadHomeView(
  deps: SiteDeps,
  page: number,
  pageSize: number,
  pathname: string,
  searchParams: URLSearchParams,
): Promise<HomeView> {
  const [list, pinnedList, categories, tags, archiveRows, statsRows, recentComments] = await Promise.all([
    queryPublished(deps, { excludeType: "page", page, pageSize }),
    page === 1
      ? queryPublished(deps, { excludeType: "page", pinnedOnly: true, page: 1, pageSize: 3 })
      : Promise.resolve({ rows: [], total: 0 }),
    loadTerms(deps.db, "category", 12),
    loadTerms(deps.db, "tag", 40),
    deps.db
      .select({
        year: sql<string>`strftime('%Y', ${contents.publishedAt} / 1000, 'unixepoch')`,
        count: sql<number>`count(*)`,
      })
      .from(contents)
      .where(publicCondition())
      .groupBy(sql`strftime('%Y', ${contents.publishedAt} / 1000, 'unixepoch')`)
      .orderBy(sql`1 desc`),
    deps.db
      .select({ value: sql<number>`count(*)` })
      .from(contents)
      .where(publicCondition()),
    deps.db
      .select({
        id: comments.id,
        authorName: comments.authorName,
        body: comments.body,
        createdAt: comments.createdAt,
        slug: contents.slug,
        type: contents.type,
      })
      .from(comments)
      .innerJoin(contents, eq(contents.id, comments.contentId))
      .where(and(eq(comments.status, "approved"), isNull(contents.deletedAt)))
      .orderBy(desc(comments.createdAt))
      .limit(5),
  ]);

  const [commentCountRow] = await deps.db
    .select({ value: sql<number>`count(*)` })
    .from(comments)
    .where(eq(comments.status, "approved"));

  const pinnedIds = new Set(pinnedList.rows.map((row) => row.id));
  const posts = await toSummaries(
    deps,
    list.rows.filter((row) => !pinnedIds.has(row.id) || page > 1),
  );
  const pinned = await toSummaries(deps, pinnedList.rows);

  return {
    posts,
    pinned,
    pagination: buildPagination(page, pageSize, list.total, pathname, searchParams),
    categories,
    tags,
    recentComments: recentComments.map((row) => ({
      id: row.id,
      authorName: row.authorName,
      body: row.body.slice(0, 80),
      url: `${contentPath(row.type, row.slug)}#comment-${row.id}`,
      createdAt: row.createdAt.toISOString(),
    })),
    archive: archiveRows
      .filter((row) => !!row.year)
      .map((row) => ({ year: row.year, count: Number(row.count), url: `/archive/${row.year}` })),
    stats: {
      posts: Number(statsRows[0]?.value ?? 0),
      comments: Number(commentCountRow?.value ?? 0),
      categories: categories.length,
      tags: tags.length,
    },
  };
}

export async function loadArchiveView(
  deps: SiteDeps,
  page: number,
  pageSize: number,
  pathname: string,
  searchParams: URLSearchParams,
  options: { year?: string; month?: string } = {},
): Promise<ArchiveView> {
  const extra = options.year
    ? sql`strftime('%Y', ${contents.publishedAt} / 1000, 'unixepoch') = ${options.year}`
    : undefined;
  const conditions = [publicCondition()];
  if (extra) conditions.push(extra);
  const where = and(...conditions);

  const rows = await deps.db
    .select()
    .from(contents)
    .where(where)
    .orderBy(desc(contents.publishedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [totalRow] = await deps.db.select({ value: sql<number>`count(*)` }).from(contents).where(where);

  return {
    title: options.year ? `${options.year} 年归档` : "全部文章",
    description: options.year ? `发布于 ${options.year} 年的内容。` : "按发布时间倒序排列。",
    posts: await toSummaries(deps, rows),
    pagination: buildPagination(page, pageSize, Number(totalRow?.value ?? 0), pathname, searchParams),
    categories: await loadTerms(deps.db, "category", 12),
    tags: await loadTerms(deps.db, "tag", 40),
  };
}

export async function loadTermView(
  deps: SiteDeps,
  type: string,
  slug: string,
  page: number,
  pageSize: number,
  pathname: string,
  searchParams: URLSearchParams,
): Promise<TermView | null> {
  const [term] = await deps.db
    .select()
    .from(terms)
    .where(and(eq(terms.type, type), eq(terms.slug, slug)))
    .limit(1);
  if (!term) return null;

  const list = await queryPublished(deps, { termId: term.id, page, pageSize });
  const allOfType = await deps.db.select().from(terms).where(eq(terms.type, type)).orderBy(asc(terms.sortOrder), asc(terms.name));

  return {
    term: { ...toTermSummary(term), count: list.total },
    posts: await toSummaries(deps, list.rows),
    pagination: buildPagination(page, pageSize, list.total, pathname, searchParams),
    siblings: allOfType.filter((row) => row.parentId === term.parentId && row.id !== term.id).map(toTermSummary),
    children: allOfType.filter((row) => row.parentId === term.id).map(toTermSummary),
  };
}

export async function loadPostView(
  deps: SiteDeps,
  type: string,
  slug: string,
  options: { unlock?: boolean; notice?: string | null } = {},
): Promise<{ content: ContentDetail; prev: { title: string; url: string } | null; next: { title: string; url: string } | null; related: ContentSummary[] } | null> {
  const [row] = await deps.db
    .select()
    .from(contents)
    .where(and(eq(contents.slug, slug), eq(contents.type, type), publicCondition()))
    .limit(1);
  if (!row) return null;

  const base = await toSummaries(deps, [row]);
  const summary = base[0]!;
  const locked = row.visibility === "password" && !options.unlock;

  let html = "";
  let headings: { depth: number; text: string; id: string }[] = [];
  if (!locked) {
    const rendered = renderMarkdown(row.bodyMarkdown, Number(siteSetting<number>(deps.config, "readingMinutesBase") ?? 400));
    html = rendered.html;
    headings = rendered.headings;
    const filtered = await runFilter(
      "content.renderHtml",
      {
        html,
        headings,
        content: {
          id: row.id,
          type: row.type,
          slug: row.slug,
          title: row.title,
          url: contentPath(row.type, row.slug),
          authorId: row.authorId,
          authorName: summary.author?.name ?? null,
          publishedAt: row.publishedAt,
        },
      },
      deps.hookCtx,
      deps.enabledPlugins,
    );
    html = filtered.html;
    headings = filtered.headings;
  }

  // 相邻文章：用毫秒时间戳做比较。
  // 注意：D1 只接受 string / number / null / ArrayBuffer 作为绑定值，
  // 直接把 Date 塞进 sql`` 模板会抛 "Invalid binding type"，所以统一转成毫秒。
  const pivot = (row.publishedAt ?? now()).getTime();
  const neighbourCondition = publicCondition();
  const [prevRow] = await deps.db
    .select({ title: contents.title, type: contents.type, slug: contents.slug })
    .from(contents)
    .where(and(neighbourCondition, ne(contents.id, row.id), sql`${contents.publishedAt} < ${pivot}`))
    .orderBy(desc(contents.publishedAt))
    .limit(1);
  const [nextRow] = await deps.db
    .select({ title: contents.title, type: contents.type, slug: contents.slug })
    .from(contents)
    .where(and(neighbourCondition, ne(contents.id, row.id), sql`${contents.publishedAt} > ${pivot}`))
    .orderBy(asc(contents.publishedAt))
    .limit(1);

  const categoryIds = summary.categories.map((term) => term.id);
  let relatedRows: (typeof contents.$inferSelect)[] = [];
  if (categoryIds.length > 0) {
    relatedRows = await deps.db
      .select()
      .from(contents)
      .where(
        and(
          publicCondition(),
          ne(contents.id, row.id),
          sql`exists (select 1 from content_terms ct where ct.content_id = ${contents.id} and ct.term_id in (${sql.join(categoryIds.map((id) => sql`${id}`), sql`, `)}))`,
        ),
      )
      .orderBy(desc(contents.publishedAt))
      .limit(4);
  }

  return {
    content: {
      ...summary,
      html,
      headings,
      locked,
      allowComment: row.allowComment && Boolean(siteSetting<boolean>(deps.config, "commentsEnabled")),
      prev: prevRow ? { title: prevRow.title, url: contentPath(prevRow.type, prevRow.slug) } : null,
      next: nextRow ? { title: nextRow.title, url: contentPath(nextRow.type, nextRow.slug) } : null,
      related: await toSummaries(deps, relatedRows),
    },
    prev: prevRow ? { title: prevRow.title, url: contentPath(prevRow.type, prevRow.slug) } : null,
    next: nextRow ? { title: nextRow.title, url: contentPath(nextRow.type, nextRow.slug) } : null,
    related: await toSummaries(deps, relatedRows),
  };
}

export async function loadComments(db: Db, contentId: string, maxDepth: number): Promise<CommentNode[]> {
  const rows = await db
    .select()
    .from(comments)
    .where(and(eq(comments.contentId, contentId), eq(comments.status, "approved")))
    .orderBy(asc(comments.createdAt));
  if (rows.length === 0) return [];

  const userEmails = new Map<string, string | null>();
  const byId = new Map<string, CommentNode>();
  for (const row of rows) {
    userEmails.set(row.id, row.authorEmail);
    byId.set(row.id, {
      id: row.id,
      authorName: row.authorName,
      authorUrl: row.authorUrl,
      avatarUrl: null,
      body: escapeHtml(row.body).replace(/\n/g, "<br>"),
      createdAt: row.createdAt.toISOString(),
      isOwner: row.isOwner,
      replies: [],
    });
  }

  const roots: CommentNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id)!;
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    if (parent && row.depth < maxDepth) parent.replies.push(node);
    else if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function loadPageView(deps: SiteDeps, slug: string, options: { unlock?: boolean } = {}): Promise<PageView | null> {
  const detail = await loadPostView(deps, "page", slug, options);
  if (!detail) return null;
  const childrenRows = await deps.db
    .select({ title: contents.title, slug: contents.slug, type: contents.type })
    .from(contents)
    .where(and(publicCondition(), eq(contents.type, "page"), ne(contents.slug, slug)))
    .orderBy(asc(contents.title))
    .limit(10);
  return {
    content: detail.content,
    children: childrenRows.map((row) => ({ title: row.title, url: contentPath(row.type, row.slug) })),
  };
}

export async function loadMoments(deps: SiteDeps, page: number, pageSize: number, pathname: string, searchParams: URLSearchParams): Promise<MomentView> {
  const list = await queryPublished(deps, { type: "moment", page, pageSize });
  return {
    moments: await toSummaries(deps, list.rows),
    pagination: buildPagination(page, pageSize, list.total, pathname, searchParams),
  };
}

export async function loadProjects(deps: SiteDeps, page: number, pageSize: number, pathname: string, searchParams: URLSearchParams): Promise<ProjectView> {
  const list = await queryPublished(deps, { type: "project", page, pageSize });
  return {
    projects: await toSummaries(deps, list.rows),
    pagination: buildPagination(page, pageSize, list.total, pathname, searchParams),
  };
}

export async function loadSearchView(deps: SiteDeps, query: string, page: number, pageSize: number): Promise<SearchView> {
  const started = Date.now();
  if (!query.trim()) return { query: "", results: [], total: 0, tookMs: 0 };
  const { searchPublished } = await import("../lib/search");
  const hits = await searchPublished(deps.db, query, pageSize + (page - 1) * pageSize);
  const pageSlice = hits.slice((page - 1) * pageSize, page * pageSize);
  const ids = pageSlice.map((hit) => hit.id);
  const rows = ids.length
    ? await deps.db.select().from(contents).where(inArray(contents.id, ids))
    : [];
  const ordered = ids.map((id) => rows.find((row) => row.id === id)).filter((row): row is (typeof contents.$inferSelect) => !!row);
  return {
    query,
    results: await toSummaries(deps, ordered),
    total: hits.length,
    tookMs: Date.now() - started,
  };
}


