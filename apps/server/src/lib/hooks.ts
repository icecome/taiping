/**
 * 插件钩子总线（Typecho 语义：filter 改值、call 副作用）
 *
 * 为什么不做动态加载：Workers 里 eval / 动态代码执行受限，从 R2 拉 JS 再执行既不安全
 * 也不可控。参考项目的结论一致（旧设计文档的决策 3、flare-stack-blog 只做 webhook + API Key
 * 这类数据面扩展）。所以插件 = 编译进 Worker 的模块 + 数据库里的启停开关与配置值。
 *
 * 新增一个插件 = plugins/ 下加一个文件 + 在 plugins/index.ts 注册一行，
 * 不改总线、不改调用点。
 */
import type { Db } from "../db/client";
import type { Env } from "../env";
import type { SettingField } from "../shared/settings-schema";
import type { ResolvedSiteConfig } from "./settings";

export interface HookContext {
  env: Env;
  db: Db;
  config: ResolvedSiteConfig;
  request?: Request;
}

export interface ContentHookSubject {
  id: string;
  type: string;
  slug: string;
  title: string;
  url: string;
  authorId: string;
  authorName: string | null;
  publishedAt: Date | null;
}

export interface HeadingRef {
  depth: number;
  text: string;
  id: string;
}

export interface FilterPayloads {
  /** 正文渲染完成后改写 HTML：目录、版权、外链处理都挂在这里。 */
  "content.renderHtml": { html: string; headings: HeadingRef[]; content: ContentHookSubject };
  /** 保存前改写 Markdown 源文。 */
  "content.beforeSave": { body: string; content: Pick<ContentHookSubject, "type" | "title"> };
  /** 页面 <head> 追加内容。 */
  "site.headHtml": { html: string; route: string };
  /** 页面底部追加内容（脚本、统计）。 */
  "site.footerHtml": { html: string; route: string };
  /** 评论入库前改写/检查正文，返回新值即生效。 */
  "comment.beforeCreate": { body: string; authorName: string; contentId: string };
}

export interface CallPayloads {
  "content.afterSave": { content: ContentHookSubject; created: boolean };
  "content.afterPublish": { content: ContentHookSubject };
  "content.afterDelete": { content: ContentHookSubject };
  "comment.afterCreate": {
    commentId: string;
    contentId: string;
    authorName: string;
    body: string;
    /** 入库后的状态，插件据此决定是否提醒。 */
    status: string;
  };
  "app.scheduled": { cron: string; now: Date };
}

export type FilterHookName = keyof FilterPayloads;
export type CallHookName = keyof CallPayloads;

export interface PluginHooks {
  filters?: {
    [K in FilterHookName]?: (
      payload: FilterPayloads[K],
      ctx: HookContext,
    ) => FilterPayloads[K] | Promise<FilterPayloads[K]>;
  };
  calls?: {
    [K in CallHookName]?: (payload: CallPayloads[K], ctx: HookContext) => void | Promise<void>;
  };
}

export type PluginSettingField = Omit<SettingField, "group">;

export interface PluginManifest {
  key: string;
  name: string;
  version: string;
  description: string;
  author: string;
  /** 安装后默认是否启用。 */
  defaultEnabled?: boolean;
  settings?: PluginSettingField[];
  hooks?: PluginHooks;
}

const REGISTRY = new Map<string, PluginManifest>();

export function registerPlugin(manifest: PluginManifest): void {
  if (REGISTRY.has(manifest.key)) {
    throw new Error(`插件 key 重复注册：${manifest.key}`);
  }
  REGISTRY.set(manifest.key, manifest);
}

export function listPluginManifests(): PluginManifest[] {
  return [...REGISTRY.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function getPluginManifest(key: string): PluginManifest | undefined {
  return REGISTRY.get(key);
}

/** 执行 filter 链：按插件 key 排序保证顺序稳定，前一个的输出是后一个的输入。 */
export async function runFilter<K extends FilterHookName>(
  hook: K,
  payload: FilterPayloads[K],
  ctx: HookContext,
  enabledKeys: ReadonlySet<string>,
): Promise<FilterPayloads[K]> {
  let current = payload;
  for (const key of [...enabledKeys].sort()) {
    const handler = REGISTRY.get(key)?.hooks?.filters?.[hook];
    if (!handler) continue;
    try {
      current = await handler(current, ctx);
    } catch (error) {
      // 插件失败不能拖垮页面渲染：记录后继续执行下一个。
      console.error(`[plugin:${key}] filter ${hook} failed`, error);
    }
  }
  return current;
}

export async function runCall<K extends CallHookName>(
  hook: K,
  payload: CallPayloads[K],
  ctx: HookContext,
  enabledKeys: ReadonlySet<string>,
): Promise<void> {
  for (const key of [...enabledKeys].sort()) {
    const handler = REGISTRY.get(key)?.hooks?.calls?.[hook];
    if (!handler) continue;
    try {
      await handler(payload, ctx);
    } catch (error) {
      console.error(`[plugin:${key}] call ${hook} failed`, error);
    }
  }
}

/** 启用的插件 key 集合；KV 缓存 60 秒，与设置缓存同生命周期。 */
export async function getEnabledPluginKeys(env: Env, db: Db): Promise<Set<string>> {
  try {
    const cached = await env.KV.get("plugins:enabled", "json");
    if (Array.isArray(cached)) return new Set(cached as string[]);
  } catch {
    /* 缓存不可用时回落 D1 */
  }
  const { plugins } = await import("../db/schema");
  const rows = await db.select({ key: plugins.key, enabled: plugins.enabled }).from(plugins);
  const keys = rows.filter((row) => row.enabled).map((row) => row.key);
  try {
    await env.KV.put("plugins:enabled", JSON.stringify(keys), { expirationTtl: 60 });
  } catch {
    /* 忽略 */
  }
  return new Set(keys);
}

export async function bumpEnabledPlugins(env: Env): Promise<void> {
  try {
    await env.KV.delete("plugins:enabled");
  } catch {
    /* 忽略 */
  }
}
