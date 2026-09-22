-- 口令重置令牌
-- 仅存储令牌哈希（与口令哈希同理，明文只存在于邮件链接中）；
-- 单次消费 + 过期失效，通过 used_at 标记而非删除，便于审计。

CREATE TABLE IF NOT EXISTS password_resets (
  id          TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL,
  FOREIGN KEY (admin_id) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token
  ON password_resets(token_hash);

CREATE INDEX IF NOT EXISTS idx_password_resets_admin
  ON password_resets(admin_id, created_at DESC);
