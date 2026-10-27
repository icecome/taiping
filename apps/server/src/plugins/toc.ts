/**
 * 内置插件：toc（自动目录）
 *
 * 演示 filter 钩子的典型用法：只加 HTML，不改数据、不改主题。
 * 主题如果自己渲染了目录（theme.supports.toc === true），这个插件就是冗余的，
 * 所以它默认关闭，由后台「插件」页自行启用。
 */
import type { PluginManifest } from "../lib/hooks";
import { escapeHtml } from "../lib/markdown";

function buildToc(headings: { depth: number; text: string; id: string }[]): string {
  const usable = headings.filter((heading) => heading.depth >= 2 && heading.depth <= 4);
  if (usable.length < 3) return "";
  const items = usable
    .map(
      (heading) =>
        `<li class="toc-item toc-d${heading.depth}"><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a></li>`,
    )
    .join("");
  return `<nav class="toc" aria-label="文章目录"><p class="toc-title">目录</p><ol class="toc-list">${items}</ol></nav>`;
}

export const tocPlugin: PluginManifest = {
  key: "toc",
  name: "自动目录",
  version: "1.0.0",
  description: "根据正文标题自动生成目录，插在正文开头；标题少于 3 个时不显示。",
  author: "太平",
  defaultEnabled: false,
  settings: [
    { key: "minHeadings", label: "最少标题数", type: "number", default: 3, min: 1, max: 20, help: "少于该数量不生成目录。" },
    { key: "position", label: "插入位置", type: "select", default: "top", options: [{ value: "top", label: "正文开头" }, { value: "bottom", label: "正文结尾" }] },
  ],
  hooks: {
    filters: {
      "content.renderHtml": (payload, ctx) => {
        const settings = ctx.config.plugins.toc ?? {};
        const minHeadings = Number(settings.minHeadings ?? 3);
        const usable = payload.headings.filter((heading) => heading.depth >= 2 && heading.depth <= 4);
        if (usable.length < minHeadings) return payload;
        const toc = buildToc(usable);
        if (!toc) return payload;
        const position = settings.position === "bottom" ? "bottom" : "top";
        return {
          ...payload,
          html: position === "top" ? `${toc}\n${payload.html}` : `${payload.html}\n${toc}`,
        };
      },
    },
  },
};
