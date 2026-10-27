/**
 * 内容类型注册表（单一真值）
 *
 * 服务端用它决定表型字段的合法值、前台路由前缀、后台表单形态；
 * 后台用它渲染内容类型切换。新增一个内容类型 = 这里加一条 + 主题里加可选模板。
 */
export interface ContentTypeDefinition {
  key: string;
  label: string;
  /** 单数/复数路由前缀，前台用于 /{prefix}/{slug}。 */
  route: string;
  /** 后台列表的默认排序字段。 */
  defaultOrder: "published_at" | "created_at" | "title";
  supports: {
    terms: boolean;
    comments: boolean;
    cover: boolean;
    excerpt: boolean;
    seo: boolean;
    password: boolean;
    revisions: boolean;
    scheduling: boolean;
  };
  /** 路由中是否占用一级路径（page 用 /{slug}，post 用 /post/{slug}）。 */
  slugAtRoot: boolean;
}

export const CONTENT_TYPES: ContentTypeDefinition[] = [
  {
    key: "post",
    label: "文章",
    route: "post",
    defaultOrder: "published_at",
    supports: {
      terms: true,
      comments: true,
      cover: true,
      excerpt: true,
      seo: true,
      password: true,
      revisions: true,
      scheduling: true,
    },
    slugAtRoot: false,
  },
  {
    key: "page",
    label: "页面",
    route: "page",
    defaultOrder: "title",
    supports: {
      terms: false,
      comments: false,
      cover: false,
      excerpt: false,
      seo: true,
      password: true,
      revisions: true,
      scheduling: false,
    },
    slugAtRoot: true,
  },
  {
    key: "moment",
    label: "动态",
    route: "moment",
    defaultOrder: "published_at",
    supports: {
      terms: true,
      comments: true,
      cover: false,
      excerpt: false,
      seo: false,
      password: false,
      revisions: false,
      scheduling: true,
    },
    slugAtRoot: false,
  },
  {
    key: "project",
    label: "项目",
    route: "project",
    defaultOrder: "created_at",
    supports: {
      terms: true,
      comments: false,
      cover: true,
      excerpt: true,
      seo: false,
      password: false,
      revisions: false,
      scheduling: false,
    },
    slugAtRoot: false,
  },
];

export type ContentTypeKey = "post" | "page" | "moment" | "project";

export const CONTENT_TYPE_KEYS = CONTENT_TYPES.map((t) => t.key) as string[];

export function getContentType(key: string): ContentTypeDefinition | undefined {
  return CONTENT_TYPES.find((t) => t.key === key);
}

export const CONTENT_STATUSES = [
  { key: "draft", label: "草稿", tone: "neutral" },
  { key: "pending", label: "待审核", tone: "warn" },
  { key: "scheduled", label: "定时发布", tone: "info" },
  { key: "published", label: "已发布", tone: "ok" },
  { key: "trashed", label: "回收站", tone: "danger" },
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number]["key"];

export const CONTENT_VISIBILITIES = [
  { key: "public", label: "公开" },
  { key: "private", label: "私有（仅登录可见）" },
  { key: "password", label: "密码保护" },
] as const;

export type ContentVisibility = (typeof CONTENT_VISIBILITIES)[number]["key"];

/** 分类法类型：分类树、标签、系列。 */
export const TERM_TYPES = [
  { key: "category", label: "分类", hierarchical: true, multiple: false },
  { key: "tag", label: "标签", hierarchical: false, multiple: true },
  { key: "series", label: "系列", hierarchical: false, multiple: true },
] as const;

export type TermTypeKey = (typeof TERM_TYPES)[number]["key"];

export const COMMENT_STATUSES = [
  { key: "pending", label: "待审核" },
  { key: "approved", label: "已通过" },
  { key: "spam", label: "垃圾评论" },
  { key: "trashed", label: "回收站" },
] as const;

export type CommentStatus = (typeof COMMENT_STATUSES)[number]["key"];

/** 自定义字段类型。value 落到 field_values 的哪一列由这里决定。 */
export const FIELD_TYPES = [
  { key: "text", label: "单行文本", column: "value_text" },
  { key: "textarea", label: "多行文本", column: "value_text" },
  { key: "markdown", label: "Markdown", column: "value_text" },
  { key: "number", label: "数字", column: "value_number" },
  { key: "boolean", label: "开关", column: "value_bool" },
  { key: "date", label: "日期", column: "value_text" },
  { key: "select", label: "下拉选择", column: "value_text" },
  { key: "url", label: "链接", column: "value_text" },
  { key: "json", label: "JSON", column: "value_json" },
] as const;

export type FieldTypeKey = (typeof FIELD_TYPES)[number]["key"];
