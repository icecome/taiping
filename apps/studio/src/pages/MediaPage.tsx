import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Image as ImageIcon, RefreshCw, Save, Trash2, Upload } from 'lucide-react'
import type { SiteSettings } from '@taiping/content-model/settings'
import { getActiveMediaConfig } from '@taiping/content-model/settings'
import { api } from '../api/endpoints'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Tabs } from '../components/ui/Tabs'
import { toast } from '../lib/toast'
import {
  blobToBase64,
  compressImage,
  formatSize,
  resolveRenameTemplate,
  MAX_FILE_SIZE,
  type MediaFile,
} from '../lib/mediaUtils'
import { PageSticky } from '../components/layout/PageSticky'
import { confirmDialog } from '../components/ui/ConfirmDialog'

const tabs = [
  { key: 'files', label: '资源' },
  { key: 'config', label: '启用图床' },
]

export function MediaPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'files' | 'config'>('files')
  const [files, setFiles] = useState<MediaFile[]>([])
  const [activeId, setActiveId] = useState('')

  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.settings.get() })
  const listQuery = useQuery({ queryKey: ['media-github'], queryFn: () => api.media.githubList() })

  useEffect(() => {
    if (listQuery.data?.items) setFiles(listQuery.data.items)
  }, [listQuery.data])

  useEffect(() => {
    if (settings.data) setActiveId(settings.data.activeMediaConfigId)
  }, [settings.data])

  const activeCfg = settings.data ? getActiveMediaConfig(settings.data) : null

  const enableConfig = useMutation({
    mutationFn: (id: string) => {
      const next = { ...(settings.data as SiteSettings), activeMediaConfigId: id }
      return api.settings.save(next)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['media-github'] })
      setActiveId(data.activeMediaConfigId)
      toast('已启用该图床配置')
    },
    onError: (e) => toast(e instanceof Error ? e.message : '启用失败', 'error'),
  })

  const upload = useMutation({
    mutationFn: async (fileList: FileList) => {
      if (!activeCfg) throw new Error('尚未启用图床，请先在「启用图床」中勾选配置')
      const quality = activeCfg?.quality ?? 80
      const rename = activeCfg?.renameTemplate || '{Y}{m}{d}-{str-6}'
      for (const file of Array.from(fileList)) {
        if (!file.type.startsWith('image/')) continue
        if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name} 超过 20MB`)
        const blob = await compressImage(file, quality)
        const base64 = await blobToBase64(blob)
        const filename = `${resolveRenameTemplate(rename, file.name)}.webp`
        await api.media.githubUpload({
          base64Content: base64,
          filename,
          message: `[skip ci] upload: ${filename}`,
        })
      }
    },
    onSuccess: () => {
      toast('上传完成')
      void listQuery.refetch()
    },
    onError: (e) => toast(e instanceof Error ? e.message : '上传失败', 'error'),
  })

  const configs = settings.data?.mediaConfigs ?? []

  return (
    <div>
      <PageSticky>
        <PageHeader
          icon={<ImageIcon size={20} />}
          title="图床"
          description={
            activeCfg
              ? `当前启用：${activeCfg.name}（${activeCfg.githubOwner}/${activeCfg.githubRepo}）`
              : '尚未启用图床，请在「启用图床」中勾选配置'
          }
          actions={
            <>
              <Button onClick={() => void listQuery.refetch()}>
                <RefreshCw size={14} className="mr-1" />
                刷新
              </Button>
              <label
                className={`${activeCfg ? 'btn-primary cursor-pointer' : 'btn-primary opacity-50 pointer-events-none'}`}
                title={activeCfg ? undefined : '请先启用图床'}
              >
                <Upload size={14} className="mr-1" />
                上传
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
            </>
          }
        />
      </PageSticky>

      <section className="admin-panel">
        <div className="settings-tabs-sticky">
          <Tabs
            items={tabs}
            activeKey={tab}
            onChange={(k) => setTab(k as 'files' | 'config')}
            className="tabs-borderless"
          />
        </div>

        {tab === 'files' ? (
          <div className="settings-body">
            {!listQuery.data?.configured ? (
              <EmptyState
                title="图床不可用"
                description={
                  listQuery.data?.missingHint ||
                  '请到「设置 → 图床」添加配置，并在本页启用'
                }
                actionLabel="去启用"
                onAction={() => setTab('config')}
              />
            ) : !files.length ? (
              <EmptyState title="暂无图片" description="上传或刷新仓库树" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {files.map((file) => (
                  <div
                    key={file.path}
                    className="border border-border-subtle rounded-sm overflow-hidden bg-card"
                  >
                    <img
                      src={file.url}
                      alt={file.name}
                      className="w-full aspect-square object-cover bg-muted"
                      loading="lazy"
                    />
                    <div className="p-2">
                      <div className="text-xs truncate text-foreground">{file.name}</div>
                      <div className="text-xs text-muted-foreground">{formatSize(file.size)}</div>
                      <div className="mt-1 flex gap-2 text-xs">
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={async () => {
                            await navigator.clipboard.writeText(file.url)
                            toast('已复制 URL')
                          }}
                        >
                          <Copy size={11} className="inline mr-0.5" />
                          URL
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={async () => {
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
                              toast('已删除')
                            } catch (e) {
                              toast(e instanceof Error ? e.message : '删除失败', 'error')
                            }
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="settings-body">
            {!configs.length ? (
              <EmptyState
                title="没有可启用的图床"
                description="请先到设置中添加图床配置"
                actionLabel="去设置"
                onAction={() => {
                  window.location.hash = '#/settings'
                }}
              />
            ) : (
              <ul>
                {configs.map((config) => {
                  const checked = activeId === config.id || (!activeId && activeCfg?.id === config.id)
                  return (
                    <li key={config.id} className="flat-list-item flex items-start gap-3">
                      <input
                        type="radio"
                        name="active-media-config"
                        className="mt-1"
                        checked={checked}
                        onChange={() => enableConfig.mutate(config.id)}
                      />
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="font-medium text-foreground">{config.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {config.source === 'github'
                            ? `${config.githubOwner}/${config.githubRepo}@${config.githubBranch} · /${config.pathPrefix}`
                            : '仅外链'}{' '}
                          · CDN {config.cdnProvider}
                        </div>
                      </div>
                      {checked ? (
                        <span className="text-xs px-1.5 py-0.5 border border-border rounded-sm text-foreground bg-card">
                          使用中
                        </span>
                      ) : (
                        <Button
                          className="!px-2 !py-1 text-xs"
                          disabled={enableConfig.isPending}
                          onClick={() => enableConfig.mutate(config.id)}
                        >
                          <Save size={12} className="mr-1" />
                          启用
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
