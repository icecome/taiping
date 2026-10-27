import { describe, expect, it } from "vitest";
import { countWords, deriveExcerpt, escapeHtml, renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("渲染基本 Markdown", () => {
    const result = renderMarkdown("## 标题\n\n正文 **加粗**。");
    expect(result.html).toContain("<h2");
    expect(result.html).toContain("<strong>加粗</strong>");
  });

  it("标题带 id 并进入 headings", () => {
    const result = renderMarkdown("# 一级\n\n## 二级标题\n\n### 三级\n");
    expect(result.html).toContain('id="yi-ji"');
    expect(result.headings.map((heading) => heading.depth)).toEqual([1, 2, 3]);
    expect(result.headings[1]?.text).toBe("二级标题");
  });

  it("重复标题的 id 不冲突", () => {
    const result = renderMarkdown("## 同名\n\n## 同名\n\n## 同名");
    const ids = result.headings.map((heading) => heading.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[1]).toBe(`${ids[0]}-1`);
  });

  it("代码块被高亮并包进带复制按钮的 figure", () => {
    const result = renderMarkdown("```ts\nconst n: number = 1;\n```");
    expect(result.html).toContain('class="md-code"');
    expect(result.html).toContain('data-lang="ts"');
    expect(result.html).toContain("hljs");
    expect(result.html).toContain("data-copy");
  });

  it("未知语言退回纯文本，但内容被转义", () => {
    const result = renderMarkdown("```nosuchlang\n<script>alert(1)</script>\n```");
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("<script>alert(1)</script>");
  });

  it("正文里的原生 HTML 一律被转义（不引入消毒库的前提）", () => {
    const result = renderMarkdown("普通段落\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>");
    expect(result.html).not.toContain("<script>alert(1)</script>");
    expect(result.html).not.toMatch(/<img[^>]*onerror=/);
  });

  it("外链带 target 与 rel", () => {
    const result = renderMarkdown("[外站](https://example.com) 与 [内页](/about)");
    expect(result.html).toContain('target="_blank"');
    expect(result.html).toContain('rel="noopener noreferrer nofollow"');
    expect(result.html).toContain('href="/about"');
    expect(result.html).not.toMatch(/href="\/about"[^>]*target/);
  });

  it("图片带 lazy 与 alt", () => {
    const result = renderMarkdown("![封面](/media/a.png)");
    expect(result.html).toContain('loading="lazy"');
    expect(result.html).toContain('alt="封面"');
  });

  it("表格带对齐与包裹容器", () => {
    const result = renderMarkdown("| a | b |\n| :- | -: |\n| 1 | 2 |");
    expect(result.html).toContain("md-table-wrap");
    expect(result.html).toContain("text-align:left");
    expect(result.html).toContain("text-align:right");
  });

  it("引用块与任务列表可渲染", () => {
    const result = renderMarkdown("> 引用\n\n- [x] 已完成\n- [ ] 未完成");
    expect(result.html).toContain("<blockquote>");
    expect(result.html).toContain('type="checkbox"');
  });

  it("计算字数与阅读时长", () => {
    const result = renderMarkdown("# 标题\n\n" + "中文".repeat(400), 400);
    expect(result.wordCount).toBeGreaterThan(700);
    expect(result.readingMinutes).toBeGreaterThanOrEqual(1);
  });
});

describe("countWords", () => {
  it("中文按字计", () => {
    expect(countWords("太平博客")).toBe(4);
  });

  it("英文按词计", () => {
    expect(countWords("hello world again")).toBe(3);
  });

  it("中英混排累加", () => {
    // 太平(2 字) + 系统(2 字) + CMS(1 词) = 5
    expect(countWords("太平 CMS 系统")).toBe(5);
  });

  it("忽略纯空白", () => {
    expect(countWords("   \n\t ")).toBe(0);
  });
});

describe("deriveExcerpt", () => {
  it("短文本原样返回", () => {
    expect(deriveExcerpt("很短。", 10)).toBe("很短。");
  });

  it("超长文本截断并加省略号", () => {
    const result = deriveExcerpt("一".repeat(50), 10);
    expect(result).toBe(`${"一".repeat(10)}…`);
  });

  it("压缩多余空白", () => {
    expect(deriveExcerpt("a   b\n\nc", 50)).toBe("a b c");
  });
});

describe("escapeHtml", () => {
  it("五个危险字符全覆盖", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});
