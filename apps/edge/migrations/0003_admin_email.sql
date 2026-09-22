-- 管理员恢复邮箱
-- 用于忘记口令时接收重置链接；可为空（为空则无法自助重置）

ALTER TABLE admins ADD COLUMN email TEXT DEFAULT '';
