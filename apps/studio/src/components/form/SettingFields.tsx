import type { ReactNode } from 'react'
import {
  settingFields,
  settingGroupLabels,
  type SettingFieldMeta,
  type SettingGroup,
  type SiteSettings,
} from '@taiping/content-model/settings'

function FieldShell({
  field,
  span2,
  children,
  hideLabel,
}: {
  field: SettingFieldMeta
  span2?: boolean
  children: ReactNode
  hideLabel?: boolean
}) {
  return (
    <div
      className={`setting-field ${
        span2 || field.control === 'textarea' || field.control === 'boolean' ? 'span-2' : ''
      }`}
    >
      {hideLabel ? null : <div className="setting-field-label">{field.label}</div>}
      {children}
      {field.description && field.control !== 'boolean' ? (
        <div className="setting-field-desc">{field.description}</div>
      ) : null}
    </div>
  )
}

export function SchemaField({
  field,
  value,
  onChange,
}: {
  field: SettingFieldMeta
  value: unknown
  onChange: (value: unknown) => void
}) {
  if (field.control === 'boolean') {
    return (
      <FieldShell field={field} span2 hideLabel>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="text-sm font-medium text-foreground">{field.label}</span>
        </label>
        {field.description ? (
          <div className="setting-field-desc">{field.description}</div>
        ) : null}
      </FieldShell>
    )
  }

  if (field.control === 'select') {
    return (
      <FieldShell field={field}>
        <select
          className="input-base"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </FieldShell>
    )
  }

  if (field.control === 'number') {
    return (
      <FieldShell field={field}>
        <input
          type="number"
          className="input-base"
          value={Number(value ?? 0)}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
      </FieldShell>
    )
  }

  if (field.control === 'textarea') {
    return (
      <FieldShell field={field} span2>
        <textarea
          className="input-base min-h-[80px]"
          placeholder={field.placeholder}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      </FieldShell>
    )
  }

  return (
    <FieldShell field={field}>
      <input
        className="input-base"
        placeholder={field.placeholder}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  )
}

export function SettingGroupFields({
  group,
  form,
  onChange,
}: {
  group: SettingGroup
  form: SiteSettings
  onChange: (name: keyof SiteSettings, value: unknown) => void
}) {
  const fields = settingFields.filter((f) => f.group === group)
  return (
    <div className="setting-field-grid text-sm">
      {fields.map((field) => {
        const key = field.name as keyof SiteSettings
        return (
          <SchemaField
            key={String(field.name)}
            field={field}
            value={form[key]}
            onChange={(v) => onChange(key, v)}
          />
        )
      })}
    </div>
  )
}

export { settingGroupLabels }
