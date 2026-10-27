/**
 * 自定义字段表单（内容编辑页右栏）。
 *
 * 字段定义来自 `GET /api/fields?type=<内容类型>&enabledOnly=true`，
 * 这里不硬编码任何字段：类型决定控件，`options` 决定候选项，`isRequired` 决定星号。
 *
 * 表单内部统一用字符串保存，提交时才按字段类型还原成 number / boolean ——
 * 这样受控输入不会被"空字符串"和"0"之间的转换绊住。
 */
import { Field, Input, Select, Switch, Textarea } from "@/components/ui";
import type { FieldItem } from "@/lib/types";

export type CustomFieldValues = Record<string, string>;

function jsonError(value: string): string | null {
  if (!value.trim()) return null;
  try {
    JSON.parse(value);
    return null;
  } catch {
    return "不是合法的 JSON";
  }
}

export function CustomFieldsForm({
  definitions,
  values,
  errors,
  disabled,
  onChange,
}: {
  definitions: FieldItem[];
  values: CustomFieldValues;
  errors?: Record<string, string>;
  disabled?: boolean;
  onChange: (key: string, value: string) => void;
}) {
  if (definitions.length === 0) {
    return <p className="text-xs text-subtle">当前内容类型没有启用任何自定义字段。</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {definitions.map((definition) => {
        const value = values[definition.key] ?? "";
        const error = errors?.[definition.key] ?? (definition.fieldType === "json" ? jsonError(value) ?? undefined : undefined);

        switch (definition.fieldType) {
          case "boolean":
            return (
              <div key={definition.id} className="flex flex-col gap-1">
                <Switch
                  checked={value === "true"}
                  disabled={disabled}
                  onChange={(next) => onChange(definition.key, next ? "true" : "false")}
                  label={definition.label}
                />
                {definition.description ? (
                  <p className="text-xs text-subtle">{definition.description}</p>
                ) : null}
              </div>
            );

          case "textarea":
          case "markdown":
            return (
              <Field key={definition.id} label={definition.label} hint={definition.description} error={error}>
                <Textarea
                  disabled={disabled}
                  rows={definition.fieldType === "markdown" ? 6 : 3}
                  value={value}
                  onChange={(event) => onChange(definition.key, event.target.value)}
                  className={definition.fieldType === "markdown" ? "font-mono" : undefined}
                />
              </Field>
            );

          case "number":
            return (
              <Field key={definition.id} label={definition.label} hint={definition.description} error={error}>
                <Input
                  type="number"
                  disabled={disabled}
                  value={value}
                  onChange={(event) => onChange(definition.key, event.target.value)}
                />
              </Field>
            );

          case "date":
            return (
              <Field key={definition.id} label={definition.label} hint={definition.description} error={error}>
                <Input
                  type="date"
                  disabled={disabled}
                  value={value}
                  onChange={(event) => onChange(definition.key, event.target.value)}
                />
              </Field>
            );

          case "select":
            return (
              <Field key={definition.id} label={definition.label} hint={definition.description} error={error}>
                <Select
                  disabled={disabled}
                  value={value}
                  onChange={(event) => onChange(definition.key, event.target.value)}
                >
                  <option value="">未选择</option>
                  {definition.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            );

          case "json":
            return (
              <Field key={definition.id} label={definition.label} hint={definition.description ?? "合法 JSON，例如 {\"a\": 1}"} error={error}>
                <Textarea
                  disabled={disabled}
                  rows={4}
                  value={value}
                  onChange={(event) => onChange(definition.key, event.target.value)}
                  className="font-mono"
                />
              </Field>
            );

          case "url":
            return (
              <Field key={definition.id} label={definition.label} hint={definition.description} error={error}>
                <Input
                  type="url"
                  disabled={disabled}
                  value={value}
                  placeholder="https://"
                  onChange={(event) => onChange(definition.key, event.target.value)}
                />
              </Field>
            );

          default:
            return (
              <Field key={definition.id} label={definition.label} hint={definition.description} error={error}>
                <Input
                  disabled={disabled}
                  value={value}
                  onChange={(event) => onChange(definition.key, event.target.value)}
                />
              </Field>
            );
        }
      })}
    </div>
  );
}

/** 表单内的字符串值 → 接口需要的真实类型（与服务端 syncContentFields 的落列规则一致）。 */export function serializeCustomFields(
  definitions: FieldItem[],
  values: CustomFieldValues,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const definition of definitions) {
    const raw = values[definition.key];
    if (raw === undefined || raw === "") continue;
    switch (definition.fieldType) {
      case "number": {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) out[definition.key] = parsed;
        break;
      }
      case "boolean":
        out[definition.key] = raw === "true";
        break;
      default:
        out[definition.key] = raw;
    }
  }
  return out;
}
