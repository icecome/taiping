import { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  MessageCircle,
  Plus,
  Image as ImageIcon,
  Video,
  Link as LinkIcon,
  Hash,
  Send,
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  PenLine,
} from 'lucide-react'
import { api } from '../api/endpoints'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Pagination } from '../components/ui/Pagination'
import { toast } from '../lib/toast'
import { PageSticky } from '../components/layout/PageSticky'
import type { Moment } from '@taiping/content-model/moment'
import { confirmDialog } from '../components/ui/ConfirmDialog'
import { useFocusTrap } from '../lib/useFocusTrap'
import {
  calendarDateKey,
  calendarWeekdayMondayFirst,
  shanghaiDateKey,
  shanghaiParts,
  shanghaiTimeHm,
} from '@taiping/shared-utils/date'
import {
  useComposeState,
  type ComposeState,
  type MomentDraft,
} from '../features/moment/composeState'
import { useMediaUpload } from '../features/moment/useMediaUpload'
import { clearDraft, createDebouncedSaver, loadDraft } from '../features/moment/draftPersistence'
import { ImageGridEditor } from '../components/media/ImageGridEditor'
import { MediaPicker } from '../components/media/MediaPicker'
import type { MediaFile } from '../lib/mediaUtils'

// ===== 日期分组（存储 UTC，展示按上海） =====
interface DateGroup {
  key: string
  label: string
  date: string
  items: Moment[]
}

function getDateKey(iso: string): string {
  return shanghaiDateKey(iso)
}

function isToday(dateStr: string): boolean {
  return dateStr === shanghaiDateKey(new Date())
}

function isYesterday(dateStr: string): boolean {
  return dateStr === shanghaiDateKey(Date.now() - 24 * 60 * 60 * 1000)
}

function groupMomentsByDate(moments: Moment[]): DateGroup[] {
  const map = new Map<string, DateGroup>()
  for (const m of moments) {
    const key = getDateKey(m.createdAt)
    if (!map.has(key)) {
      let label = key
      if (isToday(key)) label = `今天 · ${key}`
      else if (isYesterday(key)) label = `昨天 · ${key}`
      map.set(key, { key, label, date: key, items: [] })
    }
    map.get(key)!.items.push(m)
  }
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1))
}

// ===== 日历热力图 =====
interface CalendarCell {
  day: number | null
  count: number
  isToday: boolean
  dateKey: string
}

function buildCalendarCells(
  year: number,
  month: number,
  moments: Moment[],
): CalendarCell[] {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const firstWeekday = calendarWeekdayMondayFirst(year, month, 1)

  const countMap = new Map<string, number>()
  for (const m of moments) {
    const key = getDateKey(m.createdAt)
    countMap.set(key, (countMap.get(key) ?? 0) + 1)
  }

  const todayKey = shanghaiDateKey(new Date())
  const cells: CalendarCell[] = []

  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ day: null, count: 0, isToday: false, dateKey: '' })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const key = calendarDateKey(year, month + 1, d)
    cells.push({
      day: d,
      count: countMap.get(key) ?? 0,
      isToday: key === todayKey,
      dateKey: key,
    })
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, count: 0, isToday: false, dateKey: '' })
  }
  return cells
}

function getHeatColorClass(count: number): string {
  if (count === 0) return 'bg-secondary text-muted-foreground'
  if (count === 1) return 'bg-primary-200 text-foreground'
  if (count === 2) return 'bg-primary-300 text-foreground'
  if (count <= 4) return 'bg-primary-400 text-primary-foreground'
  return 'bg-primary-500 text-primary-foreground'
}

// ===== 标签聚合 =====
interface TagCount {
  name: string
  count: number
}

