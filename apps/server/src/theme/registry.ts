/**
 * 主题注册表。
 *
 * 新增主题 = 在 theme/ 下建目录并导出 Theme 对象 + 在下面的 THEMES 里加一行，
 * 不改渲染层、不改数据层、不改路由。
 */
import type { Theme, ThemeManifest, ThemeSettingField } from "./types";
import { defaultTheme } from "./default";
import { paperTheme } from "./paper";

const THEMES: Theme[] = [defaultTheme, paperTheme];

export function listThemes(): Theme[] {
  return THEMES;
}

export function listThemeManifests(): ThemeManifest[] {
  return THEMES.map((theme) => theme.manifest);
}

/** 取主题；id 不存在时回落列表第一个，保证站点永远有主题可用。 */
export function resolveTheme(id: string | undefined): Theme {
  if (id) {
    const found = THEMES.find((theme) => theme.manifest.id === id);
    if (found) return found;
  }
  return THEMES[0]!;
}

export function themeSettingDefaults(theme: Theme): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of theme.manifest.settings) {
    out[field.key] = Array.isArray(field.default) ? [...field.default] : field.default;
  }
  return out;
}

/** 查主题设置字段定义，供后台表单与模板取值共用。 */
export function themeSettingField(themeId: string, key: string): ThemeSettingField | undefined {
  return resolveTheme(themeId).manifest.settings.find((field) => field.key === key);
}
