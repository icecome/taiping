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
import { MediaConfigManager } from '../components/media/MediaConfigManager'
import { toast } from '../lib/toast'
import { HttpError } from '../api/client'
import { PageSticky } from '../components/layout/PageSticky'

const groups: SettingGroup[] = ['basic', 'reading', 'comments', 'appearance', 'media']
const tabItems = groups.map((g) => ({ key: g, label: settingGroupLabels[g] }))

export function SettingsPage() {
  const queryClient = useQueryClient()
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  })
  const [form, setForm] = useState<SiteSettings | null>(null)
  const [tab, setTab] = useState<SettingGroup>('basic')

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

  if (!form) {
    return <LoadingState rows={3} />
  }

  return (
    <div>
      <PageSticky>
        <PageHeader
          icon={<Settings size={20} />}
          title="站点设置"
          description="管理站点全局配置"
          actions={
            <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
              保存设置
            </Button>
          }
        />
      </PageSticky>

      <section className="admin-panel">
        <div className="settings-tabs-sticky">
          <Tabs
            items={tabItems}
            activeKey={tab}
            onChange={(k) => setTab(k as SettingGroup)}
            className="settings-tabs tabs-borderless"
          />
        </div>
        <div className="settings-body">
          {tab === 'media' ? (
            <MediaConfigManager form={form} onChange={setForm} />
          ) : (
            <SettingGroupFields
              group={tab}
              form={form}
              onChange={(name, value) =>
                setForm((prev) => (prev ? ({ ...prev, [name]: value } as SiteSettings) : prev))
              }
            />
          )}
        </div>
      </section>
    </div>
  )
}
