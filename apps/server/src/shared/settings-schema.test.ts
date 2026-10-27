import { describe, expect, it } from "vitest";
import { SETTING_FIELDS, SETTING_FIELD_MAP, SETTING_GROUPS, defaultSiteSettings } from "./settings-schema";

describe("站点设置字段定义", () => {
  it("字段 key 唯一", () => {
    const keys = SETTING_FIELDS.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("每个字段的分组都存在", () => {
    const groups = new Set(SETTING_GROUPS.map((group) => group.key));
    for (const field of SETTING_FIELDS) {
      expect(groups.has(field.group)).toBe(true);
    }
  });

  it("select 字段必须给出候选值", () => {
    for (const field of SETTING_FIELDS.filter((f) => f.type === "select")) {
      expect(field.options?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("number 字段的默认值落在 min/max 区间内", () => {
    for (const field of SETTING_FIELDS.filter((f) => f.type === "number")) {
      const value = Number(field.default);
      expect(Number.isFinite(value)).toBe(true);
      if (field.min !== undefined) expect(value).toBeGreaterThanOrEqual(field.min);
      if (field.max !== undefined) expect(value).toBeLessThanOrEqual(field.max);
    }
  });

  it("默认值对象与字段定义一一对应，且数组默认值不复用同一引用", () => {
    const defaults = defaultSiteSettings();
    expect(Object.keys(defaults).sort()).toEqual(SETTING_FIELDS.map((field) => field.key).sort());
    const listFields = SETTING_FIELDS.filter((field) => Array.isArray(field.default));
    expect(listFields.length).toBeGreaterThan(0);
    for (const field of listFields) {
      expect(defaults[field.key]).not.toBe(field.default);
    }
  });

  it("SETTING_FIELD_MAP 能按 key 查到定义", () => {
    expect(SETTING_FIELD_MAP.postsPerPage?.type).toBe("number");
    expect(SETTING_FIELD_MAP.unknownKey).toBeUndefined();
  });
});
