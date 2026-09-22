import { AlertCircle } from 'lucide-react'
import { Button } from './Button'

interface Props {
  title?: string
  /** 失败原因，用平实语言描述（避免技术术语） */
  description?: string
  onRetry?: () => void
  retryLabel?: string
}

/**
 * 统一的错误态。
 * 遵循 NN/g 第 9 条：平实语言说明问题 + 提供恢复动作。
 * 详见 docs/design-optimization/B端设计优化方案.md §2.9
 */
export function ErrorState({
  title = '加载失败',
  description = '请检查网络后重试',
  onRetry,
  retryLabel = '重试',
}: Props) {
  return (
    <div className="py-12 flex flex-col items-center text-center">
      <div
        className="w-12 h-12 mb-4 flex items-center justify-center rounded-sm"
        style={{
          color: 'var(--color-error)',
          background: 'var(--color-error-bg)',
        }}
      >
        <AlertCircle size={22} />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 mb-4">{description}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}
