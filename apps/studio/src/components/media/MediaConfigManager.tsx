import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  createMediaConfig,
  mediaConfigFields,
  type MediaStorageConfig,
  type SiteSettings,
} from '@taiping/content-model/settings'
import { Button } from '../ui/Button'
import { confirmDialog } from '../ui/ConfirmDialog'

interface Props {
  form: SiteSettings
  onChange: (next: SiteSettings) => void
}

export function MediaConfigManager({ form, onChange }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState<MediaStorageConfig>(() =>
    createMediaConfig({ name: 'GitHub 图床' }),
  )
  const configs = form.mediaConfigs

  const addConfig = () => {
    if (!draft.name.trim()) return
    const next = createMediaConfig({ ...draft, name: draft.name.trim() })
    onChange({
      ...form,
      mediaConfigs: [...configs, next],
      activeMediaConfigId: form.activeMediaConfigId || next.id,
    })
    setShowForm(false)
    setDraft(createMediaConfig({ name: `图床 ${configs.length + 2}` }))
  }

  const updateConfig = (id: string, patch: Partial<MediaStorageConfig>) => {
    onChange({
      ...form,
      mediaConfigs: configs.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })
  }

  const commitRemove = (id: string) => {
    const rest = configs.filter((c) => c.id !== id)
    const activeId = form.activeMediaConfigId === id ? (rest[0]?.id ?? '') : form.activeMediaConfigId
    onChange({ ...form, mediaConfigs: rest, activeMediaConfigId: activeId })
  }

  const removeConfig = (id: string) => {
    const target = configs.find((c) => c.id === id)
    const inUse = form.activeMediaConfigId === id
    const name = target?.name ?? '该配置'
    void (async () => {
      const ok = await confirmDialog({
        title: `删除「${name}」？`,
        description: inUse
          ? '该配置正在使用中，删除后将自动切换到其他配置。'
          : '删除后无法恢复。',
        confirmLabel: '删除',
        danger: true,
      })
      if (!ok) return
      commitRemove(id)
    })()
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        勾选启用请到「图床」页。
      </div>

      {showForm && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground">添加图床配置</h3>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-sm"
              onClick={() => setShowForm(false)}
              aria-label="收起"
            >
              收起
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 text-sm">
            {mediaConfigFields.map((field) => {
              const value = draft[field.name]
              if (field.control === 'select') {
                return (
                  <label key={String(field.name)} className="block">
                    <span className="text-muted-foreground text-xs">{field.label}</span>
                    <select
                      className="input-ink mt-1"
                      value={String(value ?? '')}
                      onChange={(e) => setDraft({ ...draft, [field.name]: e.target.value } as MediaStorageConfig)}
                    >
                      {field.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              }
              if (field.control === 'number') {
                return (
                  <label key={String(field.name)} className="block">
                    <span className="text-muted-foreground text-xs">{field.label}</span>
                    <input
                      type="number"
                      className="input-ink mt-1"
                      value={Number(value ?? 0)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          [field.name]: Number(e.target.value) || 0,
                        } as MediaStorageConfig)
                      }
                    />
                  </label>
                )
              }
              return (
                <label key={String(field.name)} className="block">
                  <span className="text-muted-foreground text-xs">{field.label}</span>
                  <input
                    className="input-ink mt-1"
                    placeholder={field.placeholder}
                    value={String(value ?? '')}
                    onChange={(e) =>
                      setDraft({ ...draft, [field.name]: e.target.value } as MediaStorageConfig)
                    }
                  />
                </label>
              )
            })}
          </div>
          <div className="mt-3">
            <Button variant="primary" onClick={addConfig}>
              <Plus size={14} className="mr-1" />
              添加配置
            </Button>
          </div>
        </section>
      )}

      {!showForm && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-foreground">
              图床列表（{configs.length}）
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(true)}>
              <Plus size={14} className="mr-1" />
              新建图床
            </Button>
          </div>
          {!configs.length ? (
            <p className="text-sm text-muted-foreground">尚未添加图床配置</p>
          ) : (
            <ul>
              {configs.map((config) => (
                <li key={config.id} className="flat-list-item">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <input
                        className="input-ink !py-1 font-medium"
                        value={config.name}
                        onChange={(e) => updateConfig(config.id, { name: e.target.value })}
                      />
                      <div className="mt-2 grid gap-3 md:grid-cols-2 text-sm">
                        <label className="block">
                          <span className="text-xs text-muted-foreground">Owner</span>
                          <input
                            className="input-ink mt-1"
                            value={config.githubOwner}
                            onChange={(e) => updateConfig(config.id, { githubOwner: e.target.value })}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-muted-foreground">仓库</span>
                          <input
                            className="input-ink mt-1"
                            value={config.githubRepo}
                            onChange={(e) => updateConfig(config.id, { githubRepo: e.target.value })}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-muted-foreground">分支</span>
                          <input
                            className="input-ink mt-1"
                            value={config.githubBranch}
                            onChange={(e) => updateConfig(config.id, { githubBranch: e.target.value })}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-muted-foreground">目录</span>
                          <input
                            className="input-ink mt-1"
                            value={config.pathPrefix}
                            onChange={(e) => updateConfig(config.id, { pathPrefix: e.target.value })}
                          />
                        </label>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {config.githubOwner}/{config.githubRepo}@{config.githubBranch} · {config.cdnProvider}
                      </div>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      className="shrink-0"
                      onClick={() => removeConfig(config.id)}
                      aria-label="删除配置"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
