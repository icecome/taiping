/**
 * Markdown → HTML 渲染管线（服务端唯一入口）
 *
 * 安全模型（对应 docs/adr/0002）：
 * - 关闭 marked 的原生 HTML 透传，正文里的 `<script>` 会被转义成文本；
 *   因此服务端不需要引入任何依赖 DOM 的消毒库（DOMPurify 在 Workers 里没有 document）。
 * - 唯一的 HTML 出口是渲染器自己拼出来的结构，属性值统一走 escapeAttr。
 * - 评论正文从不走这里，它在模板里直接转义输出。
 */
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import http from "highlight.js/lib/languages/http";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { Marked, type Tokens } from "marked";
import { slugify } from "./slug";

const LANGUAGES: Record<string, Parameters<typeof hljs.registerLanguage>[1]> = {
  bash,
  css,
  diff,
  go,
  http,
  ini,
  java,
  javascript,
  json,
  markdown,
  php,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
};

for (const [name, def] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, def);
}
// 常见别名，写 ```js 也能高亮。
hljs.registerAliases(["js", "jsx", "mjs", "cjs"], { languageName: "javascript" });
hljs.registerAliases(["ts", "tsx"], { languageName: "typescript" });
hljs.registerAliases(["sh", "shell", "zsh", "console"], { languageName: "bash" });
hljs.registerAliases(["html", "vue", "svelte"], { languageName: "xml" });
hljs.registerAliases(["yml"], { languageName: "yaml" });
hljs.registerAliases(["toml"], { languageName: "ini" });
hljs.registerAliases(["md"], { languageName: "markdown" });

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface Heading {
  depth: number;
  text: string;
  id: string;
}

export interface RenderedMarkdown {
  html: string;
  headings: Heading[];
  plainText: string;
  wordCount: number;
  readingMinutes: number;
}

function plainTextOf(html: string): string {
  return html
    .replace(/<pre[\s\S]*?<\/pre>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 字数统计：中日韩按字符计，其他语言按空白分词计。
 * 这样中英混排的文章阅读时长不会一边倒。
 */
export function countWords(text: string): number {
  const cjk = text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff]/g)?.length ?? 0;
  const words = text
    .replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return cjk + words;
}

function slugForHeading(text: string): string {
  // 复用内容 slug 的规则：中文转拼音，保证锚点在 URL 里可读、可复制。
  // 纯符号标题会得到空串，这里回落到 section。
  const base = slugify(text.replace(/[`*_~[\]()#!]/g, ""), 60);
  return base || "section";
}

function renderMarked(markdownSource: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const seen = new Map<string, number>();

  const marked = new Marked({ gfm: true, breaks: false });

  marked.use({
    renderer: {
      // 关闭原生 HTML 透传：marked 默认会把块级与行内 HTML 原样输出，
      // 这里显式转义掉。这是"服务端不需要引入消毒库"的前提（ADR 0002）。
      html(token: Tokens.HTML | Tokens.Tag) {
        return escapeHtml(token.text);
      },
      heading(token: Tokens.Heading) {
        const inlineHtml = this.parser.parseInline(token.tokens);
        let id = slugForHeading(token.text);
        const count = seen.get(id) ?? 0;
        seen.set(id, count + 1);
        if (count > 0) id = `${id}-${count}`;
        headings.push({ depth: token.depth, text: token.text, id });
        return `<h${token.depth} id="${escapeHtml(id)}" class="md-heading md-h${token.depth}">${inlineHtml}</h${token.depth}>\n`;
      },
      code(token: Tokens.Code) {
        const lang = (token.lang ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
        if (lang && hljs.getLanguage(lang)) {
          const highlighted = hljs.highlight(token.text, { language: lang, ignoreIllegals: true }).value;
          return `<figure class="md-code" data-lang="${escapeHtml(lang)}"><figcaption><span>${escapeHtml(lang)}</span><button type="button" class="md-copy" data-copy aria-label="复制代码">复制</button></figcaption><pre><code class="hljs language-${escapeHtml(lang)}">${highlighted}</code></pre></figure>\n`;
        }
        return `<figure class="md-code" data-lang="text"><figcaption><span>text</span><button type="button" class="md-copy" data-copy aria-label="复制代码">复制</button></figcaption><pre><code class="hljs">${escapeHtml(token.text)}</code></pre></figure>\n`;
      },
      link(token: Tokens.Link) {
        const inner = this.parser.parseInline(token.tokens);
        const href = token.href ?? "#";
        const external = /^https?:\/\//i.test(href);
        const rel = external ? ' target="_blank" rel="noopener noreferrer nofollow"' : "";
        return `<a href="${escapeHtml(href)}"${rel}>${inner}</a>`;
      },
      image(token: Tokens.Image) {
        const alt = escapeHtml(token.text ?? "");
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
        return `<img src="${escapeHtml(token.href ?? "")}" alt="${alt}"${title} loading="lazy" decoding="async" class="md-image">`;
      },
      table(token: Tokens.Table) {
        const header = token.header
          .map((cell, index) => {
            const align = token.align[index];
            const style = align ? ` style="text-align:${align}"` : "";
            return `<th${style}>${this.parser.parseInline(cell.tokens)}</th>`;
          })
          .join("");
        const rows = token.rows
          .map(
            (row) =>
              `<tr>${row
                .map((cell, index) => {
                  const align = token.align[index];
                  const style = align ? ` style="text-align:${align}"` : "";
                  return `<td${style}>${this.parser.parseInline(cell.tokens)}</td>`;
                })
                .join("")}</tr>`,
          )
          .join("");
        return `<div class="md-table-wrap"><table class="md-table"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
    },
  });

  const html = marked.parse(markdownSource, { async: false }) as string;
  return { html, headings };
}

export function renderMarkdown(markdownSource: string, wordsPerMinute = 400): RenderedMarkdown {
  const { html, headings } = renderMarked(markdownSource ?? "");
  const plainText = plainTextOf(html);
  const wordCount = countWords(plainText);
  const readingMinutes = Math.max(1, Math.round(wordCount / Math.max(1, wordsPerMinute)));
  return { html, headings, plainText, wordCount, readingMinutes };
}

/** 摘要：优先用显式 excerpt，否则从正文纯文本截断。 */
export function deriveExcerpt(plainText: string, length: number): string {
  const clean = plainText.replace(/\s+/g, " ").trim();
  if (clean.length <= length) return clean;
  return `${clean.slice(0, length)}…`;
}
