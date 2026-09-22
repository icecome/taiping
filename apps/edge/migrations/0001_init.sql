-- taiping_blog D1 schema (v1)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('post', 'page')),
  title TEXT NOT NULL,
  content_md TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  excerpt TEXT,
  cover TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TEXT,
  reading_time TEXT,
  template TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  encrypt INTEGER NOT NULL DEFAULT 0,
  encrypt_password_hash TEXT,
  encrypt_hint TEXT,
  encrypt_title TEXT,
  encrypt_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_status_published ON posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_type_slug ON posts(type, slug);

CREATE TABLE IF NOT EXISTS moments (
  id TEXT PRIMARY KEY,
  content_md TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  pictures TEXT NOT NULL DEFAULT '[]',
  video_url TEXT,
  link_url TEXT,
  link_text TEXT,
  author TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  tag_names TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_moments_status_created ON moments(status, created_at DESC);

CREATE TABLE IF NOT EXISTS terms (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('category', 'tag')),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  UNIQUE (type, slug)
);

CREATE TABLE IF NOT EXISTS post_terms (
  post_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  PRIMARY KEY (post_id, term_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_terms_term ON post_terms(term_id);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('guestbook', 'post', 'moment')),
  target_id TEXT NOT NULL,
  parent_id TEXT,
  nickname TEXT NOT NULL,
  email TEXT,
  website TEXT,
  content_md TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'spam')),
  is_featured INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, status);
CREATE INDEX IF NOT EXISTS idx_comments_status_created ON comments(status, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL,
  url TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mirror_queue (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mirror_status_created ON mirror_queue(status, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  trusted INTEGER NOT NULL DEFAULT 0,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- 渲染缓存版本号（无 KV 时也可记录，便于后续接入）
CREATE TABLE IF NOT EXISTS cache_versions (
  key TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO cache_versions (key, version, updated_at)
VALUES ('content', 1, datetime('now')), ('index', 1, datetime('now')), ('config', 1, datetime('now'));
