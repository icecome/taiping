/**
 * 全文搜索（D1 FTS5）。
 *
 * 为什么不用 LIKE：LIKE '%关键词%' 在 D1 上无法走索引，和 LuyBlog 的问题一样
 * （它一次拉 5 张表进内存再 includes 过滤）。这里用 FTS5 虚表 + 写入时预分词。
 *
 * 中文分词的取舍：FTS5 的 unicode61 分词器把连续汉字当成一个 token，
 * 导致"博客系统"搜不到"博客"。解决办法是在写入与查询两侧都用 Intl.Segmenter
 * 预切词，把"博客系统"变成"博客 系统"，索引与查询口径一致即可命中。
 * 这也是 flare-stack-blog 在同一问题上的做法（ADR 0023）。
 */
import { eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import type { Env } from "../env";
import { contents } from "../db/schema";

const segmenter = new Intl.Segmenter("zh-Hans", { granularity: "word" });

export function segmentText(input: string): string {
  if (!input) return "";
  const out: string[] = [];
  for (const part of segmenter.segment(input)) {
    if (!part.isWordLike) continue;
    const token = part.segment.trim().toLowerCase();
    if (token) out.push(token);
  }
  return out.join(" ");
}

/** 查询串同样分词，并用双引号包裹每个词，避免 MATCH 语法被特殊字符打断。 */
export function buildMatchQuery(query: string): string {
  const tokens = segmentText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(" AND ");
}

export async function refreshSearchIndex(env: Env, db: Db, contentId: string): Promise<void> {
  const [row] = await db
    .select({
      id: contents.id,
      title: contents.title,
      excerpt: contents.excerpt,
      bodyHtml: contents.bodyHtml,
      status: contents.status,
      type: contents.type,
      slug: contents.slug,
    })
    .from(contents)
    .where(eq(contents.id, contentId))
    .limit(1);

  if (!row || row.status !== "published") {
    await removeFromSearchIndex(db, contentId);
    return;
  }

  const plain = row.bodyHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const title = segmentText(row.title);
  const excerpt = segmentText(row.excerpt ?? "");
  const body = segmentText(plain).slice(0, 20_000);

  await db.run(sql`delete from content_fts where content_id = ${contentId}`);
  await db.run(
    sql`insert into content_fts (content_id, content_type, slug, title, excerpt, body)
        values (${row.id}, ${row.type}, ${row.slug}, ${title}, ${excerpt}, ${body})`,
  );
}

export async function removeFromSearchIndex(db: Db, contentId: string): Promise<void> {
  await db.run(sql`delete from content_fts where content_id = ${contentId}`);
}

export interface SearchHit {
  contentId: string;
  title: string;
  slug: string;
  type: string;
  excerpt: string;
  rank: number;
}

export async function searchIndex(db: Db, query: string, limit = 20): Promise<SearchHit[]> {
  const match = buildMatchQuery(query);
  if (!match) return [];
  try {
    const rows = await db.all<{
      content_id: string;
      title: string;
      slug: string;
      content_type: string;
      excerpt: string;
      rank: number;
    }>(sql`select content_id, title, slug, content_type, excerpt, bm25(content_fts) as rank
           from content_fts
           where content_fts match ${match}
           order by rank
           limit ${limit}`);
    return rows.map((row) => ({
      contentId: row.content_id,
      title: row.title,
      slug: row.slug,
      type: row.content_type,
      excerpt: row.excerpt,
      rank: row.rank,
    }));
  } catch (error) {
    console.error("[search] fts query failed", error);
    return [];
  }
}

/** 搜索入口：先查 FTS，再回表拿完整内容字段，保证结果只包含当前对匿名可见的内容。 */
export async function searchPublished(db: Db, query: string, limit = 20) {
  const hits = await searchIndex(db, query, limit * 2);
  if (hits.length === 0) return [];
  const ids = hits.map((hit) => hit.contentId);

  const rows = await db
    .select({
      id: contents.id,
      type: contents.type,
      title: contents.title,
      slug: contents.slug,
      excerpt: contents.excerpt,
      publishedAt: contents.publishedAt,
      coverMediaId: contents.coverMediaId,
    })
    .from(contents)
    .where(inArray(contents.id, ids));

  const byId = new Map(rows.map((row) => [row.id, row]));
  const now = Date.now();
  return hits
    .map((hit) => {
      const row = byId.get(hit.contentId);
      if (!row) return null;
      if (row.publishedAt && row.publishedAt.getTime() > now) return null;
      return { ...row, rank: hit.rank };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .slice(0, limit);
}
