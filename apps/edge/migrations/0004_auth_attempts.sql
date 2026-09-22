-- 登录尝试记录
-- 三重用途：IP 维度限流、账号维度锁定、安全审计日志。
-- ip_hash 存哈希而非明文，与 comments.ip_hash 的处理保持一致。

CREATE TABLE IF NOT EXISTS auth_attempts (
  id          TEXT PRIMARY KEY,
  ip_hash     TEXT NOT NULL,
  username    TEXT NOT NULL DEFAULT '',
  success     INTEGER NOT NULL DEFAULT 0 CHECK (success IN (0, 1)),
  created_at  TEXT NOT NULL
);

-- 按 IP 统计近期失败次数
CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_created
  ON auth_attempts(ip_hash, created_at DESC);

-- 按账号统计连续失败次数
CREATE INDEX IF NOT EXISTS idx_auth_attempts_user_created
  ON auth_attempts(username, created_at DESC);
