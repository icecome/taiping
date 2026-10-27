/**
 * 内置插件：copyright（文末版权声明）
 *
 * 用 filter 追加固定结构，正文 HTML 本身不被改写。
 * 这比"让主题各自加一遍"更可靠：换主题不会掉版权声明。
 */
import type { PluginManifest } from "../lib/hooks";
import { escapeHtml } from "../lib/markdown";

export const copyrightPlugin: PluginManifest = {
  key: "copyright",
  name: "文末版权声明",
  version: "1.0.0",
  description: "在文章正文末尾追加署名与原文链接，页面、动态不追加。",
  author: "太平",
  defaultEnabled: true,
  settings: [
    { key: "template", label: "声明文案", type: "textarea", default: "本文作者：{author}，原文地址：{url}。转载请注明出处。", help: "可用占位符：{author} {title} {url} {year}" },
    { key: "applyTo", label: "适用内容类型", type: "string-list", default: ["post"], help: "每行一个内容类型 key。" },
  ],
  hooks: {
    filters: {
      "content.renderHtml": (payload, ctx) => {
        const settings = ctx.config.plugins.copyright ?? {};
        const applyTo = Array.isArray(settings.applyTo) && settings.applyTo.length > 0 ? (settings.applyTo as string[]) : ["post"];
        if (!applyTo.includes(payload.content.type)) return payload;

        const template = String(settings.template ?? "本文作者：{author}，原文地址：{url}。");
        const base = ctx.config.site.siteUrl ?? "";
        const url = payload.content.url.startsWith("http") ? payload.content.url : `${String(base).replace(/\/$/, "")}${payload.content.url}`;
        const body = template
          .replace(/\{author\}/g, esc(payload.content.authorName ?? ""))
          .replace(/\{title\}/g, esc(payload.content.title))
          .replace(/\{url\}/g, `<a href="${esc(url)}" rel="canonical">${esc(url)}</a>`)
          .replace(/\{year\}/g, String(new Date().getFullYear()));

        return {
          ...payload,
          html: `${payload.html}\n<aside class="post-copyright">${body}</aside>`,
        };
      },
    },
  },
};

function esc(value: string): string {
  return escapeHtml(value);
}
