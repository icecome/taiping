import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Moment } from '@taiping/content-model/moment'
import { shanghaiParts } from '@taiping/shared-utils/date'
import { Card } from '../../components/ui/Card'
import { buildCalendarCells, getHeatColorClass } from './calendar'

export function CalendarHeatmap({
  moments,
  selectedDate,
  onSelectDate,
}: {
  moments: Moment[]
  selectedDate: string | null
  onSelectDate: (date: string | null) => void
}) {
  const today = shanghaiParts(new Date())
  const [year, setYear] = useState(() => today?.year ?? new Date().getFullYear())
  const [month, setMonth] = useState(() => (today?.month ?? new Date().getMonth() + 1) - 1)

  const cells = useMemo(
    () => buildCalendarCells(year, month, moments),
    [year, month, moments],
  )

  const monthCount = useMemo(() => {
    return cells.reduce((sum, c) => sum + c.count, 0)
  }, [cells])

  const totalCount = moments.length

  const prevMonth = () => {
    if (month === 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else {
      setMonth((m) => m - 1)
    }
  }

  const nextMonth = () => {
    if (month === 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日']

  return (
    <Card padding="sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">{year}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost btn-icon btn-sm"
            onClick={prevMonth}
            aria-label="上个月"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="btn-ghost btn-icon btn-sm"
            onClick={nextMonth}
            aria-label="下个月"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground mb-2">
        {month + 1}月
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {weekdayLabels.map((w) => (
          <div key={w} className="text-xs text-muted-foreground text-center">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) =>
          cell.day === null ? (
            <div key={i} className="cal-cell" style={{ background: 'transparent' }} />
          ) : (
            <button
              key={i}
              type="button"
              className={`cal-cell flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity ${getHeatColorClass(cell.count)} ${cell.isToday ? 'ring-2 ring-primary' : ''} ${selectedDate === cell.dateKey ? 'ring-2 ring-info' : ''}`}
              title={`${month + 1}月${cell.day}日 · ${cell.count > 0 ? cell.count + ' 条' : '无记录'}${cell.isToday ? ' · 今天' : ''}`}
              onClick={() =>
                onSelectDate(selectedDate === cell.dateKey ? null : cell.dateKey)
              }
            >
              <span className="text-xs">{cell.day}</span>
            </button>
          ),
        )}
      </div>

      <div className="flex items-center justify-between mt-3 text-xs">
        <span className="text-muted-foreground">总记录 {totalCount}</span>
        <span className="text-foreground font-medium">本月 {monthCount}</span>
      </div>

      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
        <span>少</span>
        <span className="inline-block w-3 h-3 rounded-sm bg-secondary"></span>
        <span className="inline-block w-3 h-3 rounded-sm bg-primary-200"></span>
        <span className="inline-block w-3 h-3 rounded-sm bg-primary-300"></span>
        <span className="inline-block w-3 h-3 rounded-sm bg-primary-400"></span>
        <span>多</span>
      </div>
    </Card>
  )
}
