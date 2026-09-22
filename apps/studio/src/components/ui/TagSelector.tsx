import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Check } from 'lucide-react'

export interface TagOption {
  value: string
  label: string
}

interface Props {
  value: string[]
  onChange: (value: string[]) => void
  options: TagOption[]
  placeholder?: string
  allowCreate?: boolean
  disabled?: boolean
}

export function TagSelector({
  value,
  onChange,
  options,
  placeholder = '搜索或输入...',
  allowCreate = false,
  disabled = false,
}: Props) {
  const [inputValue, setInputValue] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const selectedSet = new Set(value)

  const filteredOptions = options.filter(
    (opt) =>
      !selectedSet.has(opt.value) &&
      opt.label.toLowerCase().includes(inputValue.toLowerCase()),
  )

  const showCreate =
    allowCreate && inputValue.trim() !== '' && !options.some(
      (o) => o.label.toLowerCase() === inputValue.trim().toLowerCase(),
    )

  const addItem = useCallback(
    (itemValue: string) => {
      if (selectedSet.has(itemValue)) return
      onChange([...value, itemValue])
    },
    [value, onChange, selectedSet],
  )

  const removeItem = useCallback(
    (itemValue: string) => {
      onChange(value.filter((v) => v !== itemValue))
    },
    [value, onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault()
        const trimmed = inputValue.trim()
        if (trimmed === '') return
        // Try to match an existing option first (by label)
        const matched = options.find(
          (o) => o.label.toLowerCase() === trimmed.toLowerCase(),
        )
        if (matched) {
          addItem(matched.value)
          setInputValue('')
        } else if (allowCreate) {
          addItem(trimmed)
          setInputValue('')
        }
      } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
        const last = value[value.length - 1]
        if (last) removeItem(last)
      }
    },
    [inputValue, options, allowCreate, addItem, removeItem, value],
  )

  const handleContainerClick = useCallback(() => {
    if (disabled) return
    inputRef.current?.focus()
  }, [disabled])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={containerRef}>
      <div
        className={`border border-border rounded-sm bg-card px-2 py-1.5 min-h-[34px] flex flex-wrap items-center gap-1 cursor-text transition-colors ${
          open ? 'border-primary' : ''
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={handleContainerClick}
      >
        {value.map((v) => {
          const opt = options.find((o) => o.value === v)
          const label = opt ? opt.label : v
          return (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-secondary border border-border rounded-sm"
            >
              {label}
              {!disabled && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeItem(v)
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          )
        })}
        <input
          ref={inputRef}
          type="text"
          className="flex-1 min-w-[80px] border-0 outline-none text-xs bg-transparent"
          placeholder={value.length === 0 ? placeholder : ''}
          value={inputValue}
          disabled={disabled}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
        />
      </div>

      {/* Dropdown */}
      <div
        className={`tag-selector-dropdown ${open ? 'open' : ''} absolute top-full left-0 right-0 mt-1 border border-border rounded-sm bg-card shadow-lg z-10 max-h-48 overflow-y-auto studio-scroll`}
      >
        {filteredOptions.length === 0 && !showCreate && (
          <div className="px-2.5 py-2 text-xs text-muted-foreground">
            {allowCreate ? '输入后按回车创建' : '暂无匹配项'}
          </div>
        )}
        {filteredOptions.map((opt) => (
          <div
            key={opt.value}
            className="px-2.5 py-1.5 text-xs cursor-pointer row-hover flex items-center justify-between"
            onClick={() => {
              addItem(opt.value)
              setInputValue('')
              inputRef.current?.focus()
            }}
          >
            <span>{opt.label}</span>
            {selectedSet.has(opt.value) && <Check size={12} className="text-muted-foreground" />}
          </div>
        ))}
        {showCreate && (
          <div
            className="border-t border-border-subtle px-2.5 py-1.5 text-xs cursor-pointer row-hover text-muted-foreground"
            onClick={() => {
              addItem(inputValue.trim())
              setInputValue('')
              inputRef.current?.focus()
            }}
          >
            创建 "<span className="text-foreground">{inputValue.trim()}</span>"
          </div>
        )}
      </div>
    </div>
  )
}
