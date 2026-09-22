-- 评论回复（多轮对话）
-- 覆盖两种来源：博主在后台回复、访客经邮件回信（Resend Inbound）。
-- 与 comments 分表：comments.parent_id 表达「访客对评论的回复」，
-- 而本表表达「博主/访客与作者的对话」，语义不同，混用会产生歧义。

CREATE TABLE IF NOT EXISTS comment_replies (
  id               TEXT PRIMARY KEY,
  comment_id       TEXT NOT NULL,
  content_md       TEXT NOT NULL,
  content_html     TEXT NOT NULL DEFAULT '',
  reply_type       TEXT NOT NULL DEFAULT '博主'
                   CHECK (reply_type IN ('博主', '邮箱回信')),
  reply_from_email TEXT DEFAULT '',
  created_at       TEXT NOT NULL,
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comment_replies_comment
  ON comment_replies(comment_id, created_at);

-- 回信关联：通知邮件的 Reply-To 携带 reply+<token>@<域名>，
-- 入站 webhook 据此反查评论。令牌明文入库（非密钥，仅需不可猜测），
-- 但为支持重置需可读取，故不做哈希。
ALTER TABLE comments ADD COLUMN reply_token TEXT DEFAULT '';
