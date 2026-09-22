interface Props {
  /** 行数，控制骨架屏高度 */
  rows?: number
  /** inline：行内小 spinner，用于轻量局部刷新 */
  variant?: 'skeleton' | 'inline'
  /** 无障碍提示文案 */
  label?: string
}

/**
 * 统一的加载态。
 * - skeleton：内容密集场景（列表/卡片/详情），保持布局占位
 * - inline：轻量局部刷新
 * 详见 docs/design-optimization/B端设计优化方案.md §2.9
 */
export function LoadingState({
  rows = 3,
  variant = 'skeleton',
  label = '加载中…',
}: Props) {
  if (variant === 'inline') {
    return (
      <span
        className="inline-flex items-center gap-2 text-xs text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <span className="w-3 h-3 rounded-full border-2 border-border border-t-foreground animate-spin" />
        {label}
      </span>
    )
  }

  return (
    <div className="space-y-3 py-2" role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton w-9 h-9 rounded-sm shrink-0" />
          <div className="flex-1 space-y-2">
            <div
              className="skeleton h-3"
              style={{ width: `${72 - i * 12}%` }}
            />
            <div className="skeleton h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  )
}