function aggregateTags(moments: Moment[]): TagCount[] {
  const map = new Map<string, number>()
  for (const m of moments) {
    for (const t of m.tagNames ?? []) {
      map.set(t, (map.get(t) ?? 0) + 1)
    }
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

// ===== 图片九宫格 =====
function MomentImageGrid({ pictures }: { pictures: Array<{ url: string; alt?: string }> }) {
  if (!pictures.length) return null
  const count = pictures.length
  // 根据数量决定列数：1张单图，2-4张两列，5-9张三列
  const cols = count === 1 ? 1 : count <= 4 ? 2 : 3
  const maxWidth = count === 1 ? '180px' : count <= 4 ? '240px' : '280px'
  return (
    <div
      className="grid gap-1 mb-2"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, maxWidth }}
    >
      {pictures.map((pic, i) => (
        <div
          key={i}
          className="aspect-square rounded-sm bg-secondary border border-border overflow-hidden"
        >
          <img
            src={pic.url}
            alt={pic.alt ?? ''}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  )
}

// ===== 时间线条目 =====
function MomentCard({
  moment,
  onEdit,
  onDelete,
}: {
  moment: Moment
  onEdit: (m: Moment) => void
  onDelete: (id: string) => void
}) {
  const time = shanghaiTimeHm(moment.createdAt)
  // 无作者时不显示头像，与前台 MomentsFeed 的条件渲染保持一致
  const authorInitial = moment.author?.trim().charAt(0) ?? ''

  return (
    <Card padding="sm" className="mb-2">
      <div className="flex items-start gap-2.5">
        {authorInitial ? (
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs text-primary-foreground shrink-0">
            {authorInitial}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground mb-1">{time}</div>
          <p className="text-sm text-foreground whitespace-pre-wrap mb-2">
            {moment.contentMd}
          </p>

          {moment.pictures?.length ? (
            <MomentImageGrid pictures={moment.pictures} />
          ) : null}

          {moment.videoUrl ? (
            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
              <Video size={14} className="shrink-0" />
              <span className="truncate">{moment.videoUrl}</span>
            </div>
          ) : null}

          {moment.linkUrl ? (
            <div className="flex items-center gap-2 mb-2 p-2 border border-border-subtle rounded-sm bg-secondary" style={{ maxWidth: 380 }}>
              <LinkIcon size={14} className="text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-foreground truncate">
                  {moment.linkText || '链接'}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {moment.linkUrl}
                </div>
              </div>
            </div>
          ) : null}

          {moment.tagNames?.length ? (
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              {moment.tagNames.map((tag) => (
                <span
                  key={tag}
                  className="text-xs text-info"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-2 mt-1.5">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => onEdit(moment)}
            >
              编辑
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
              onClick={() => onDelete(moment.id)}
            >
              删除
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ===== 日历热力图组件 =====
function CalendarHeatmap({
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
          <div
            key={w}
            className="text-xs text-muted-foreground text-center"
          >
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

// ===== 标签云组件 =====
function TagCloud({
  tags,
  selectedTag,
  onSelectTag,
}: {
  tags: TagCount[]
  selectedTag: string | null
  onSelectTag: (tag: string | null) => void
}) {
  if (!tags.length) {
    return (
      <Card padding="sm">
        <div className="text-sm font-medium text-foreground mb-2">标签</div>
        <div className="text-xs text-muted-foreground">暂无标签</div>
      </Card>
    )
  }
  return (
    <Card padding="sm">
      <div className="text-sm font-medium text-foreground mb-2">标签</div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <button
            key={t.name}
            type="button"
            className={`tag-pill text-xs border rounded-full px-2 py-0.5 transition-colors ${
              selectedTag === t.name
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary border-border text-foreground'
            }`}
            onClick={() => onSelectTag(selectedTag === t.name ? null : t.name)}
          >
            #{t.name} ({t.count})
          </button>
        ))}
      </div>
    </Card>
  )
}

// ===== 发布区组件 =====
interface ComposeCardProps {
  state: ComposeState
  patchDraft: (patch: Partial<MomentDraft>) => void
  onAddPictures: (files: File[]) => void
  onRemovePicture: (uid: string) => void
  onRetryPicture: (uid: string) => void
  onReorderPictures: (from: number, to: number) => void
  onOpenLibrary: () => void
  onPublish: () => void
  onCancel: () => void
  canSubmit: boolean
  hasUploading: boolean
  hasFailed: boolean
  isSubmitting: boolean
  mediaConfigured: boolean
  mediaHint?: string
}

function ComposeCard({
  state,
  patchDraft,
  onAddPictures,
  onRemovePicture,
  onRetryPicture,
  onReorderPictures,
  onOpenLibrary,
  onPublish,
  onCancel,
  canSubmit,
  hasUploading,
  hasFailed,
  isSubmitting,
  mediaConfigured,
  mediaHint,
}: ComposeCardProps) {
  const maxLen = 2000
  const draft = state.draft
  const isEditing = state.mode === 'editing'
  const [showVideo, setShowVideo] = useState(Boolean(draft.videoUrl))
  const [showLink, setShowLink] = useState(Boolean(draft.linkUrl))
  const [showTagInput, setShowTagInput] = useState(draft.tagNames.length > 0)
  const [newTag, setNewTag] = useState('')
  const [imageMenuOpen, setImageMenuOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // 编辑目标切换时同步面板内的显隐开关
  useEffect(() => {
    setShowVideo(Boolean(draft.videoUrl))
    setShowLink(Boolean(draft.linkUrl))
    setShowTagInput(draft.tagNames.length > 0)
  }, [state.editingId, state.mode, draft.videoUrl, draft.linkUrl, draft.tagNames.length])

  // 点击外部收起图片菜单
  useEffect(() => {
    if (!imageMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setImageMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [imageMenuOpen])

  const handleAddTag = () => {
    const trimmed = newTag.trim()
    if (trimmed && !draft.tagNames.includes(trimmed)) {
      patchDraft({ tagNames: [...draft.tagNames, trimmed] })
    }
    setNewTag('')
  }

  return (
    <Card padding="md" className={`mb-4 moment-compose-card ${isEditing ? 'compose-editing' : ''}`}>
      {isEditing ? (
        <div className="compose-mode-bar">
          <span className="compose-mode-badge">编辑模式</span>
          <span className="compose-mode-hint">正在编辑已发布的说说</span>
        </div>
      ) : null}

      <textarea
        className="input-base border-0 resize-none focus:!shadow-none !p-0"
        rows={3}
        value={draft.contentMd}
        onChange={(e) => patchDraft({ contentMd: e.target.value.slice(0, maxLen) })}
        placeholder="这一刻的想法…"
      />

      <div className="flex flex-wrap items-center gap-1.5 mt-3 border-t border-border-subtle pt-2">
        {/* 图片：双路径入口 */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn-ghost btn-sm moment-tool-btn"
            title="添加图片"
            aria-haspopup="menu"
            aria-expanded={imageMenuOpen}
            onClick={() => setImageMenuOpen((v) => !v)}
          >
            <ImageIcon size={14} />
            <span>图片</span>
          </button>
          {imageMenuOpen ? (
            <div className="compose-image-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="compose-image-menu-item"
                disabled={!mediaConfigured}
                onClick={() => {
                  setImageMenuOpen(false)
                  fileInputRef.current?.click()
                }}
              >
                上传本地图片
                <span className="compose-image-menu-hint">
                  {mediaConfigured ? '支持多选，自动存入图床' : '需先配置图床'}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="compose-image-menu-item"
                disabled={!mediaConfigured}
                onClick={() => {
                  setImageMenuOpen(false)
                  onOpenLibrary()
                }}
              >
                从图床选择
                <span className="compose-image-menu-hint">
                  {mediaConfigured ? '浏览已上传的图片' : '需先配置图床'}
                </span>
              </button>
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? [])
              if (picked.length) onAddPictures(picked)
              e.target.value = ''
            }}
          />
        </div>

        <button
          type="button"
          className="btn-ghost btn-sm moment-tool-btn"
          title="添加视频"
          onClick={() => setShowVideo(!showVideo)}
        >
          <Video size={14} />
          <span>视频</span>
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm moment-tool-btn"
          title="添加链接"
          onClick={() => setShowLink(!showLink)}
        >
          <LinkIcon size={14} />
          <span>链接</span>
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm moment-tool-btn"
          title="添加标签"
          onClick={() => setShowTagInput(!showTagInput)}
        >
          <Hash size={14} />
          <span>标签</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {draft.contentMd.length}/{maxLen}
          </span>
          {isEditing ? (
            <Button variant="secondary" size="sm" onClick={onCancel} disabled={isSubmitting}>
              取消
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            icon={<Send size={14} />}
            disabled={!canSubmit || isSubmitting}
            onClick={onPublish}
          >
            {isSubmitting ? '发布中…' : isEditing ? '保存' : '发布'}
          </Button>
        </div>
      </div>

      {/* 阻断提示：仅在上传进行中或失败时出现。
          图床未配置的情况由「图片」菜单项的置灰与说明承担，不在此常驻提示。 */}
      {hasUploading ? (
        <div className="compose-block-hint">还有图片正在上传，完成后才能发布</div>
      ) : hasFailed ? (
        <div className="compose-block-hint compose-block-error">
          有图片上传失败，请重试或移除后再发布
        </div>
      ) : null}

      {/* 图片九宫格（固定 3 列） */}
      <ImageGridEditor
        pictures={draft.pictures}
        onAddLocal={() => fileInputRef.current?.click()}
        onRemove={onRemovePicture}
        onRetry={onRetryPicture}
        onReorder={onReorderPictures}
        addDisabled={!mediaConfigured}
        addDisabledHint={mediaHint || '需先配置图床'}
      />

      {showVideo ? (
        <div className="flex items-center gap-2 mt-3">
          <Video size={14} className="text-muted-foreground shrink-0" />
          <input
            className="input-base text-xs"
            style={{ maxWidth: 340 }}
            placeholder="视频链接"
            value={draft.videoUrl}
            onChange={(e) => patchDraft({ videoUrl: e.target.value })}
          />
        </div>
      ) : null}

      {showLink ? (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <LinkIcon size={14} className="text-muted-foreground shrink-0" />
          <input
            className="input-base text-xs"
            style={{ maxWidth: 240 }}
            placeholder="链接地址"
            value={draft.linkUrl}
            onChange={(e) => patchDraft({ linkUrl: e.target.value })}
          />
          <input
            className="input-base text-xs"
            style={{ maxWidth: 160 }}
            placeholder="链接文案"
            value={draft.linkText}
            onChange={(e) => patchDraft({ linkText: e.target.value })}
          />
        </div>
      ) : null}

      {showTagInput ? (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Hash size={14} className="text-muted-foreground shrink-0" />
          {draft.tagNames.map((tag) => (
            <span key={tag} className="badge badge-muted gap-1">
              #{tag}
              <button
                type="button"
                onClick={() => patchDraft({ tagNames: draft.tagNames.filter((t) => t !== tag) })}
                aria-label={`移除标签 ${tag}`}
                style={{ lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
          <input
            className="input-base text-xs"
            style={{ maxWidth: 140 }}
            placeholder="新标签后回车"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddTag()
              }
            }}
          />
          <button type="button" className="btn-ghost btn-sm" onClick={handleAddTag}>
            添加
          </button>
        </div>
      ) : null}
    </Card>
  )
}

// ===== 主组件 =====
export function MomentListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  // 编辑状态机（替代此前散落的 9 个 state）
  const compose = useComposeState()
  const { state: composeState, patchDraft, addPictures, updatePicture, removePicture, reorderPictures, reset: resetCompose } = compose
  const isComposing = composeState.mode !== 'idle'
  const isEditing = composeState.mode === 'editing'

  // 筛选状态
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  // 移动端面板状态
  const [filterOpen, setFilterOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement | null>(null)
  const composeRef = useRef<HTMLDivElement | null>(null)

  // 是否为移动端视口（<768px），决定撰写面板是否为底部抽屉形态
  const [isMobileSheet, setIsMobileSheet] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = () => setIsMobileSheet(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // 移动端才用抽屉；桌面端撰写卡片常驻
  const composeSheetOpen = isComposing && isMobileSheet

  useFocusTrap(composeRef, composeSheetOpen)

  useFocusTrap(filterRef, filterOpen)

  useEffect(() => {
    if (!filterOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [filterOpen])

  // 查询
  const moments = useQuery({
    queryKey: ['moments', { page, pageSize }],
    queryFn: () => api.moments.list({ page, pageSize }),
  })

  // 作者来源：无多用户体系，站点设置中的作者即当前发布者
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  })
  const authorName = settings.data?.author?.trim() ?? ''

  const allMoments = moments.data?.items ?? []

  // 客户端筛选
  const filteredMoments = useMemo(() => {
    return allMoments.filter((m) => {
      if (selectedDate && getDateKey(m.createdAt) !== selectedDate) return false
      if (selectedTag && !m.tagNames?.includes(selectedTag)) return false
      return true
    })
  }, [allMoments, selectedDate, selectedTag])

  const dateGroups = useMemo(
    () => groupMomentsByDate(filteredMoments),
    [filteredMoments],
  )

  const tagCounts = useMemo(() => aggregateTags(allMoments), [allMoments])

  // 图片上传
  const upload = useMediaUpload({
    onPictureUpdate: updatePicture,
    currentCount: () => composeState.draft.pictures.length,
  })

  // 保留原始 File 以支持失败重试
  const fileCache = useRef(new Map<string, File>())

  const handleAddPictures = useCallback(
    async (files: File[]) => {
      const snapshot = composeState.draft.pictures.map((p) => p.uid)
      const outcome = await upload.uploadFiles(files, addPictures)
      // 缓存 File 供重试（对应新增的 uid 需要从上传结果反查）
      const added = outcome.uploaded.map((u) => u.uid)
      files.forEach((f, idx) => {
        const placeholderUid = added[idx]
        if (placeholderUid) fileCache.current.set(placeholderUid, f)
      })
      void snapshot

      if (outcome.rejected.length) {
        const first = outcome.rejected[0]
        toast(
          outcome.rejected.length === 1
            ? `${first?.name}：${first?.reason}`
            : `${outcome.rejected.length} 个文件被拒绝（${first?.reason}）`,
          'error',
        )
      }
      if (outcome.failed.length) {
        toast(`${outcome.failed.length} 张上传失败，可重试`, 'error')
      }
    },
    [composeState.draft.pictures, upload, addPictures],
  )

  const handleRetryPicture = useCallback(
    async (uid: string) => {
      const file = fileCache.current.get(uid)
      if (!file) {
        toast('原文件已失效，请重新选择', 'error')
        return
      }
      const ok = await upload.uploadSingle(uid, file)
      toast(ok ? '已上传' : '上传失败', ok ? 'ok' : 'error')
    },
    [upload],
  )

  const handleInsertFromLibrary = useCallback(
    (files: MediaFile[]) => {
      const items = upload.insertFromLibrary(files)
      addPictures(items)
      toast(`已插入 ${items.length} 张`)
    },
    [upload, addPictures],
  )

  // 草稿持久化
  const saver = useRef(createDebouncedSaver())

  useEffect(() => {
    if (!isComposing) return
    saver.current.schedule(
      composeState.mode === 'editing' ? 'editing' : 'creating',
      composeState.editingId,
      composeState.draft,
    )
  }, [isComposing, composeState.mode, composeState.editingId, composeState.draft])

  // 创建
  const create = useMutation({
    mutationFn: () => api.moments.create(compose.toPayload()),
    onSuccess: () => {
      saver.current.cancel()
      clearDraft()
      resetCompose()
      queryClient.invalidateQueries({ queryKey: ['moments'] })
      toast('说说已发布')
    },
    onError: () => toast('发布失败，内容已保留', 'error'),
  })

  // 更新
  const update = useMutation({
    mutationFn: (input: { id: string; data: unknown }) =>
      api.moments.update(input.id, input.data),
    onSuccess: () => {
      saver.current.cancel()
      clearDraft()
      resetCompose()
      queryClient.invalidateQueries({ queryKey: ['moments'] })
      toast('已更新')
    },
    onError: () => toast('更新失败，内容已保留', 'error'),
  })

  // 删除
  const remove = useMutation({
    mutationFn: (id: string) => api.moments.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moments'] })
      toast('已删除')
    },
    onError: () => toast('删除失败', 'error'),
  })

  const handleEdit = useCallback(
    (m: Moment) => {
      compose.enterEdit(m)
    },
    [compose],
  )

  const handlePublish = useCallback(() => {
    if (!compose.canSubmit) return
    const payload = compose.toPayload(authorName)
    if (composeState.editingId) {
      update.mutate({ id: composeState.editingId, data: payload })
    } else {
      create.mutate()
    }
  }, [compose, composeState.editingId, update, create, authorName])

  const handleCancelEdit = useCallback(() => {
    saver.current.cancel()
    clearDraft()
    resetCompose()
  }, [resetCompose])

  // 挂载时检查未完成的草稿，提示恢复
  const draftChecked = useRef(false)
  useEffect(() => {
    if (draftChecked.current) return
    draftChecked.current = true

    // 桌面端撰写卡常驻可见，须进入创建模式，否则 PATCH_DRAFT 在 idle 下被丢弃（输入无反应）
    if (!isMobileSheet) compose.enterCreate()

    const stored = loadDraft()
    if (!stored) return

    void (async () => {
      const preview = stored.draft.contentMd.trim().slice(0, 40)
      const ok = await confirmDialog({
        title: '恢复未发布的内容？',
        description: preview
          ? `检测到上次编辑的内容：「${preview}${stored.draft.contentMd.length > 40 ? '…' : ''}」`
          : '检测到上次未完成的编辑内容。',
        confirmLabel: '恢复',
        cancelLabel: '丢弃',
      })
      if (!ok) {
        clearDraft()
        return
      }
      if (stored.mode === 'editing' && stored.editingId) {
        const target = allMoments.find((m) => m.id === stored.editingId)
        if (target) {
          compose.enterEdit(target)
          patchDraft(stored.draft)
          toast('已恢复编辑内容')
          return
        }
      }
      compose.enterCreate()
      patchDraft(stored.draft)
      toast('已恢复草稿')
    })()
    // 仅在挂载时检查一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: '删除这条说说？',
      description: '删除后无法恢复。',
      confirmLabel: '删除',
      danger: true,
    })
    if (ok) remove.mutate(id)
  }

  const handleClearFilters = () => {
    setSelectedDate(null)
    setSelectedTag(null)
  }

  // 锁定 body 滚动
  useEffect(() => {
    const shouldLock = filterOpen || (isComposing && isMobileSheet)
    if (!shouldLock) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [filterOpen, isComposing, isMobileSheet])

  const hasActiveFilter = selectedDate !== null || selectedTag !== null

  return (
    <div className="space-y-4 flex flex-col">
      <PageSticky>
      <PageHeader
        icon={<MessageCircle size={20} />}
        title="说说"
        description="记录当下的想法"
        actions={
          <>
            <span className="text-sm text-muted-foreground">
              共 {moments.data?.total ?? 0} 条
            </span>
            <button
              type="button"
              className="btn-ghost btn-sm mobile-only"
              onClick={() => setFilterOpen(true)}
            >
              <Calendar size={16} />
              筛选
            </button>
          </>
        }
      />
      </PageSticky>

      {/* 移动端筛选条 */}
      <div className="moment-filter-bar mobile-only" style={{ display: 'none' }}>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => setFilterOpen(true)}
        >
          <Calendar size={14} />
          日历
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => setFilterOpen(true)}
        >
          <Hash size={14} />
          标签
        </button>
        {hasActiveFilter ? (
          <button
            type="button"
            className="btn-ghost btn-sm ml-auto"
            onClick={handleClearFilters}
          >
            清除筛选
          </button>
        ) : (
          <span className="text-xs text-muted-foreground ml-auto">
            共 {filteredMoments.length} 条
          </span>
        )}
      </div>

      {/* 两栏布局 */}
      <div
        className="grid gap-4 responsive-grid"
        style={{ gridTemplateColumns: '1fr 280px' }}
      >
        {/* 左栏：发布 + 时间线 */}
        <div className="min-w-0 flex flex-col">
          <ComposeCard
            state={composeState}
            patchDraft={patchDraft}
            onAddPictures={(files) => void handleAddPictures(files)}
            onRemovePicture={removePicture}
            onRetryPicture={(uid) => void handleRetryPicture(uid)}
            onReorderPictures={reorderPictures}
            onOpenLibrary={() => setLibraryOpen(true)}
            onPublish={handlePublish}
            onCancel={handleCancelEdit}
            canSubmit={compose.canSubmit}
            hasUploading={compose.hasUploading}
            hasFailed={compose.hasFailed}
            isSubmitting={create.isPending || update.isPending}
            mediaConfigured={upload.configured}
            mediaHint={upload.missingHint}
          />

          {/* 时间线标题 */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-foreground">时间线</h2>
            {hasActiveFilter ? (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={handleClearFilters}
              >
                清除筛选
              </button>
            ) : null}
          </div>

          {/* 时间线列表：随文档滚动 */}
          <div className="-mx-1 px-1">
            {moments.isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                加载中…
              </div>
            ) : !filteredMoments.length ? (
              <EmptyState
                title={hasActiveFilter ? '没有匹配的说说' : '暂无说说'}
                description={hasActiveFilter ? '试试调整筛选条件' : '发布一条试试'}
              />
            ) : (
              <div>
                {dateGroups.map((group) => (
                  <div key={group.key}>
                    <div className="text-xs text-muted-foreground mb-2 sticky top-0 bg-background py-1 z-10">
                      {group.label}
                    </div>
                    {group.items.map((moment) => (
                      <MomentCard
                        key={moment.id}
                        moment={moment}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 分页 */}
          {moments.data && !hasActiveFilter ? (
            <div className="mt-3">
              <Pagination
                page={moments.data.page}
                pageSize={moments.data.pageSize}
                total={moments.data.total}
                onChange={setPage}
                onPageSizeChange={(n) => {
                  setPage(1)
                  setPageSize(n)
                }}
              />
            </div>
          ) : null}
        </div>

        {/* 右栏：日历 + 标签云 */}
        <div className="shrink-0 moment-right-column space-y-4">
          <CalendarHeatmap
            moments={allMoments}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
          <TagCloud
            tags={tagCounts}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
          />
        </div>
      </div>

      {/* 移动端 FAB */}
      <button
        type="button"
        className="moment-fab mobile-only"
        style={{
          display: 'none',
          position: 'fixed',
          bottom: 64,
          right: 16,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'var(--primary)',
          color: 'var(--primary-foreground)',
          border: 'none',
          boxShadow: 'var(--shadow-floating)',
          zIndex: 40,
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
        onClick={() => compose.enterCreate()}
        aria-label="发布说说"
      >
        <PenLine size={20} />
      </button>

      {/* 撰写面板遮罩 */}
      {composeSheetOpen ? (
        <div
          className="compose-sheet-backdrop fixed inset-0 bg-black/30 z-50"
          onClick={() => handleCancelEdit()}
        />
      ) : null}

      {/* 撰写滑出面板 */}
      <div
        ref={composeRef}
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? '编辑说说' : '发布说说'}
        className={`compose-sheet fixed left-0 right-0 bg-card border-t border-border z-50 overflow-y-auto flex flex-col ${composeSheetOpen ? 'open' : ''}`}
        style={{
          bottom: 0,
          maxHeight: '70vh',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          boxShadow: 'var(--shadow-floating)',
          display: composeSheetOpen ? 'flex' : 'none',
        }}
      >
        <div className="flex items-center justify-between p-3 border-b border-border-subtle">
          <span className="text-sm font-medium text-foreground">
            {isEditing ? '编辑说说' : '发布说说'}
          </span>
          <button
            type="button"
            className="w-9 h-9 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
            onClick={() => handleCancelEdit()}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-3">
          <ComposeCard
            state={composeState}
            patchDraft={patchDraft}
            onAddPictures={(files) => void handleAddPictures(files)}
            onRemovePicture={removePicture}
            onRetryPicture={(uid) => void handleRetryPicture(uid)}
            onReorderPictures={reorderPictures}
            onOpenLibrary={() => setLibraryOpen(true)}
            onPublish={handlePublish}
            onCancel={handleCancelEdit}
            canSubmit={compose.canSubmit}
            hasUploading={compose.hasUploading}
            hasFailed={compose.hasFailed}
            isSubmitting={create.isPending || update.isPending}
            mediaConfigured={upload.configured}
            mediaHint={upload.missingHint}
          />
        </div>
      </div>

      {/* 图床选择器（多选） */}
      <MediaPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        multiple
        onPickMany={handleInsertFromLibrary}
      />

      {/* 筛选面板遮罩 */}
      {filterOpen ? (
        <div
          className="filter-sheet-backdrop fixed inset-0 bg-black/30 z-50"
          onClick={() => setFilterOpen(false)}
        />
      ) : null}

      {/* 筛选滑出面板 */}
      <div
        ref={filterRef}
        role="dialog"
        aria-modal="true"
        aria-label="筛选"
        className={`filter-sheet fixed left-0 right-0 bg-card border-t border-border z-50 overflow-y-auto flex flex-col ${filterOpen ? 'open' : ''}`}
        style={{
          bottom: 0,
          maxHeight: '60vh',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          boxShadow: 'var(--shadow-floating)',
          display: filterOpen ? 'flex' : 'none',
        }}
      >
        <div className="flex items-center justify-between p-3 border-b border-border-subtle">
          <span className="text-sm font-medium text-foreground">筛选</span>
          <button
            type="button"
            className="w-9 h-9 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
            onClick={() => setFilterOpen(false)}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-3 space-y-3">
          <CalendarHeatmap
            moments={allMoments}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
          <TagCloud
            tags={tagCounts}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
          />
          {hasActiveFilter ? (
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              清除全部筛选
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
