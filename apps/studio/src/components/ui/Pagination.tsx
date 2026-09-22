import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
}

const pageSizeOptions = [10, 20, 50]

export function Pagination({ page, pageSize, total, onChange, onPageSizeChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border-subtle text-sm">
      <span className="text-muted-foreground">共 {total} 项数据</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center justify-center w-9 h-9 border border-border rounded-sm text-muted-foreground disabled:opacity-40 hover:text-foreground"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="上一页"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-foreground min-w-[48px] text-center">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="inline-flex items-center justify-center w-9 h-9 border border-border rounded-sm text-muted-foreground disabled:opacity-40 hover:text-foreground"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="下一页"
        >
          <ChevronRight size={14} />
        </button>
        {onPageSizeChange ? (
          <label className="flex items-center gap-1 text-muted-foreground ml-2">
            <select
              className="input-ink !w-auto !py-1 text-xs"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            条/页
          </label>
        ) : null}
      </div>
    </div>
  )
}
