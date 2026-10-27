import { describe, expect, it } from "vitest";
import { contentPath, resolveUniqueSlug, slugify, slugifyOrFallback } from "./slug";

describe("slugify", () => {
  it("英文标题转小写连字符", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("中文标题转拼音", () => {
    expect(slugify("太平博客")).toBe("tai-ping-bo-ke");
  });

  it("中英混排保留英文单词", () => {
    const slug = slugify("Cloudflare Workers 上的博客");
    expect(slug.startsWith("cloudflare-workers-")).toBe(true);
    expect(slug).toContain("bo-ke");
  });

  it("去掉标点与多余连字符", () => {
    expect(slugify("Hello, World! -- again")).toBe("hello-world-again");
  });

  it("全角符号不会漏进 slug", () => {
    expect(slugify("太平：一个人的博客（上）")).not.toMatch(/[：（）]/);
  });

  it("超长标题被截断到指定长度，且不以连字符结尾", () => {
    const slug = slugify("a".repeat(200), 20);
    expect(slug.length).toBeLessThanOrEqual(20);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("空输入返回空串", () => {
    expect(slugify("   ")).toBe("");
  });

  it("纯标点走兜底生成非空 slug", () => {
    const slug = slugifyOrFallback("！！！", "post");
    expect(slug.startsWith("post-")).toBe(true);
    expect(slug.length).toBeGreaterThan(5);
  });
});

describe("resolveUniqueSlug", () => {
  it("首次冲突时追加 -2", async () => {
    const taken = new Set(["hello"]);
    const slug = await resolveUniqueSlug("Hello", async (candidate) => taken.has(candidate));
    expect(slug).toBe("hello-2");
  });

  it("连续冲突时递增", async () => {
    const taken = new Set(["a", "a-2", "a-3"]);
    const slug = await resolveUniqueSlug("a", async (candidate) => taken.has(candidate));
    expect(slug).toBe("a-4");
  });

  it("不冲突时原样返回", async () => {
    const slug = await resolveUniqueSlug("全新 标题", async () => false);
    expect(slug).toBe("quan-xin-biao-ti");
  });

  it("候选全部被占用也不会死循环", async () => {
    const slug = await resolveUniqueSlug("x", async () => true);
    expect(slug.startsWith("x-")).toBe(true);
  });
});

describe("contentPath", () => {
  it("页面在根路径，其余带类型前缀", () => {
    expect(contentPath("page", "about")).toBe("/about");
    expect(contentPath("post", "hello")).toBe("/post/hello");
    expect(contentPath("moment", "m1")).toBe("/moment/m1");
  });
});
