import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Settings } from 'lucide-react'
import {
  settingGroupLabels,
  type SettingGroup,
  type SiteSettings,
} from '@taiping/content-model/settings'
import { api } from '../api/endpoints'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { LoadingState } from '../components/ui/LoadingState'
import { Tabs } from '../components/ui/Tabs'
import { SettingGroupFields } from '../components/form/SettingFields'
import { PasswordPanel } from '../components/form/PasswordPanel'
import { MediaConfigManager } from '../components/media/MediaConfigManager'
import { toast } from '../lib/toast'
import { HttpError } from '../api/client'
import { PageSticky } from '../components/layout/PageSticky'

const groups: SettingGroup[] = ['basic', 'reading', 'comments', 'appearance', 'media']

/** 「账号」不是站点设置分组，而是独立的管理入口，故单独作为页签 */
type TabKey = SettingGroup | 'account'

const tabItems = [
  ...groups.map((g) => ({ key: g as TabKey, label: settingGroupLabels[g] })),
  { key: 'account' as TabKey, label: '账号' },
]

export function SettingsPage() {
  const queryClient = useQueryClient()
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  })
  const [form, setForm] = useState<SiteSettings | null>(null)
  const [tab, setTab] = useState<TabKey>('basic')

  useEffect(() => {
    if (settings.data) setForm(settings.data)
  }, [settings.data])

  const save = useMutation({
    mutationFn: () => api.settings.save(form as SiteSettings),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['media-github'] })
      setForm(data)
      toast('设置已保存')
    },
    onError: (err) => {
      toast(err instanceof HttpError ? err.message : '保存失败', 'error')
    },
  })

  const isAccount = tab === 'account'

  // 账号页签不依赖站点设置，故不因 settings 未加载而阻塞
  if (!isAccount && !form) {
    return <LoadingState rows={3} />
  }

  return (
    <div>
      <PageSticky>
        <PageHeader
          icon={<Settings size={20} />}
          title="站点设置"
          description={isAccount ? '修改管理员登录口令' : '管理站点全局配置'}
          actions={
            isAccount ? undefined : (
              <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
                保存设置
              </Button>
            )
          }
        />
      </PageSticky>

      <section className="admin-panel">
        <div className="settings-tabs-sticky">
          <Tabs
            items={tabItems}
            activeKey={tab}
            onChange={(k) => setTab(k as TabKey)}
            className="settings-tabs tabs-borderless"
          />
        </div>
        <div className="settings-body">
          {isAccount ? (
            <PasswordPanel />
          ) : tab === 'media' && form ? (
            <MediaConfigManager form={form} onChange={setForm} />
          ) : form ? (
            <SettingGroupFields
              group={tab as SettingGroup}
              form={form}
              onChange={(name, value) =>
                setForm((prev) => (prev ? ({ ...prev, [name]: value } as SiteSettings) : prev))
              }
            />
          ) : null}
        </div>
      </section>
    </div>
  )
}
