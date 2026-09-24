-- Content domain rewrite: revisions + head/release pointers + soft delete
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS post_revisions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  content_md TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  excerpt TEXT,
  cover TEXT,
  reading_time TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_revisions_post ON post_revisions(post_id, created_at DESC);

ALTER TABLE posts ADD COLUMN head_revision_id TEXT;
ALTER TABLE posts ADD COLUMN release_revision_id TEXT;
ALTER TABLE posts ADD COLUMN deleted_at TEXT;

-- Migrate legacy inline content into revisions (no-op on empty DB)
INSERT INTO post_revisions (id, post_id, content_md, content_html, excerpt, cover, reading_time, created_at)
SELECT
  'rev_mig_' || id,
  id,
  COALESCE(content_md, ''),
  COALESCE(content_html, ''),
  excerpt,
  cover,
  reading_time,
  COALESCE(updated_at, created_at, datetime('now'))
FROM posts
WHERE content_md IS NOT NULL OR content_html IS NOT NULL;

UPDATE posts SET head_revision_id = 'rev_mig_' || id
WHERE head_revision_id IS NULL AND EXISTS (
  SELECT 1 FROM post_revisions r WHERE r.id = 'rev_mig_' || posts.id
);

UPDATE posts SET release_revision_id = head_revision_id
WHERE status = 'published' AND deleted_at IS NULL AND release_revision_id IS NULL AND head_revision_id IS NOT NULL;

-- Drop legacy content columns from posts (content lives in post_revisions)
ALTER TABLE posts DROP COLUMN content_md;
ALTER TABLE posts DROP COLUMN content_html;
ALTER TABLE posts DROP COLUMN excerpt;
ALTER TABLE posts DROP COLUMN cover;
ALTER TABLE posts DROP COLUMN reading_time;
