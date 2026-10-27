/**
 * 太平 CMS 数据模型（Cloudflare D1 / SQLite）
 *
 * 约定：
 * 1. 所有主键为 `prefix_` + 16 位 base32 文本，由 lib/id.ts 生成，便于跨表肉眼识别。
 * 2. 所有时间列为 INTEGER，存 unix 毫秒（drizzle mode: "timestamp_ms"），读出即 Date。
 * 3. 逻辑删除统一用 `deleted_at`（NULL 表示未删除），不用布尔列，便于审计与恢复。
 * 4. slug 的唯一约束是"部分唯一索引"（WHERE deleted_at IS NULL），回收站里的内容不占用 slug。
 * 5. 配置按 `key` 前缀分命名空间（site. / theme.<id>. / plugin.<key>.），不额外建 scope 列。
 */
import { sql, relations } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;

/* ------------------------------------------------------------------ 账号与权限 */

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    website: text("website"),
    locale: text("locale").notNull().default("zh-CN"),
    mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
    lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    uniqueIndex("users_username_unique").on(t.username),
  ],
);

export const roles = sqliteTable(
  "roles",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** 系统内置角色不允许删除，权限仍可调整（owner 除外，始终拥有全部权限）。 */
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [uniqueIndex("roles_key_unique").on(t.key)],
);

export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    roleId: text("role_id").notNull(),
    permission: text("permission").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permission] }),
    index("role_permissions_permission_idx").on(t.permission),
  ],
);

