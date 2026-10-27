/**
 * 站点设置的字段定义（单一真值）
 *
 * 后台「系统设置」页由这份数组直接生成表单，服务端用同一份定义做默认值与类型归一。
 * 加一个设置项 = 这里加一行，不需要改表单代码，也不需要改数据库。
 */
export type SettingFieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "color"
  | "url"
  | "string-list";

export interface SettingField {
  key: string;
  label: string;
  type: SettingFieldType;
  group: SettingGroupKey;
  default: string | number | boolean | string[];
  help?: string;
  /** select 类型的候选值。 */
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  /** 仅 owner / admin 可见可改。 */
  sensitive?: boolean;
}

export const SETTING_GROUPS = [
  { key: "general", label: "基础信息", description: "站点标题、描述、页脚与备案信息" },
  { key: "writing", label: "内容与发布", description: "内容默认值、分页、回收站策略" },
  { key: "comment", label: "评论", description: "审核策略、频率限制、嵌套层级" },
  { key: "media", label: "媒体", description: "上传限制与存储驱动" },
  { key: "seo", label: "搜索引擎", description: "默认分享图、robots、sitemap" },
  { key: "security", label: "安全", description: "会话时长、密码策略、登录限制" },
  { key: "performance", label: "性能", description: "页面缓存与派生任务" },
] as const;

export type SettingGroupKey = (typeof SETTING_GROUPS)[number]["key"];

