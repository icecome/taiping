/**
 * 与服务端 `apps/server/src/api/*.ts` 的 zod schema 一一对应的响应类型。
 *
 * 刻意手写而不是从服务端 import：后台只依赖 HTTP 契约，不依赖服务端模块图，
 * 服务端重构内部函数时不会连带打爆前端构建。字段名以 zod schema 为准。
 */

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}

/* ---------------------------------------------------------------- 认证 */

export interface Me {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  roles: string[];
  permissions: string[];
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
}

export interface LoginSessionInfo {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

/* ---------------------------------------------------------------- 仪表盘 */

export interface DashboardCounts {
  contents: number;
  published: number;
  drafts: number;
  pending: number;
  scheduled: number;
  trashed: number;
  comments: number;
  pendingComments: number;
  media: number;
  users: number;
  terms: number;
  plugins: number;
}

export interface DashboardRecentContent {
  id: string;
  type: string;
  title: string;
  slug: string;
  status: string;
  updatedAt: string;
  authorName: string | null;
}

export interface DashboardRecentComment {
  id: string;
  contentId: string;
  contentTitle: string;
  authorName: string;
  body: string;
  status: string;
  createdAt: string;
}

export interface DashboardTopContent {
  id: string;
  title: string;
  viewCount: number;
  commentCount: number;
}

export interface DashboardTrendPoint {
  date: string;
  count: number;
}

export interface DashboardData {
  counts: DashboardCounts;
  recentContents: DashboardRecentContent[];
  recentComments: DashboardRecentComment[];
  topContents: DashboardTopContent[];
  publishTrend: DashboardTrendPoint[];
  system: {
    environment: string;
    requestId: string;
    database: string;
    storage: string;
    version: string;
  };
}

/* ---------------------------------------------------------------- 内容 */

export interface ContentTermRef {
  id: string;
  type: string;
  name: string;
  slug: string;
}

export interface ContentSummary {
  id: string;
  type: string;
  title: string;
  slug: string;
  excerpt: string | null;
  status: string;
  visibility: string;
  authorId: string;
  authorName: string | null;
  coverUrl: string | null;
  isPinned: boolean;
  allowComment: boolean;
  wordCount: number;
  readingMinutes: number;
  viewCount: number;
  commentCount: number;
  publishedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  terms: ContentTermRef[];
}

export interface ContentFieldValue {
  key: string;
  label: string;
  value: string;
}

export interface ContentDetail extends ContentSummary {
  bodyMarkdown: string;
  bodyHtml: string;
  template: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  canonicalUrl: string | null;
  ogImageUrl: string | null;
  coverMediaId: string | null;
  extra: Record<string, unknown>;
  fields: ContentFieldValue[];
  hasPassword: boolean;
  revisionCount: number;
}

export interface ContentRevision {
  id: string;
  revisionNo: number;
  title: string;
  status: string;
  note: string | null;
  authorId: string;
  createdAt: string;
  bodyLength: number;
}

/** 新建/更新内容的请求体，字段名与服务端 ContentBody 一致。 */
export interface ContentWriteBody {
  type: string;
  title: string;
  slug?: string;
  excerpt?: string | null;
  bodyMarkdown: string;
  visibility?: string;
  template?: string | null;
  password?: string | null;
  isPinned?: boolean;
  allowComment?: boolean;
  coverMediaId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  canonicalUrl?: string | null;
  ogImageUrl?: string | null;
  scheduledAt?: string | null;
  termIds?: string[];
  fields?: Record<string, unknown>;
  changeNote?: string;
}

export interface BulkResult {
  succeeded: string[];
  failed: { id: string; reason: string }[];
}

/* ---------------------------------------------------------------- 分类标签 */

export interface TermNode {
  id: string;
  type: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  coverMediaId: string | null;
  count: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  children: TermNode[];
}

/* ---------------------------------------------------------------- 评论 */

export interface CommentItem {
  id: string;
  contentId: string;
  contentTitle: string | null;
  contentSlug: string | null;
  parentId: string | null;
  rootId: string | null;
  depth: number;
  authorUserId: string | null;
  authorName: string;
  authorEmail: string | null;
  authorUrl: string | null;
  body: string;
  status: string;
  isOwner: boolean;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommentStats {
  pending: number;
  approved: number;
  spam: number;
  trashed: number;
  total: number;
}

/* ---------------------------------------------------------------- 媒体 */

export interface MediaItem {
  id: string;
  filename: string;
  storageKey: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  caption: string | null;
  folder: string;
  driver: "r2" | "external";
  url: string;
  createdAt: string;
  uploaderId: string;
}

/** 上传接口比列表多一个去重标记。 */
export type MediaUploadResult = MediaItem & { deduplicated: boolean };

/* ---------------------------------------------------------------- 用户与角色 */

export interface UserItem {
  id: string;
  email: string;
  username: string;
  displayName: string;
  status: string;
  bio: string | null;
  avatarUrl: string | null;
  website: string | null;
  locale: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: string[];
  contentCount: number;
}

export interface UserSession {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface RoleItem {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  sortOrder: number;
  permissions: string[];
  userCount: number;
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
}

export interface PermissionGroup {
  group: string;
  label: string;
  permissions: PermissionDefinition[];
}

/* ---------------------------------------------------------------- 内容模型 */

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldItem {
  id: string;
  key: string;
  label: string;
  description: string | null;
  fieldType: string;
  options: FieldOption[];
  defaultValue: unknown;
  appliesTo: string[];
  isRequired: boolean;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ---------------------------------------------------------------- 导航 */

export interface NavItem {
  id: string;
  location: "header" | "footer" | "sidebar";
  label: string;
  href: string;
  parentId: string | null;
  target: "_self" | "_blank";
  icon: string | null;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  children: NavItem[];
}

/* ---------------------------------------------------------------- 插件 */

export interface PluginSettingFieldDef {
  key: string;
  label: string;
  type: string;
  default: string | number | boolean | string[];
  help?: string;
  options?: FieldOption[];
  min?: number;
  max?: number;
  sensitive?: boolean;
}

export interface PluginEntry {
  key: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  installed: boolean;
  hasManifest: boolean;
  settings: Record<string, unknown>;
  settingsSchema: PluginSettingFieldDef[];
}

/* ---------------------------------------------------------------- 设置与主题 */

export interface SettingFieldDef {
  key: string;
  label: string;
  type: string;
  /** 站点字段有 group；主题与插件字段没有（它们只有一层）。 */
  group?: string;
  default: string | number | boolean | string[];
  help?: string;
  options?: FieldOption[];
  min?: number;
  max?: number;
  sensitive?: boolean;
}

export interface SettingGroupDef {
  group: string;
  label: string;
  description: string;
  fields: SettingFieldDef[];
}

export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  supports: {
    darkMode: boolean;
    toc: boolean;
    sidebar: boolean;
    comments: boolean;
    moments: boolean;
    projects: boolean;
  };
  settings: SettingFieldDef[];
  styles: string;
  scripts?: string;
}

export interface SettingsOverview {
  site: Record<string, unknown>;
  siteSchema: SettingGroupDef[];
  theme: {
    active: string;
    values: Record<string, unknown>;
    schema: SettingFieldDef[];
    themes: ThemeManifest[];
  };
}

/* ---------------------------------------------------------------- 审计 */

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}