export const userRoles = sqliteTable(
  "user_roles",
  {
    userId: text("user_id").notNull(),
    roleId: text("role_id").notNull(),
    /** 角色授予者，用于追溯越权授予。 */
    grantedBy: text("granted_by"),
    grantedAt: integer("granted_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.roleId] }),
    index("user_roles_user_idx").on(t.userId),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** 只存 token 的 SHA-256，库被读走也无法伪造会话。 */
    tokenHash: text("token_hash").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("sessions_token_unique").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    /** 明文 token 只在创建响应里出现一次，这里存前 8 位用于列表辨识。 */
    tokenPrefix: text("token_prefix").notNull(),
    userId: text("user_id").notNull(),
    scopesJson: text("scopes_json").notNull().default("[]"),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [uniqueIndex("api_tokens_hash_unique").on(t.tokenHash)],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id"),
    actorName: text("actor_name"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metaJson: text("meta_json"),
    ip: text("ip"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    index("audit_logs_created_idx").on(t.createdAt),
    index("audit_logs_target_idx").on(t.targetType, t.targetId),
  ],
);

/* ------------------------------------------------------------------ 内容 */

export const contents = sqliteTable(
  "contents",
  {
    id: text("id").primaryKey(),
    /** post | page | moment | project —— 内容模型由 code 层的内容类型注册表定义。 */
    type: text("type").notNull(),
    title: text("title").notNull().default(""),
    slug: text("slug").notNull(),
    excerpt: text("excerpt"),
    bodyMarkdown: text("body_markdown").notNull().default(""),
    /** Markdown 渲染缓存，可随时由 body_markdown 重建。 */
    bodyHtml: text("body_html").notNull().default(""),
    status: text("status", {
      enum: ["draft", "pending", "scheduled", "published", "trashed"],
    })
      .notNull()
      .default("draft"),
    visibility: text("visibility", { enum: ["public", "private", "password"] })
      .notNull()
      .default("public"),
    authorId: text("author_id").notNull(),
    coverMediaId: text("cover_media_id"),
    /** 前台模板选择链的入口，NULL 表示用主题默认模板。 */
    template: text("template"),
    password: text("password"),
    isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
    allowComment: integer("allow_comment", { mode: "boolean" }).notNull().default(true),
    wordCount: integer("word_count").notNull().default(0),
    readingMinutes: integer("reading_minutes").notNull().default(1),
    viewCount: integer("view_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    /** 自定义字段、封面尺寸等扩展数据的落点，避免为了加字段改表结构。 */
    extraJson: text("extra_json").notNull().default("{}"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    seoKeywords: text("seo_keywords"),
    canonicalUrl: text("canonical_url"),
    ogImageUrl: text("og_image_url"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("contents_slug_unique")
      .on(t.slug)
      .where(sql`${t.deletedAt} is null`),
    index("contents_status_published_idx").on(t.status, t.publishedAt),
    index("contents_type_status_idx").on(t.type, t.status),
    index("contents_author_idx").on(t.authorId),
    index("contents_scheduled_idx").on(t.scheduledAt),
  ],
);

export const contentRevisions = sqliteTable(
  "content_revisions",
  {
    id: text("id").primaryKey(),
    contentId: text("content_id").notNull(),
    revisionNo: integer("revision_no").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    bodyMarkdown: text("body_markdown").notNull(),
    status: text("status").notNull(),
    /** 该版本提交时的完整元信息快照（分类、标签、自定义字段）。 */
    metaJson: text("meta_json").notNull().default("{}"),
    note: text("note"),
    authorId: text("author_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("content_revisions_no_unique").on(t.contentId, t.revisionNo),
    index("content_revisions_content_idx").on(t.contentId),
  ],
);

export const terms = sqliteTable(
  "terms",
  {
    id: text("id").primaryKey(),
    /** category | tag | series —— 与内容类型正交，便于后续扩展。 */
    type: text("type").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    parentId: text("parent_id"),
    coverMediaId: text("cover_media_id"),
    /** 冗余计数，由 content_terms 变更时重算，避免列表页 JOIN COUNT。 */
    count: integer("count").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("terms_type_slug_unique").on(t.type, t.slug),
    index("terms_parent_idx").on(t.parentId),
  ],
);

export const contentTerms = sqliteTable(
  "content_terms",
  {
    contentId: text("content_id").notNull(),
    termId: text("term_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.contentId, t.termId] }),
    index("content_terms_term_idx").on(t.termId),
  ],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    contentId: text("content_id").notNull(),
    parentId: text("parent_id"),
    /** 楼层根评论，回复链只查一层。 */
    rootId: text("root_id"),
    depth: integer("depth").notNull().default(0),
    authorUserId: text("author_user_id"),
    authorName: text("author_name").notNull(),
    authorEmail: text("author_email"),
    authorUrl: text("author_url"),
    /** 纯文本，渲染时转义 —— 见 docs/adr/0002。 */
    body: text("body").notNull(),
    status: text("status", { enum: ["pending", "approved", "spam", "trashed"] })
      .notNull()
      .default("pending"),
    isOwner: integer("is_owner", { mode: "boolean" }).notNull().default(false),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    index("comments_content_idx").on(t.contentId, t.status),
    index("comments_status_created_idx").on(t.status, t.createdAt),
    index("comments_root_idx").on(t.rootId),
  ],
);

/* ------------------------------------------------------------------ 媒体 */

export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    /** 存储层的对象键，同一 key 复用同一文件（按内容哈希去重）。 */
    storageKey: text("storage_key").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    checksum: text("checksum").notNull(),
    altText: text("alt_text"),
    caption: text("caption"),
    folder: text("folder").notNull().default("/"),
    driver: text("driver", { enum: ["r2", "external"] }).notNull().default("r2"),
    externalUrl: text("external_url"),
    uploaderId: text("uploader_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("media_storage_key_unique").on(t.storageKey),
    index("media_folder_idx").on(t.folder, t.createdAt),
    index("media_checksum_idx").on(t.checksum),
  ],
);

/* ------------------------------------------------------------------ 站点配置与呈现 */

export const settings = sqliteTable(
  "settings",
  {
    /** site.title / theme.default.primaryColor / plugin.code-copy.enabled 这类命名空间键。 */
    key: text("key").primaryKey(),
    valueJson: text("value_json").notNull(),
    updatedBy: text("updated_by"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("settings_prefix_idx").on(t.key)],
);

export const navItems = sqliteTable(
  "nav_items",
  {
    id: text("id").primaryKey(),
    location: text("location", { enum: ["header", "footer", "sidebar"] })
      .notNull()
      .default("header"),
    label: text("label").notNull(),
    href: text("href").notNull(),
    parentId: text("parent_id"),
    target: text("target", { enum: ["_self", "_blank"] }).notNull().default("_self"),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("nav_items_location_idx").on(t.location, t.sortOrder)],
);

export const fieldDefinitions = sqliteTable(
  "field_definitions",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    fieldType: text("field_type").notNull(),
    optionsJson: text("options_json").notNull().default("[]"),
    defaultValueJson: text("default_value_json"),
    /** 适用的内容类型数组，["*"] 表示全部。 */
    appliesToJson: text("applies_to_json").notNull().default("[\"*\"]"),
    isRequired: integer("is_required", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [uniqueIndex("field_definitions_key_unique").on(t.key)],
);

export const fieldValues = sqliteTable(
  "field_values",
  {
    contentId: text("content_id").notNull(),
    fieldKey: text("field_key").notNull(),
    valueText: text("value_text"),
    valueNumber: integer("value_number"),
    valueBool: integer("value_bool", { mode: "boolean" }),
    valueJson: text("value_json"),
  },
  (t) => [
    primaryKey({ columns: [t.contentId, t.fieldKey] }),
    index("field_values_key_idx").on(t.fieldKey),
  ],
);

/* ------------------------------------------------------------------ 扩展与后台任务 */

export const plugins = sqliteTable(
  "plugins",
  {
    key: text("key").primaryKey(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    description: text("description"),
    author: text("author"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    settingsJson: text("settings_json").notNull().default("{}"),
    installedAt: integer("installed_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    runAt: integer("run_at", { mode: "timestamp_ms" }).notNull().default(now),
    status: text("status", { enum: ["pending", "running", "done", "failed"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("tasks_status_run_idx").on(t.status, t.runAt)],
);

/** 定时发布与浏览量落库的幂等去重锁。 */
export const locks = sqliteTable("locks", {
  key: text("key").primaryKey(),
  holder: text("holder").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export const redirects = sqliteTable(
  "redirects",
  {
    id: text("id").primaryKey(),
    fromPath: text("from_path").notNull(),
    toPath: text("to_path").notNull(),
    statusCode: integer("status_code").notNull().default(301),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [uniqueIndex("redirects_from_unique").on(t.fromPath)],
);

/* ------------------------------------------------------------------ 关系声明 */

export const usersRelations = relations(users, ({ many }) => ({
  roles: many(userRoles),
  sessions: many(sessions),
  contents: many(contents),
}));

export const contentsRelations = relations(contents, ({ one, many }) => ({
  author: one(users, { fields: [contents.authorId], references: [users.id] }),
  revisions: many(contentRevisions),
  terms: many(contentTerms),
  comments: many(comments),
}));

export const termsRelations = relations(terms, ({ one, many }) => ({
  parent: one(terms, { fields: [terms.parentId], references: [terms.id], relationName: "termTree" }),
  contents: many(contentTerms),
}));

export const contentTermsRelations = relations(contentTerms, ({ one }) => ({
  content: one(contents, { fields: [contentTerms.contentId], references: [contents.id] }),
  term: one(terms, { fields: [contentTerms.termId], references: [terms.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  content: one(contents, { fields: [comments.contentId], references: [contents.id] }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: "commentTree",
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type Content = typeof contents.$inferSelect;
export type NewContent = typeof contents.$inferInsert;
export type Term = typeof terms.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Media = typeof media.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type NavItem = typeof navItems.$inferSelect;
export type FieldDefinition = typeof fieldDefinitions.$inferSelect;
export type FieldValue = typeof fieldValues.$inferSelect;
export type PluginRecord = typeof plugins.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Session = typeof sessions.$inferSelect;
