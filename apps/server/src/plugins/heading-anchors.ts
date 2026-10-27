/**
 * 内置插件：heading-anchors（标题锚点）
 *
 * 给正文标题加一个可点击的 `#` 锚点，方便引用到某一节。
 * 用正则在已渲染 HTML 上作业是可行的，因为这些 <h2 id="..."> 是 lib/markdown.ts
 * 自己拼出来的固定结构，不会混入用户输入。
 */
import type { PluginManifest } from "../lib/hooks";

export const headingAnchorsPlugin: PluginManifest = {
  key: "heading-anchors",
  name: "标题锚点",
  version: "1.0.0",
  description: "在正文章节标题右侧加一个可复制的锚点链接。",
  author: "太平",
  defaultEnabled: false,
  settings: [
    { key: "symbol", label: "锚点符号", type: "text", default: "#" },
    { key: "maxDepth", label: "最深到几级标题", type: "number", default: 4, min: 2, max: 6 },
  ],
  hooks: {
    filters: {
      "content.renderHtml": (payload, ctx) => {
        const settings = ctx.config.plugins["heading-anchors"] ?? {};
        const symbol = String(settings.symbol ?? "#");
        const maxDepth = Number(settings.maxDepth ?? 4);
        const html = payload.html.replace(
          /<h([2-6]) id="([^"]+)"([^>]*)>([\s\S]*?)<\/h\1>/g,
          (match, depth: string, id: string, attrs: string, inner: string) => {
            if (Number(depth) > maxDepth) return match;
            if (inner.includes("heading-anchor")) return match;
            return `<h${depth} id="${id}"${attrs}>${inner}<a class="heading-anchor" href="#${id}" aria-label="本节链接">${symbol}</a></h${depth}>`;
          },
        );
        return { ...payload, html };
      },
    },
  },
};
