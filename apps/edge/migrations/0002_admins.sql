-- 管理员账号表
-- 口令以 PBKDF2 哈希存储（格式与 posts.encrypt_password_hash 一致），
-- 不再依赖环境变量明文；环境变量仅用于首次播种（见 services/auth.ts）。

CREATE TABLE IF NOT EXISTS admins (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
