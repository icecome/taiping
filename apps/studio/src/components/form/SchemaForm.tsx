import { lazy, Suspense, useEffect, useState } from 'react'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import type { FieldMeta } from '@taiping/content-model/post'

const OverTypeEditor = lazy(() => import('../editor/OverTypeEditor'))

interface Props<T extends FieldValues = FieldValues> {
  fields: FieldMeta[]
  control: Control<T>
}

export function SchemaForm<T extends FieldValues = FieldValues>({ fields, control }: Props<T>) {
  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <FieldRow key={field.name} field={field} control={control} />
      ))}
    </div>
  )
}

function FieldRow<T extends FieldValues>({
  field,
  control,
}: {
  field: FieldMeta
  control: Control<T>
}) {
  return (
    <Controller
      name={field.name as FieldPath<T>}
      control={control}
      render={({ field: rhfField, fieldState }) => (
        <label className="block text-sm">
          <span className="text-muted-foreground">
            {field.label}
            {field.required ? ' *' : ''}
          </span>
          <div className="mt-1">
            {field.control === 'boolean' ? (
              <input
                type="checkbox"
                checked={Boolean(rhfField.value)}
                onChange={(e) => rhfField.onChange(e.target.checked)}
              />
            ) : field.control === 'textarea' ? (
              <textarea
                className="input-base"
                rows={3}
                value={String(rhfField.value ?? '')}
                onChange={(e) => rhfField.onChange(e.target.value)}
              />
            ) : field.control === 'markdown' ? (
              <Suspense fallback={<div className="border border-border p-3 text-muted-foreground text-xs">编辑器加载中…</div>}>
                <OverTypeEditor
                  value={String(rhfField.value ?? '')}
                  onChange={(value) => rhfField.onChange(value)}
                />
              </Suspense>
            ) : field.control === 'tags' || field.control === 'categories' ? (
              <input
                className="input-base"
                placeholder="使用逗号分隔"
                value={Array.isArray(rhfField.value) ? rhfField.value.join(', ') : String(rhfField.value ?? '')}
                onChange={(e) =>
                  rhfField.onChange(
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
              />
            ) : (
              <input
                className="input-base"
                type={field.control === 'password' ? 'password' : field.control === 'datetime' ? 'datetime-local' : 'text'}
                value={formatInputValue(rhfField.value, field.control)}
                onChange={(e) => rhfField.onChange(e.target.value)}
              />
            )}
          </div>
          {fieldState.error ? (
            <span className="mt-1 block text-xs" style={{ color: 'var(--color-error)' }}>{fieldState.error.message}</span>
          ) : null}
        </label>
      )}
    />
  )
}

function formatInputValue(value: unknown, control: FieldMeta['control']): string {
  if (value === undefined || value === null) return ''
  if (control === 'datetime' && typeof value === 'string') {
    return value.slice(0, 16)
  }
  return String(value)
}

export function useVditorLoaded(): boolean {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    setLoaded(true)
  }, [])
  return loaded
}
