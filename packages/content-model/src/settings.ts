import { z } from 'zod'
import { isSafeNavUrl } from './url'

/** 越界数值钳制到 [min,max]，非法值回落 fallback，避免历史脏数据导致 parse 抛错 */
function clampInt(min: number, max: number, fallback: number) {
  return z.preprocess((val) => {
    const n = typeof val === 'number' ? val : Number(val)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, Math.round(n)))
  }, z.number().int().min(min).max(max))
}

const navLinkSchema = z.object({
  name: z.string(),
  url: z.string().refine(isSafeNavUrl, '链接仅支持站内路径、http/https 或 mailto'),
})

export const mediaStorageConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  source: z.enum(['github', 'external']).default('github'),
  githubOwner: z.string().default(''),
  githubRepo: z.string().default(''),
  githubBranch: z.string().default('main'),
  pathPrefix: z.string().default('uploads'),
  cdnProvider: z.enum(['jsdmirror', 'github_raw', 'custom']).default('jsdmirror'),
  cdnTemplate: z.string().default(''),
  quality: clampInt(10, 100, 80).default(80),
  renameTemplate: z.string().default('{Y}{m}{d}-{str-6}'),
  duplicateStrategy: z.enum(['skip', 'overwrite']).default('skip'),
})
export type MediaStorageConfig = z.infer<typeof mediaStorageConfigSchema>

export const siteSettingsSchema = z.object({
  title: z.string().min(1).default('三无亦拾吾'),
  subtitle: z.string().default('若有情，天去碧霄远，人无事，静卧性空眠'),
  description: z.string().default('三无，无住无心无求......；亦，也；拾，捡起，收拾，整理；吾，我。'),
  author: z.string().default('徐宋柏'),
  url: z.string().url().or(z.literal('')).default(''),
  navigation: z.array(navLinkSchema).default([
    { name: '匪吾', url: '/' },
    { name: '归档', url: '/archives' },
    { name: '说说', url: '/moments' },
    { name: '留言', url: '/guestbook' },
    { name: '底片', url: '/pages/about' },
  ]),
  social: z.array(navLinkSchema).default([
    { name: 'GitHub', url: 'https://github.com/icecome' },
    { name: 'Email', url: 'mailto:lice@lice.com' },
    { name: 'RSS', url: '/rss.xml' },
  ]),
  postsPerPage: clampInt(1, 50, 10).default(10),
  guestbookEnabled: z.boolean().default(true),
  archiveGroupBy: z.enum(['year', 'month']).default('year'),
  sidebarPosition: z.enum(['right', 'left']).default('right'),
  momentsTitle: z.string().default('风絮'),
  momentsSignature: z.string().default('本朝百年无事，天下四时皆春'),
  icp: z.string().default(''),
  footer: z.string().default('谅我愚鲁怜我直'),
  /** 评论审核（对齐 Typecho 讨论设置） */
  commentsRequireModeration: z.boolean().default(true),
  commentsWhitelist: z.boolean().default(true),
  commentsCheckReferer: z.boolean().default(false),
  commentsPostInterval: clampInt(0, 3600, 60).default(60),
  commentsStopWords: z.string().default(''),
  commentsIpBlackList: z.string().default(''),
  /**
   * 多图床配置：设置页负责「添加/编辑/列表」；
   * 图床页只负责「启用」其中一条（activeMediaConfigId）。
   */
  mediaConfigs: z.array(mediaStorageConfigSchema).default([]),
  activeMediaConfigId: z.string().default(''),
  analytics: z
    .object({
      umamiWebsiteId: z.string().optional(),
      umamiSrc: z.string().optional(),
      tallyFormId: z.string().optional(),
    })
    .default({}),
})
export type SiteSettings = z.infer<typeof siteSettingsSchema>

