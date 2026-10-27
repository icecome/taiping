import { describe, expect, it } from "vitest";
import { isPubliclyVisible, paginated, parsePagination, toIso } from "./response";

describe("parsePagination", () => {
  it("缺省为第 1 页 20 条", () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 20, offset: 0 });
  });

  it("计算 offset", () => {
    expect(parsePagination({ page: "3", pageSize: "10" }).offset).toBe(20);
  });

  it("pageSize 有上限，防止一次拉全表", () => {
    expect(parsePagination({ pageSize: "9999" }).pageSize).toBe(100);
  });

  it("非法值回落到默认值", () => {
    expect(parsePagination({ page: "-1", pageSize: "abc" })).toEqual({ page: 1, pageSize: 20, offset: 0 });
    expect(parsePagination({ page: "0" }).page).toBe(1);
  });
});

describe("paginated", () => {
  it("计算总页数", () => {
    const result = paginated([1, 2], 45, 2, 20);
    expect(result.meta).toEqual({ page: 2, pageSize: 20, total: 45, totalPages: 3 });
  });

  it("空结果的总页数至少为 1", () => {
    expect(paginated([], 0, 1, 20).meta.totalPages).toBe(1);
  });
});

describe("isPubliclyVisible", () => {
  it("非发布状态一律不可见", () => {
    expect(isPubliclyVisible("draft", null)).toBe(false);
    expect(isPubliclyVisible("pending", new Date())).toBe(false);
    expect(isPubliclyVisible("trashed", new Date())).toBe(false);
  });

  it("已发布且发布时间已到才可见", () => {
    expect(isPubliclyVisible("published", new Date(Date.now() - 1000))).toBe(true);
    expect(isPubliclyVisible("published", new Date(Date.now() + 60_000))).toBe(false);
    expect(isPubliclyVisible("published", null)).toBe(true);
  });
});

describe("toIso", () => {
  it("null 与 undefined 输出 null", () => {
    expect(toIso(null)).toBeNull();
    expect(toIso(undefined)).toBeNull();
  });

  it("Date 转 ISO 字符串", () => {
    const date = new Date("2026-01-02T03:04:05.000Z");
    expect(toIso(date)).toBe("2026-01-02T03:04:05.000Z");
  });
});
