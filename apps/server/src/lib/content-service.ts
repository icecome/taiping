/**
 * 内容领域服务。
 *
 * 所有"写内容"的动作都从这里走，保证四件事在任何入口都一致（API、批量操作、定时任务）：
 *   1. bodyMarkdown → bodyHtml / 字数 / 阅读时长 / 摘要 的派生；
 *   2. 版本快照（可选）；
 *   3. 分类标签关联与冗余计数；
 *   4. 搜索索引刷新与页面缓存失效。
 *
 * 这也是相对参考项目的主要修正点：LuyBlog 的写逻辑散在 routes 里，
 * GET 详情还顺手写 view_count，导致读接口无法缓存、归档静默丢数据。
 */
import { and, asc, desc, eq, inArray, isNull, like, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client";
import type { Env } from "../env";
import {
  contentRevisions,
  contents,
  contentTerms,
  fieldDefinitions,
  fieldValues,
  media,
  terms,
  users,
} from "../db/schema";
import { getContentType, type ContentStatus, type ContentVisibility } from "../shared/content-types";
import { bumpCacheVersion } from "./cache";
import { conflict, notFound } from "./errors";
import { enqueueTask } from "./tasks";
import { refreshSearchIndex, removeFromSearchIndex } from "./search";
import { deriveExcerpt, renderMarkdown } from "./markdown";
import { contentPath } from "./slug";

export type ContentRow = typeof contents.$inferSelect;

export interface ContentWriteInput {
  type: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  bodyMarkdown: string;
  status?: ContentStatus;
  visibility?: ContentVisibility;
  template?: string | null;
  password?: string | null;
  isPinned?: boolean;
  allowComment?: boolean;
  coverMediaId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  canonicalUrl?: string | null;
  ogImageUrl?: string | null;
  scheduledAt?: Date | null;
  extra?: Record<string, unknown>;
}

export interface RenderOptions {
  excerptLength: number;
  wordsPerMinute: number;
  /** 保存前 filter 的出口，由调用方注入（需要插件上下文）。 */
  transformBody?: (body: string) => Promise<string>;
}

/** 版本号：同一内容自增，用于「查看历史 / 回滚」。 */
async function nextRevisionNo(db: Db, contentId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${contentRevisions.revisionNo}), 0)` })
    .from(contentRevisions)
    .where(eq(contentRevisions.contentId, contentId));
  return Number(row?.max ?? 0) + 1;
}

export interface SaveResult {
  row: ContentRow;
  created: boolean;
  revisionNo: number | null;
}

export async function createContent(
  env: Env,
  db: Db,
  authorId: string,
  input: ContentWriteInput,
  options: RenderOptions,
): Promise<SaveResult> {
  const type = getContentType(input.type);
  if (!type) throw conflict(`未知内容类型：${input.type}`);

  const body = options.transformBody ? await options.transformBody(input.bodyMarkdown) : input.bodyMarkdown;
  const rendered = renderMarkdown(body, options.wordsPerMinute);
  const excerpt = input.excerpt?.trim() || deriveExcerpt(rendered.plainText, options.excerptLength);
  const now = new Date();
  const status = input.status ?? "draft";
  const publishedAt = status === "published" ? (input.scheduledAt ?? now) : null;

  const id = await allocateId();
  const values: typeof contents.$inferInsert = {
    id,
    type: input.type,
    title: input.title,
    slug: input.slug,
    excerpt,
    bodyMarkdown: body,
    bodyHtml: rendered.html,
    status,
    visibility: input.visibility ?? "public",
    authorId,
    coverMediaId: input.coverMediaId ?? null,
    template: input.template ?? null,
    password: input.visibility === "password" ? (input.password ?? null) : null,
    isPinned: input.isPinned ?? false,
    allowComment: type.supports.comments ? (input.allowComment ?? true) : false,
    wordCount: rendered.wordCount,
    readingMinutes: rendered.readingMinutes,
    extraJson: JSON.stringify(input.extra ?? {}),
    seoTitle: input.seoTitle ?? null,
    seoDescription: input.seoDescription ?? null,
    seoKeywords: input.seoKeywords ?? null,
    canonicalUrl: input.canonicalUrl ?? null,
    ogImageUrl: input.ogImageUrl ?? null,
    publishedAt,
    scheduledAt: status === "scheduled" ? (input.scheduledAt ?? null) : null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(contents).values(values);

  let revisionNo: number | null = null;
  if (type.supports.revisions) {
    revisionNo = 1;
    await db.insert(contentRevisions).values({
      id: await allocateRevisionId(),
      contentId: id,
      revisionNo,
      title: input.title,
      excerpt,
      bodyMarkdown: body,
      status,
      metaJson: "{}",
      note: "创建",
      authorId,
      createdAt: now,
    });
  }

  if (status === "published") await refreshSearchIndex(env, db, id);
  await bumpCacheVersion(env);

  const [row] = await db.select().from(contents).where(eq(contents.id, id)).limit(1);
  return { row: row!, created: true, revisionNo };
}

export async function updateContent(
  env: Env,
  db: Db,
  contentId: string,
  input: Partial<ContentWriteInput>,
  options: RenderOptions,
  editorId: string,
  note?: string,
): Promise<SaveResult> {
  const [existing] = await db.select().from(contents).where(eq(contents.id, contentId)).limit(1);
  if (!existing) throw notFound("内容不存在");
  const type = getContentType(existing.type);
  if (!type) throw conflict("内容类型已下线");

  const patch: Partial<typeof contents.$inferInsert> = { updatedAt: new Date() };
  const nextTitle = input.title ?? existing.title;
  if (input.title !== undefined) patch.title = input.title;

  if (input.bodyMarkdown !== undefined) {
    const body = options.transformBody ? await options.transformBody(input.bodyMarkdown) : input.bodyMarkdown;
    const rendered = renderMarkdown(body, options.wordsPerMinute);
    patch.bodyMarkdown = body;
    patch.bodyHtml = rendered.html;
    patch.wordCount = rendered.wordCount;
    patch.readingMinutes = rendered.readingMinutes;
    if (input.excerpt === undefined) {
      patch.excerpt = existing.excerpt?.trim() ? existing.excerpt : deriveExcerpt(rendered.plainText, options.excerptLength);
    }
  }
  if (input.excerpt !== undefined) patch.excerpt = input.excerpt;

  if (input.slug !== undefined && input.slug !== existing.slug) patch.slug = input.slug;
  if (input.visibility !== undefined) {
    patch.visibility = input.visibility;
    patch.password = input.visibility === "password" ? (input.password ?? existing.password) : null;
  } else if (input.password !== undefined) {
    patch.password = input.password;
  }
  if (input.template !== undefined) patch.template = input.template;
  if (input.isPinned !== undefined) patch.isPinned = input.isPinned;
  if (input.allowComment !== undefined) patch.allowComment = input.allowComment;
  if (input.coverMediaId !== undefined) patch.coverMediaId = input.coverMediaId;
  if (input.seoTitle !== undefined) patch.seoTitle = input.seoTitle;
  if (input.seoDescription !== undefined) patch.seoDescription = input.seoDescription;
  if (input.seoKeywords !== undefined) patch.seoKeywords = input.seoKeywords;
  if (input.canonicalUrl !== undefined) patch.canonicalUrl = input.canonicalUrl;
  if (input.ogImageUrl !== undefined) patch.ogImageUrl = input.ogImageUrl;
  if (input.extra !== undefined) patch.extraJson = JSON.stringify(input.extra);
  if (input.scheduledAt !== undefined && existing.status === "scheduled") patch.scheduledAt = input.scheduledAt;

  await db.update(contents).set(patch).where(eq(contents.id, contentId));

  let revisionNo: number | null = null;
  if (type.supports.revisions) {
    revisionNo = await nextRevisionNo(db, contentId);
    const [fresh] = await db.select().from(contents).where(eq(contents.id, contentId)).limit(1);
    await db.insert(contentRevisions).values({
      id: await allocateRevisionId(),
      contentId,
      revisionNo,
      title: fresh!.title,
      excerpt: fresh!.excerpt,
      bodyMarkdown: fresh!.bodyMarkdown,
      status: fresh!.status,
      metaJson: "{}",
      note: note ?? "更新",
      authorId: editorId,
      createdAt: new Date(),
    });
  }

  if (existing.status === "published" || existing.status === "scheduled") {
    await enqueueTask(db, "reindex-search", { contentId });
  }
  await bumpCacheVersion(env);

  const [row] = await db.select().from(contents).where(eq(contents.id, contentId)).limit(1);
  void nextTitle;
  return { row: row!, created: false, revisionNo };
}

export interface TransitionResult {
  row: ContentRow;
  changed: boolean;
}

/** 状态流转：draft/pending/scheduled/published/trashed 之间的移动。 */
export async function transitionStatus(
  env: Env,
  db: Db,
  contentId: string,
  target: "draft" | "pending" | "scheduled" | "published" | "trashed",
  options: { scheduledAt?: Date | null; editorId: string },
): Promise<TransitionResult> {
  const [existing] = await db.select().from(contents).where(eq(contents.id, contentId)).limit(1);
  if (!existing) throw notFound("内容不存在");

  const now = new Date();
  const patch: Partial<typeof contents.$inferInsert> = { status: target, updatedAt: now };

  if (target === "published") {
    patch.publishedAt = existing.publishedAt ?? now;
    patch.scheduledAt = null;
    patch.deletedAt = null;
  } else if (target === "scheduled") {
    if (!options.scheduledAt) throw conflict("定时发布必须提供发布时间");
    patch.scheduledAt = options.scheduledAt;
    patch.publishedAt = null;
  } else if (target === "trashed") {
    patch.deletedAt = now;
  } else {
    patch.publishedAt = null;
    patch.scheduledAt = null;
  }

  await db.update(contents).set(patch).where(eq(contents.id, contentId));

  if (target === "published") await refreshSearchIndex(env, db, contentId);
  else await removeFromSearchIndex(db, contentId);

  await bumpCacheVersion(env);
  void options.editorId;

  const [row] = await db.select().from(contents).where(eq(contents.id, contentId)).limit(1);
  return { row: row!, changed: existing.status !== target };
}

export async function restoreContent(env: Env, db: Db, contentId: string): Promise<ContentRow> {
  const [existing] = await db.select().from(contents).where(eq(contents.id, contentId)).limit(1);
  if (!existing) throw notFound("内容不存在");
  if (existing.status !== "trashed") throw conflict("只有回收站里的内容可以恢复");
  await db
    .update(contents)
    .set({ status: "draft", deletedAt: null, updatedAt: new Date() })
    .where(eq(contents.id, contentId));
  await bumpCacheVersion(env);
  const [row] = await db.select().from(contents).where(eq(contents.id, contentId)).limit(1);
  return row!;
}

export async function purgeContent(env: Env, db: Db, contentId: string): Promise<void> {
  await db.delete(contentTerms).where(eq(contentTerms.contentId, contentId));
  await db.delete(contentRevisions).where(eq(contentRevisions.contentId, contentId));
  await db.delete(fieldValues).where(eq(fieldValues.contentId, contentId));
  await removeFromSearchIndex(db, contentId);
  await db.delete(contents).where(eq(contents.id, contentId));
  await bumpCacheVersion(env);
}

/* ------------------------------------------------------------------ 关联同步 */

export async function syncContentTerms(db: Db, contentId: string, termIds: string[]): Promise<void> {
  const previous = await db
    .select({ termId: contentTerms.termId })
    .from(contentTerms)
    .where(eq(contentTerms.contentId, contentId));
  const previousIds = previous.map((row) => row.termId);

  await db.delete(contentTerms).where(eq(contentTerms.contentId, contentId));
  if (termIds.length > 0) {
    await db.insert(contentTerms).values(
      termIds.map((termId, index) => ({ contentId, termId, sortOrder: index })),
    );
  }
  await recalcTermCounts(db, [...new Set([...previousIds, ...termIds])]);
}

export async function recalcTermCounts(db: Db, termIds: string[]): Promise<void> {
  for (const termId of termIds) {
    await db.run(sql`
      update terms set count = (
        select count(*) from content_terms ct
        join contents c on c.id = ct.content_id
        where ct.term_id = ${termId}
          and c.status = 'published'
          and c.deleted_at is null
          and (c.published_at is null or c.published_at <= (unixepoch() * 1000))
      ) where id = ${termId}
    `);
  }
}

/** 自定义字段写入：按字段定义的类型落到对应列。 */
export async function syncContentFields(
  db: Db,
  contentId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const definitions = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.enabled, true));
  const byKey = new Map(definitions.map((definition) => [definition.key, definition]));

  await db.delete(fieldValues).where(eq(fieldValues.contentId, contentId));
  const rows: (typeof fieldValues.$inferInsert)[] = [];

  for (const [key, raw] of Object.entries(values)) {
    const definition = byKey.get(key);
    if (!definition) continue;
    if (raw === null || raw === undefined || raw === "") continue;
    const row: typeof fieldValues.$inferInsert = { contentId, fieldKey: key };
    switch (definition.fieldType) {
      case "number":
        row.valueNumber = Number(raw);
        break;
      case "boolean":
        row.valueBool = raw === true || raw === "true";
        break;
      case "json":
        row.valueJson = typeof raw === "string" ? raw : JSON.stringify(raw);
        break;
      default:
        row.valueText = String(raw);
    }
    rows.push(row);
  }

  if (rows.length > 0) await db.insert(fieldValues).values(rows);
}

/* ------------------------------------------------------------------ 查询 */

export interface ContentListFilters {
  types?: string[];
  status?: string;
  authorId?: string;
  termId?: string;
  termType?: string;
  query?: string;
  visibility?: string;
  includeTrashed?: boolean;
  page: number;
  pageSize: number;
  sort?: "updated" | "created" | "published" | "title" | "views";
}

export async function listContents(db: Db, filters: ContentListFilters): Promise<{ items: ContentRow[]; total: number }> {
  // 用 SQL 模板比较枚举列，避免把 string 塞进 drizzle 的联合字面量类型里做无意义的类型体操。
  const conditions: SQL[] = [];
  if (filters.types && filters.types.length > 0) conditions.push(inArray(contents.type, filters.types));
  if (filters.status && filters.status !== "all") conditions.push(sql`${contents.status} = ${filters.status}`);
  else if (!filters.includeTrashed) conditions.push(sql`${contents.status} <> 'trashed'`);
  if (filters.authorId) conditions.push(eq(contents.authorId, filters.authorId));
  if (filters.visibility) conditions.push(sql`${contents.visibility} = ${filters.visibility}`);
  if (filters.query) {
    const needle = `%${filters.query}%`;
    const matched = or(like(contents.title, needle), like(contents.slug, needle), like(contents.excerpt, needle));
    if (matched) conditions.push(matched);
  }
  if (filters.termId) {
    conditions.push(
      sql`exists (select 1 from content_terms ct where ct.content_id = ${contents.id} and ct.term_id = ${filters.termId})`,
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const orderBy =
    filters.sort === "created"
      ? [desc(contents.createdAt)]
      : filters.sort === "title"
        ? [asc(contents.title)]
        : filters.sort === "views"
          ? [desc(contents.viewCount)]
          : filters.sort === "published"
            ? [desc(contents.publishedAt)]
            : [desc(contents.updatedAt)];

  // drizzle 的 .where() 不接受 undefined，因此这里分支构造：没有过滤条件时不调用 .where()。
  const rowsQuery = db.select().from(contents);
  const totalQuery = db.select({ value: sql<number>`count(*)` }).from(contents);
  const filtered = where ? rowsQuery.where(where) : rowsQuery;
  const counted = where ? totalQuery.where(where) : totalQuery;

  const rows = await filtered
    .orderBy(...orderBy)
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const [totalRow] = await counted;

  return { items: rows, total: Number(totalRow?.value ?? 0) };
}

export interface ContentWithRelations {
  row: ContentRow;
  terms: { id: string; type: string; name: string; slug: string }[];
  author: { id: string; displayName: string; avatarUrl: string | null } | null;
  coverUrl: string | null;
  fields: { key: string; label: string; value: string }[];
}

export async function loadContentRelations(db: Db, rows: ContentRow[]): Promise<Map<string, ContentWithRelations>> {
  const ids = rows.map((row) => row.id);
  const result = new Map<string, ContentWithRelations>();
  if (ids.length === 0) return result;

  const termRows = await db
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
    .where(inArray(contentTerms.contentId, ids));

  const authorIds = [...new Set(rows.map((row) => row.authorId))];
  const authorRows = await db
    .select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(inArray(users.id, authorIds));

  const coverIds = rows.map((row) => row.coverMediaId).filter((value): value is string => !!value);
  const coverRows =
    coverIds.length > 0
      ? await db.select({ id: media.id, storageKey: media.storageKey, externalUrl: media.externalUrl }).from(media).where(inArray(media.id, coverIds))
      : [];

  const fieldRows = await db
    .select({
      contentId: fieldValues.contentId,
      key: fieldValues.fieldKey,
      label: fieldDefinitions.label,
      valueText: fieldValues.valueText,
      valueNumber: fieldValues.valueNumber,
      valueBool: fieldValues.valueBool,
      valueJson: fieldValues.valueJson,
      sortOrder: fieldDefinitions.sortOrder,
    })
    .from(fieldValues)
    .innerJoin(fieldDefinitions, eq(fieldDefinitions.key, fieldValues.fieldKey))
    .where(inArray(fieldValues.contentId, ids));

  const authorMap = new Map(authorRows.map((row) => [row.id, row]));
  const coverMap = new Map(coverRows.map((row) => [row.id, row.externalUrl ?? `/media/${row.storageKey}`]));

  for (const row of rows) {
    result.set(row.id, {
      row,
      terms: termRows
        .filter((term) => term.contentId === row.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(({ contentId: _contentId, sortOrder: _sortOrder, ...rest }) => rest),
      author: authorMap.get(row.authorId) ?? null,
      coverUrl: row.coverMediaId ? (coverMap.get(row.coverMediaId) ?? null) : null,
      fields: fieldRows
        .filter((field) => field.contentId === row.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((field) => ({
          key: field.key,
          label: field.label,
          value:
            field.valueText ??
            (field.valueNumber !== null ? String(field.valueNumber) : field.valueBool !== null ? String(field.valueBool) : (field.valueJson ?? "")),
        })),
    });
  }

  return result;
}

export function contentPublicUrl(row: ContentRow): string {
  return contentPath(row.type, row.slug);
}


async function allocateId(): Promise<string> {
  const { newId } = await import("./id");
  return newId("cnt");
}

async function allocateRevisionId(): Promise<string> {
  const { newId } = await import("./id");
  return newId("rev");
}

/** 已删除内容不计入 slug 占用；用于保存前的唯一性检查。 */
export async function slugTaken(db: Db, slug: string, excludeId?: string): Promise<boolean> {
  const [row] = await db
    .select({ id: contents.id })
    .from(contents)
    .where(and(eq(contents.slug, slug), isNull(contents.deletedAt)))
    .limit(1);
  if (!row) return false;
  return excludeId ? row.id !== excludeId : true;
}
