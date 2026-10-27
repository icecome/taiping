import { describe, expect, it } from "vitest";
import { buildMatchQuery, segmentText } from "./search";

describe("segmentText", () => {
  it("中文按词切分并用空格连接", () => {
    expect(segmentText("博客系统")).toContain(" ");
  });

  it("英文小写化", () => {
    expect(segmentText("Cloudflare Workers")).toBe("cloudflare workers");
  });

  it("过滤标点与空白", () => {
    expect(segmentText("你好，世界！")).not.toMatch(/[，！]/);
  });

  it("空输入返回空串", () => {
    expect(segmentText("")).toBe("");
    expect(segmentText("   ")).toBe("");
  });
});

describe("buildMatchQuery", () => {
  it("单词被双引号包裹", () => {
    expect(buildMatchQuery("hello")).toBe('"hello"');
  });

  it("多词用 AND 连接", () => {
    const query = buildMatchQuery("cloudflare workers");
    expect(query).toBe('"cloudflare" AND "workers"');
  });

  it("空查询返回空串（避免非法 MATCH 语法）", () => {
    expect(buildMatchQuery("")).toBe("");
    expect(buildMatchQuery("!!!")).toBe("");
  });

  it("引号被转义，不会打断 MATCH 表达式", () => {
    const query = buildMatchQuery('say "hi"');
    expect(query).not.toContain('""hi""');
    expect(query.startsWith('"')).toBe(true);
  });
});