export function createMediaConfig(partial: Partial<MediaStorageConfig> = {}): MediaStorageConfig {
  return mediaStorageConfigSchema.parse({
    id: partial.id || `mc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: partial.name || '新图床',
    ...partial,
  })
}

/** 取当前启用的图床配置；未启用则返回 null */
export function getActiveMediaConfig(settings: SiteSettings): MediaStorageConfig | null {
  const id = settings.activeMediaConfigId
  if (!id) return settings.mediaConfigs[0] ?? null
  return settings.mediaConfigs.find((c) => c.id === id) ?? settings.mediaConfigs[0] ?? null
}

export type SettingControl =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'

export type SettingGroup =
  | 'basic'
  | 'reading'
  | 'comments'
  | 'appearance'
  | 'media'

export interface SettingFieldMeta {
  name: string
  label: string
  group: SettingGroup
  control: SettingControl
  placeholder?: string
  description?: string
  options?: Array<{ value: string; label: string }>
}

export const settingGroupLabels: Record<SettingGroup, string> = {
  basic: '基础',
  reading: '阅读',
  comments: '评论',
  appearance: '外观',
  media: '图床',
}

/** 设置表单字段声明：图床分组使用专用「配置列表」UI，不在 schema 里展开字段 */
export const settingFields: SettingFieldMeta[] = [
  { name: 'title', label: '站点标题', group: 'basic', control: 'text' },
  { name: 'subtitle', label: '副标题', group: 'basic', control: 'text' },
  { name: 'description', label: '描述', group: 'basic', control: 'textarea' },
  { name: 'author', label: '作者', group: 'basic', control: 'text' },
  { name: 'url', label: '站点 URL', group: 'basic', control: 'text', placeholder: 'https://' },
  { name: 'footer', label: '页脚文案', group: 'basic', control: 'text' },
  { name: 'icp', label: '备案号', group: 'basic', control: 'text' },
  {
    name: 'postsPerPage',
    label: '每页文章数',
    group: 'reading',
    control: 'number',
  },
  {
    name: 'archiveGroupBy',
    label: '归档分组',
    group: 'reading',
    control: 'select',
    options: [
      { value: 'year', label: '按年' },
      { value: 'month', label: '按月' },
    ],
  },
  { name: 'momentsTitle', label: '说说页标题', group: 'reading', control: 'text' },
  { name: 'momentsSignature', label: '说说页签名', group: 'reading', control: 'text' },
  { name: 'guestbookEnabled', label: '启用留言板', group: 'comments', control: 'boolean' },
  {
    name: 'commentsRequireModeration',
    label: '全评论强制审核',
    group: 'comments',
    control: 'boolean',
    description: '开启后所有留言默认 pending，需后台通过',
  },
  {
    name: 'commentsWhitelist',
    label: '白名单免审',
    group: 'comments',
    control: 'boolean',
    description: '曾通过审核的访客昵称/邮箱再次留言可自动通过',
  },
  {
    name: 'commentsCheckReferer',
    label: '校验 Referer',
    group: 'comments',
    control: 'boolean',
    description: '仅允许来自本站页面的评论请求',
  },
  {
    name: 'commentsPostInterval',
    label: '同 IP 间隔（秒）',
    group: 'comments',
    control: 'number',
    description: '0 表示不限制',
  },
  {
    name: 'commentsStopWords',
    label: '停用词',
    group: 'comments',
    control: 'textarea',
    description: '一行一词；命中则标记为垃圾',
  },
  {
    name: 'commentsIpBlackList',
    label: 'IP 黑名单',
    group: 'comments',
    control: 'textarea',
    description: '一行一个 IP；命中则拒绝提交',
  },
  {
    name: 'sidebarPosition',
    label: '侧栏位置',
    group: 'appearance',
    control: 'select',
    options: [
      { value: 'right', label: '右侧' },
      { value: 'left', label: '左侧' },
    ],
  },
]

export const settingsKeySchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
})
export type SettingsRow = z.infer<typeof settingsKeySchema>

export const defaultSettings: SiteSettings = siteSettingsSchema.parse({})

/**
 * 读取侧宽松解析：整包失败时逐字段回落默认值，避免单条脏数据导致全站 500。
 * 写入侧仍建议使用 siteSettingsSchema.parse/safeParse 做完整校验。
 */
export function parseSiteSettings(input: unknown): SiteSettings {
  const result = siteSettingsSchema.safeParse(input)
  if (result.success) return result.data

  const recovered: Record<string, unknown> = { ...defaultSettings }
  if (input && typeof input === 'object') {
    const src = input as Record<string, unknown>
    for (const key of Object.keys(defaultSettings) as Array<keyof SiteSettings>) {
      if (!(key in src)) continue
      const single = siteSettingsSchema.safeParse({ ...defaultSettings, [key]: src[key] })
      if (single.success) {
        recovered[key] = single.data[key]
      }
    }
  }
  return siteSettingsSchema.parse(recovered)
}

/** 图床配置项字段（设置页列表表单使用） */
export const mediaConfigFields: Array<{
  name: keyof MediaStorageConfig
  label: string
  control: 'text' | 'number' | 'select'
  options?: Array<{ value: string; label: string }>
  placeholder?: string
  description?: string
}> = [
  { name: 'name', label: '配置名称', control: 'text' },
  {
    name: 'source',
    label: '渠道',
    control: 'select',
    options: [
      { value: 'github', label: 'GitHub' },
      { value: 'external', label: '仅外链' },
    ],
  },
  { name: 'githubOwner', label: 'Owner', control: 'text' },
  { name: 'githubRepo', label: '仓库', control: 'text' },
  { name: 'githubBranch', label: '分支', control: 'text' },
  { name: 'pathPrefix', label: '目录前缀', control: 'text' },
  {
    name: 'cdnProvider',
    label: 'CDN',
    control: 'select',
    options: [
      { value: 'jsdmirror', label: 'jsMirror' },
      { value: 'github_raw', label: 'GitHub Raw' },
      { value: 'custom', label: '自定义模板' },
    ],
  },
  {
    name: 'cdnTemplate',
    label: 'CDN 模板',
    control: 'text',
    description: '{owner} {repo} {branch} {path}',
  },
  { name: 'quality', label: '压缩质量', control: 'number' },
  { name: 'renameTemplate', label: '重命名模板', control: 'text' },
  {
    name: 'duplicateStrategy',
    label: '同名策略',
    control: 'select',
    options: [
      { value: 'skip', label: '跳过' },
      { value: 'overwrite', label: '覆盖' },
    ],
  },
]
