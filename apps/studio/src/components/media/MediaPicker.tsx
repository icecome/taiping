import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Copy, Trash2, Upload, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { api } from '../../api/endpoints'
import { getActiveMediaConfig } from '@taiping/content-model/settings'
import { useToastStore } from '../../lib/toast'
import { confirmDialog } from '../ui/ConfirmDialog'
import {
  blobToBase64,
  compressImage,
  formatSize,
  markdownImage,
  resolveRenameTemplate,
  MAX_FILE_SIZE,
  type MediaFile,
} from '../../lib/mediaUtils'

interface Props {
  open: boolean
  onClose: () => void
  /** 单选模式：选中图片时插入 Markdown */
  onPick?: (markdown: string) => void
  /** 多选模式：确认后回传选中的图片（按点选顺序） */
  multiple?: boolean
  onPickMany?: (files: MediaFile[]) => void
}

export function MediaPicker({
  open,
  onClose,
  onPick,
  multiple = false,
  onPickMany,
}: Props) {
  const toast = useToastStore((s) => s.push)
  const [files, setFiles] = useState<MediaFile[]>([])
  const [configured, setConfigured] = useState(true)
  const [hint, setHint] = useState<string | undefined>()
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [keyword, setKeyword] = useState('')
  /** 选中项（按点选顺序保存 path） */
  const [selected, setSelected] = useState<string[]>([])

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
    enabled: open,
  })
  const activeCfg = settings.data
    ? getActiveMediaConfig(settings.data)
    : null

  const listQuery = useQuery({
    queryKey: ['media-github'],
    queryFn: () => api.media.githubList(),
    enabled: open,
  })

  useEffect(() => {
    if (!listQuery.data) return
    setConfigured(listQuery.data.configured)
    setHint(listQuery.data.missingHint)
    setFiles(listQuery.data.items)
  }, [listQuery.data])

  // 打开时清空搜索与选中，避免上次残留
  useEffect(() => {
    if (!open) return
    setKeyword('')
    setSelected([])
  }, [open])

  const upload = useMutation({
    mutationFn: async (fileList: FileList | File[]) => {
      const quality = activeCfg?.quality ?? 80
      const rename = activeCfg?.renameTemplate || '{Y}{m}{d}-{str-6}'
      const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'))
      const results: string[] = []
      await Promise.allSettled(
        files.map(async (file) => {
          if (file.size > MAX_FILE_SIZE) {
            results.push(`${file.name}: 超过 20MB`)
            return
          }
          const blob = await compressImage(file, quality)
          const base64 = await blobToBase64(blob)
          const filename = `${resolveRenameTemplate(rename, file.name)}.webp`
          const uploaded = await api.media.githubUpload({
            base64Content: base64,
            filename,
            message: `[skip ci] upload: ${filename}`,
          })
          results.push(uploaded.url)
          setFiles((prev) => [
            {
              name: uploaded.path.split('/').pop() || filename,
              path: uploaded.path,
              sha: uploaded.sha,
              size: blob.size,
              url: uploaded.url,
            },
            ...prev,
          ])
        }),
      )
      return results
    },
    onSuccess: (urls) => {
      toast(urls.length ? `已上传 ${urls.length} 张` : '未选择图片')
      void listQuery.refetch()
    },
    onError: (err) => toast(err instanceof Error ? err.message : '上传失败', 'error'),
  })

  const filteredFiles = files.filter((f) => {
    if (!keyword.trim()) return true
    return f.name.toLowerCase().includes(keyword.trim().toLowerCase())
  })

  const toggleSelect = useCallback((path: string) => {
    setSelected((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    )
  }, [])

  const copyUrl = useCallback(
    async (url: string) => {
      try {
        await navigator.clipboard.writeText(url)
        toast('已复制 URL')
      } catch {
        toast('复制失败', 'error')
      }
    },
    [toast],
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-foreground/30 flex items-start justify-center p-6 overflow-auto">
      <div className="w-full max-w-4xl border border-border bg-card rounded-sm shadow-none">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <div>
            <div className="text-sm font-medium text-foreground">图床</div>
            <div className="text-xs text-muted-foreground">
              GitHub 渠道 · 客户端 WebP 压缩 · 重命名模板
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="text-muted-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-border-subtle flex flex-wrap items-center gap-2 text-sm">
          <label className="btn-ghost cursor-pointer">
            <Upload size={14} className="mr-1" />
            上传图片
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) upload.mutate(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
          <ButtonLink onClick={() => void listQuery.refetch()}>刷新</ButtonLink>
          <ButtonLink onClick={() => onClose()}>关闭</ButtonLink>
          {!configured ? (
            <span className="text-xs text-destructive">
              {hint || '请先在「设置 → 外观与图床」配置 GitHub 仓库'}
            </span>
          ) : null}
          {upload.isPending ? <span className="text-xs text-muted-foreground">上传中…</span> : null}
        </div>

        {/* 搜索与视图切换 */}
        <div className="lib-toolbar">
          <input
            className="input-base lib-search"
            placeholder="搜索文件名"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            aria-label="搜索图片文件名"
          />
          <div className="lib-seg">
            <button
              type="button"
              className={viewMode === 'grid' ? 'on' : ''}
              onClick={() => setViewMode('grid')}
            >
              网格
            </button>
            <button
              type="button"
              className={viewMode === 'list' ? 'on' : ''}
              onClick={() => setViewMode('list')}
            >
              列表
            </button>
          </div>
        </div>

        <div className="lib-dialog-body studio-scroll">
          {listQuery.isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
          ) : !files.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              暂无图片，可上传或检查图床配置
            </div>
          ) : !filteredFiles.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              没有匹配「{keyword}」的图片
            </div>
          ) : viewMode === 'grid' ? (
            <div className="lib-grid">
              {filteredFiles.map((file) => {
                const on = selected.includes(file.path)
                return (
                  <div key={file.path} className={`lib-cell ${on ? 'on' : ''}`}>
                    <button
                      type="button"
                      className="block w-full h-full"
                      onClick={() => {
                        if (multiple) {
                          toggleSelect(file.path)
                        } else if (onPick) {
                          onPick(markdownImage(file.url, file.name))
                          onClose()
                        }
                      }}
                      title={multiple ? '点击选择' : '点击插入正文'}
                      aria-pressed={multiple ? on : undefined}
                    >
                      <img src={file.url} alt={file.name} loading="lazy" />
                    </button>
                    {multiple && on ? <span className="lib-cell-check">✓</span> : null}
                    {multiple ? (
                      <button
                        type="button"
                        className="img-cell-remove"
                        style={{ opacity: 1 }}
                        aria-label={`删除 ${file.name}`}
                        onClick={async (e) => {
                          e.stopPropagation()
                          const ok = await confirmDialog({
                            title: `删除「${file.name}」？`,
                            description: '删除后无法恢复。',
                            confirmLabel: '删除',
                            danger: true,
                          })
                          if (!ok) return
                          try {
                            await api.media.githubDelete({ path: file.path, sha: file.sha })
                            setFiles((prev) => prev.filter((f) => f.path !== file.path))
                            setSelected((prev) => prev.filter((p) => p !== file.path))
                            toast('已删除')
                          } catch (err) {
                            toast(err instanceof Error ? err.message : '删除失败', 'error')
                          }
                        }}
                      >
                        <Trash2 size={11} />
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="lib-list">
              {filteredFiles.map((file) => {
                const on = selected.includes(file.path)
                return (
                  <div
                    key={file.path}
                    className={`lib-row ${on ? 'on' : ''}`}
                    style={{ cursor: 'default' }}
                  >
                    <button
                      type="button"
                      className="flex items-center gap-3 flex-1 min-w-0 bg-transparent border-0 p-0 text-left"
                      style={{ cursor: 'pointer', font: 'inherit', color: 'inherit' }}
                      onClick={() => {
                        if (multiple) {
                          toggleSelect(file.path)
                        } else if (onPick) {
                          onPick(markdownImage(file.url, file.name))
                          onClose()
                        }
                      }}
                      aria-pressed={multiple ? on : undefined}
                    >
                      {multiple ? (
                        <span className="lib-checkbox">{on ? '✓' : ''}</span>
                      ) : null}
                      <img src={file.url} alt="" loading="lazy" />
                      <span className="lib-row-meta">
                        <span className="lib-row-name">{file.name}</span>
                        <span className="lib-row-sub">{formatSize(file.size)}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => void copyUrl(file.url)}
                      aria-label={`复制 ${file.name} 的地址`}
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {multiple ? (
          <div className="lib-footer">
            <span>
              已选 {selected.length} 张
              {selected.length ? ' · 按点选顺序插入' : ''}
            </span>
            <span className="flex items-center gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
                取消
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={!selected.length}
                onClick={() => {
                  const picked = selected
                    .map((path) => files.find((f) => f.path === path))
                    .filter((f): f is MediaFile => Boolean(f))
                  onPickMany?.(picked)
                  onClose()
                }}
              >
                插入 ({selected.length})
              </button>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ButtonLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={onClick}>
      {children}
    </button>
  )
}
