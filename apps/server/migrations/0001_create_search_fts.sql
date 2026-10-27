-- 全文搜索虚表（FTS5）
--
-- 为什么手写而不由 drizzle-kit 生成：`CREATE VIRTUAL TABLE` 无法用 drizzle 的 schema DSL
-- 表达，因此单独占一个自定义迁移位。这条已登记在 drizzle journal 里，
-- 后续 generate 会从 0002 继续，不会与之冲突。
--
-- 分词说明：写入与查询两侧都在应用层用 Intl.Segmenter 预切词（见 lib/search.ts），
-- 落到这里的文本已经是空格分隔的 token，所以 unicode61 足够；
-- remove_diacritics 让英文关键词忽略重音差异。
-- content_id / content_type / slug 不参与检索，标 UNINDEXED 减少索引体积。

CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
  content_id UNINDEXED,
  content_type UNINDEXED,
  slug UNINDEXED,
  title,
  excerpt,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);
