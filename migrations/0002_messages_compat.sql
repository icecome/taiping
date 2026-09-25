-- 0002: 兼容 blog-comment 的留言/回复表（结构对齐 blog-comment migrations 0001-0005）
-- 用于留言板与文章页评论的统一存储，并支持历史库导入

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_name    TEXT NOT NULL,
  visitor_email   TEXT DEFAULT '',
  visitor_website TEXT DEFAULT '',
  visitor_ip      TEXT NOT NULL DEFAULT '',
  user_agent      TEXT DEFAULT '',
  client_hash     TEXT DEFAULT '',
  content         TEXT NOT NULL,
  quoted_text     TEXT DEFAULT '',
  page_url        TEXT NOT NULL,
  page_title      TEXT NOT NULL DEFAULT '',
  status          TEXT DEFAULT 'pending'
                  CHECK(status IN ('pending','approved','featured','spam')),
  is_deleted      INTEGER DEFAULT 0 CHECK(is_deleted IN (0, 1)),
  needs_review    INTEGER DEFAULT 0 CHECK(needs_review IN (0, 1)),
  reply_content   TEXT DEFAULT '',
  reply_at        DATETIME DEFAULT NULL,
  reply_token     TEXT DEFAULT '',
  -- 太平扩展：挂载目标（guestbook / post / page / moment）
  target_type     TEXT NOT NULL DEFAULT 'guestbook',
  target_id       TEXT NOT NULL DEFAULT '',
  parent_id       INTEGER DEFAULT 0,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_page_url ON messages(page_url);
CREATE INDEX IF NOT EXISTS idx_messages_target ON messages(target_type, target_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_page_status_created
  ON messages(page_url, status, created_at DESC);

CREATE TABLE IF NOT EXISTS replies (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id       INTEGER NOT NULL,
  reply_content    TEXT NOT NULL,
  reply_type       TEXT NOT NULL DEFAULT '博主'
                   CHECK(reply_type IN ('博主','邮箱回信')),
  reply_from_email TEXT DEFAULT '',
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES messages(id)
);
CREATE INDEX IF NOT EXISTS idx_replies_message_id ON replies(message_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier      TEXT NOT NULL,
  action_type     TEXT NOT NULL,
  count           INTEGER DEFAULT 1,
  window_start    DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limits_unique
  ON rate_limits(identifier, action_type, window_start);

CREATE TABLE IF NOT EXISTS admin_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id      INTEGER NOT NULL,
  action          TEXT NOT NULL
                  CHECK(action IN ('approve','feature','spam','delete','restore','reply','delete_reply')),
  operator        TEXT DEFAULT 'system',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_logs_message_id ON admin_logs(message_id);

CREATE TABLE IF NOT EXISTS import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
