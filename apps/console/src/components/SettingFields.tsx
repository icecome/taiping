/**
 * 设置类表单渲染器（站点设置 / 主题配置 / 插件配置共用）。
 *
 * 输入完全由字段定义驱动：`type` 决定控件，`options` 决定候选值，`min`/`max` 决定边界。
 * 加一个设置项只需要在 shared/settings-schema.ts 加一行，这里不改代码。
 */
import { Input, Field, Select, Switch, Textarea } from "@/components/ui";
import type { SettingFieldDef } from "@/lib/types";

export type SettingValues = Record<string, unknown>;

/** sensitive 字段对非 owner 不可见也不可提交（服务端会直接 403）。 */
export function isFieldVisible(field: SettingFieldDef, isOwner: boolean): boolean {
  return !field.sensitive || isOwner;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join("\n");
  return String(value);
}

export function SettingFieldInput({
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  field: SettingFieldDef;
  value: unknown;
  error?: string;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}) {
  const common = { disabled, "aria-invalid": Boolean(error) };

  switch (field.type) {
    case "boolean":
      return (
        <div className="flex flex-col gap-1">
          <Switch checked={toBoolean(value)} onChange={onChange} disabled={disabled} label={field.label} />
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          {!error && field.help ? <p className="text-xs text-subtle">{field.help}</p> : null}
        </div>
      );

    case "textarea":
    case "string-list":
      return (
        <Field label={field.label} hint={field.help} error={error}>
          <Textarea
            {...common}
            rows={field.type === "string-list" ? 4 : 3}
            value={toStringValue(value)}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.type === "string-list" ? "每行一项" : undefined}
          />
        </Field>
      );

    case "number":
      return (
        <Field label={field.label} hint={field.help} error={error}>
          <Input
            {...common}
            type="number"
            min={field.min}
            max={field.max}
            value={toStringValue(value)}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      );

    case "select":
      return (
        <Field label={field.label} hint={field.help} error={error}>
          <Select {...common} value={toStringValue(value)} onChange={(event) => onChange(event.target.value)}>
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      );

    case "color":
      return (
        <Field label={field.label} hint={field.help} error={error}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              disabled={disabled}
              value={toStringValue(value) || "#b4552d"}
              onChange={(event) => onChange(event.target.value)}
              className="h-8.5 w-10 cursor-pointer rounded-sm border border-line bg-surface p-0.5"
              aria-label={`${field.label}取色`}
            />
            <Input
              {...common}
              value={toStringValue(value)}
              onChange={(event) => onChange(event.target.value)}
              placeholder="#b4552d"
              className="font-mono"
            />
          </div>
        </Field>
      );

    case "url":
      return (
        <Field label={field.label} hint={field.help} error={error}>
          <Input
            {...common}
            type="url"
            value={toStringValue(value)}
            onChange={(event) => onChange(event.target.value)}
            placeholder="https://"
          />
        </Field>
      );

    default:
      return (
        <Field label={field.label} hint={field.help} error={error}>
          <Input {...common} value={toStringValue(value)} onChange={(event) => onChange(event.target.value)} />
        </Field>
      );
  }
}

/** 一组字段的渲染；errorKey 与 SettingFieldInput 的 key 一致（短名，不含 site. 前缀）。 */
export function SettingFieldList({
  fields,
  values,
  errors,
  disabled,
  onChange,
}: {
  fields: SettingFieldDef[];
  values: SettingValues;
  errors?: Record<string, string>;
  disabled?: boolean;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => (
        <SettingFieldInput
          key={field.key}
          field={field}
          value={values[field.key] ?? field.default}
          error={errors?.[field.key]}
          disabled={disabled}
          onChange={(value) => onChange(field.key, value)}
        />
      ))}
    </div>
  );
}
