import { useEffect, useRef } from 'react'
import OverType, { defaultToolbarButtons } from 'overtypeplus'

interface Props {
  value: string
  onChange: (value: string) => void
  height?: number
  placeholder?: string
  onOpenMedia?: () => void
}

type OverTypeInstance = {
  getValue: () => string
  setValue: (value: string) => void
  destroy?: () => void
}

type ToolbarButtonLike = {
  name: string
  actionId?: string
  icon?: string
  title?: string
  action?: (ctx: unknown) => void
  [key: string]: unknown
}

/**
 * 保留 OverType 原版工具栏图标（描边），仅替换 image 按钮动作为打开图床。
 */
export default function OverTypeEditor({
  value,
  onChange,
  height = 420,
  placeholder,
  onOpenMedia,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<OverTypeInstance | null>(null)
  const onChangeRef = useRef(onChange)
  const onOpenMediaRef = useRef(onOpenMedia)
  onChangeRef.current = onChange
  onOpenMediaRef.current = onOpenMedia

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const buttons = (defaultToolbarButtons as ToolbarButtonLike[])
      .filter((btn) => btn && btn.name !== 'upload')
      .map((btn) => {
        if (btn.name !== 'image') return btn
        // icon/title 保持 overtypeplus 默认，不覆盖为实心 lucide
        return {
          ...btn,
          title: '插入图床图片',
          action: () => {
            onOpenMediaRef.current?.()
          },
        }
      })

    const created = new (OverType as unknown as new (
      el: HTMLElement,
      options: Record<string, unknown>,
    ) => OverTypeInstance | OverTypeInstance[])(container, {
      value,
      placeholder: placeholder ?? '使用 Markdown 书写正文',
      toolbar: true,
      toolbarButtons: buttons,
      autoResize: true,
      minHeight: height,
      maxHeight: 0,
      smartLists: true,
    })
    const inst = Array.isArray(created) ? created[0] : created
    instanceRef.current = inst ?? null
    const handle = () => {
      const current = instanceRef.current
      if (!current) return
      try {
        onChangeRef.current(current.getValue())
      } catch {
        // ignore
      }
    }
    container.addEventListener('input', handle)
    container.addEventListener('keyup', handle)
    return () => {
      container.removeEventListener('input', handle)
      container.removeEventListener('keyup', handle)
      try {
        instanceRef.current?.destroy?.()
      } catch {
        // ignore
      }
      instanceRef.current = null
    }
  }, [height, placeholder])

  useEffect(() => {
    const inst = instanceRef.current
    if (!inst) return
    try {
      const current = inst.getValue()
      if (current !== value) inst.setValue(value)
    } catch {
      // ignore
    }
  }, [value])

  useEffect(() => {
    const host = containerRef.current
    if (!host) return
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ markdown: string }>).detail
      const inst = instanceRef.current
      if (!detail?.markdown || !inst) return
      const ta = host.querySelector('textarea')
      if (!ta) {
        const next = (inst.getValue() || '') + '\n' + detail.markdown
        inst.setValue(next)
        onChangeRef.current(next)
        return
      }
      const start = ta.selectionStart ?? ta.value.length
      const end = ta.selectionEnd ?? start
      const next = ta.value.slice(0, start) + detail.markdown + ta.value.slice(end)
      ta.value = next
      inst.setValue(next)
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      ta.focus()
      const caret = start + detail.markdown.length
      ta.setSelectionRange(caret, caret)
      onChangeRef.current(next)
    }
    host.addEventListener('taiping-insert-media', handler)
    return () => host.removeEventListener('taiping-insert-media', handler)
  }, [])

  return (
    <div
      ref={containerRef}
      className="overtype-editor-host rounded-sm border border-border-subtle bg-card"
    />
  )
}
