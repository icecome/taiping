-- 太平 Tai-Ping 初始表结构（对齐 Typecho 七表骨架 + Halo 索引字段）

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'author',
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'post',
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  password TEXT,
  author_id INTEGER NOT NULL DEFAULT 0,
  template TEXT,
  allow_comment INTEGER NOT NULL DEFAULT 1,
  allow_feed INTEGER NOT NULL DEFAULT 1,
  comments_num INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  order_num INTEGER NOT NULL DEFAULT 0,
  parent INTEGER NOT NULL DEFAULT 0,
  cover TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  reading_time TEXT NOT NULL DEFAULT '',
  visible TEXT NOT NULL DEFAULT 'public',
  deleted INTEGER NOT NULL DEFAULT 0,
  archive_year TEXT NOT NULL DEFAULT '',
  archive_month TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status, deleted, published_at);
CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(type, status);
CREATE INDEX IF NOT EXISTS idx_posts_archive ON posts(archive_year, archive_month);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL DEFAULT 0,
  parent INTEGER NOT NULL DEFAULT 0,
  target_type TEXT NOT NULL DEFAULT 'post',
  target_id TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  mail TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  agent TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'waiting',
  is_featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, status);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, status);

CREATE TABLE IF NOT EXISTS metas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  order_num INTEGER NOT NULL DEFAULT 0,
  parent INTEGER NOT NULL DEFAULT 0,
  UNIQUE(type, slug)
);

CREATE TABLE IF NOT EXISTS relationships (
  post_id INTEGER NOT NULL,
  meta_id INTEGER NOT NULL,
  PRIMARY KEY(post_id, meta_id)
);

CREATE TABLE IF NOT EXISTS fields (
  post_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'str',
  str_value TEXT,
  int_value INTEGER DEFAULT 0,
  float_value REAL DEFAULT 0,
  json_value TEXT,
  PRIMARY KEY(post_id, name)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'site',
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS moments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  pictures TEXT NOT NULL DEFAULT '[]',
  video_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  link_text TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