export const SETTING_FIELDS: SettingField[] = [
  // general
  { key: "siteTitle", label: "站点标题", type: "text", group: "general", default: "太平" },
  {
    key: "siteDescription",
    label: "站点描述",
    type: "textarea",
    group: "general",
    default: "运行在 Cloudflare Workers 上的博客。",
    help: "用于首页 meta description 与 RSS 频道描述。",
  },
  { key: "siteLogo", label: "站点 Logo", type: "url", group: "general", default: "" },
  { key: "siteFavicon", label: "站点图标", type: "url", group: "general", default: "/favicon.svg" },
  {
    key: "siteLanguage",
    label: "站点语言",
    type: "select",
    group: "general",
    default: "zh-CN",
    options: [
      { value: "zh-CN", label: "简体中文" },
      { value: "zh-TW", label: "繁體中文" },
      { value: "en-US", label: "English" },
    ],
  },
  { key: "siteTimezone", label: "时区", type: "text", group: "general", default: "Asia/Shanghai" },
  {
    key: "footerText",
    label: "页脚文案",
    type: "text",
    group: "general",
    default: "",
    help: "留空则显示站点标题与年份。",
  },
  { key: "icpNumber", label: "ICP 备案号", type: "text", group: "general", default: "" },
  { key: "policeNumber", label: "公安备案号", type: "text", group: "general", default: "" },
  { key: "copyright", label: "版权声明", type: "text", group: "general", default: "" },
  {
    key: "socialLinks",
    label: "社交链接",
    type: "string-list",
    group: "general",
    default: [],
    help: "每行一个，格式 名称|链接，例如 GitHub|https://github.com/you。",
  },

  // writing
  {
    key: "postsPerPage",
    label: "文章列表每页条数",
    type: "number",
    group: "writing",
    default: 10,
    min: 1,
    max: 100,
  },
  { key: "excerptLength", label: "摘要截断长度（字符）", type: "number", group: "writing", default: 160, min: 40, max: 600 },
  {
    key: "defaultCommentStatus",
    label: "新评论默认状态",
    type: "select",
    group: "writing",
    default: "pending",
    options: [
      { value: "approved", label: "直接通过" },
      { value: "pending", label: "待审核" },
    ],
  },
  {
    key: "trashRetentionDays",
    label: "回收站保留天数",
    type: "number",
    group: "writing",
    default: 30,
    min: 0,
    max: 365,
    help: "定时任务会物理删除超期内容；0 表示永不自动清理。",
  },
  { key: "readingMinutesBase", label: "阅读速度（字/分钟）", type: "number", group: "writing", default: 400, min: 100, max: 2000 },
  { key: "showReadingTime", label: "前台显示阅读时长", type: "boolean", group: "writing", default: true },

  // comment
  { key: "commentsEnabled", label: "启用评论", type: "boolean", group: "comment", default: true },
  { key: "commentRequireEmail", label: "评论必填邮箱", type: "boolean", group: "comment", default: true },
  { key: "commentMaxDepth", label: "最大嵌套层级", type: "number", group: "comment", default: 3, min: 1, max: 5 },
  {
    key: "commentRateLimitPerHour",
    label: "每 IP 每小时评论上限",
    type: "number",
    group: "comment",
    default: 10,
    min: 1,
    max: 200,
  },
  {
    key: "commentModerationWords",
    label: "评论敏感词",
    type: "string-list",
    group: "comment",
    default: [],
    help: "命中即直接进入待审核，不做拒绝。",
  },

  // media
  { key: "maxUploadSizeMb", label: "单文件上限（MB）", type: "number", group: "media", default: 8, min: 1, max: 100 },
  {
    key: "mediaDriver",
    label: "存储驱动",
    type: "select",
    group: "media",
    default: "r2",
    options: [
      { value: "r2", label: "Cloudflare R2" },
      { value: "external", label: "外部对象存储" },
    ],
  },
  {
    key: "mediaExternalBaseUrl",
    label: "外部存储访问前缀",
    type: "url",
    group: "media",
    default: "",
    help: "驱动选 external 时必填，形如 https://cdn.example.com。",
  },
  {
    key: "allowedUploadTypes",
    label: "允许的上传类型",
    type: "string-list",
    group: "media",
    default: ["image/", "audio/", "video/", "application/pdf"],
    help: "按 MIME 前缀匹配。",
  },

  // seo
  { key: "seoDefaultImage", label: "默认分享图", type: "url", group: "seo", default: "" },
  { key: "seoTwitterHandle", label: "X / Twitter 账号", type: "text", group: "seo", default: "" },
  {
    key: "seoRobots",
    label: "robots 策略",
    type: "select",
    group: "seo",
    default: "index,follow",
    options: [
      { value: "index,follow", label: "允许收录" },
      { value: "noindex,follow", label: "不收录，跟随链接" },
      { value: "noindex,nofollow", label: "完全不收录" },
    ],
  },
  { key: "seoSitemapEnabled", label: "生成 sitemap.xml", type: "boolean", group: "seo", default: true },
  { key: "seoFeedEnabled", label: "生成 RSS / Atom", type: "boolean", group: "seo", default: true },
  { key: "seoFeedLimit", label: "订阅源条目数", type: "number", group: "seo", default: 20, min: 1, max: 100 },

  // security
  { key: "sessionTtlDays", label: "登录有效期（天）", type: "number", group: "security", default: 14, min: 1, max: 90 },
  { key: "passwordMinLength", label: "密码最小长度", type: "number", group: "security", default: 10, min: 8, max: 64 },
  {
    key: "loginMaxAttempts",
    label: "登录失败锁定阈值",
    type: "number",
    group: "security",
    default: 8,
    min: 3,
    max: 50,
  },
  {
    key: "loginLockMinutes",
    label: "锁定时长（分钟）",
    type: "number",
    group: "security",
    default: 15,
    min: 1,
    max: 1440,
  },
  {
    key: "allowRegistration",
    label: "开放前台注册",
    type: "boolean",
    group: "security",
    default: false,
    help: "注册用户只有 subscriber 角色，仅能评论。",
  },

  // performance
  { key: "pageCacheEnabled", label: "启用页面缓存", type: "boolean", group: "performance", default: true },
  {
    key: "pageCacheTtlSeconds",
    label: "页面缓存时长（秒）",
    type: "number",
    group: "performance",
    default: 300,
    min: 0,
    max: 86400,
  },
  { key: "tasksEnabled", label: "启用定时任务", type: "boolean", group: "performance", default: true },
] as const;

export type SiteSettingKey = (typeof SETTING_FIELDS)[number]["key"];

export const SETTING_FIELD_MAP: Record<string, SettingField> = Object.fromEntries(
  SETTING_FIELDS.map((f) => [f.key, f]),
);

/** 全部设置项的默认值对象，键为去掉 `site.` 前缀的短名。 */
export function defaultSiteSettings(): Record<string, string | number | boolean | string[]> {
  const out: Record<string, string | number | boolean | string[]> = {};
  for (const field of SETTING_FIELDS) {
    out[field.key] = Array.isArray(field.default) ? [...field.default] : field.default;
  }
  return out;
}
