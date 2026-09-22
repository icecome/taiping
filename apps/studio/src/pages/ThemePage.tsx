import { Palette } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel } from '../components/ui/Panel'
import { PageSticky } from '../components/layout/PageSticky'

const rows: Array<{ label: string; value: string }> = [
  { label: 'ID', value: 'theme-zhuosu' },
  { label: '名称', value: '拙素 Zhuosu' },
  { label: '描述', value: '复刻拙素主题的 TSX 实现，构建期打包进 Worker' },
  { label: '作者', value: 'taiping_blog' },
  { label: '版本', value: '0.1.0' },
  { label: '技术栈', value: 'Hono JSX + 静态 CSS/JS' },
  { label: '协议', value: '项目内主题包' },
  { label: '存储位置', value: 'themes/zhuosu（构建产物随 edge 部署）' },
  { label: '切换方式', value: '构建期选择主题包，不支持运行时在线切换' },
]

export function ThemePage() {
  return (
    <div className="space-y-4">
      <PageSticky>
        <PageHeader
          icon={<Palette size={20} />}
          title="主题"
          description="当前启用的前台主题（只读）"
          actions={
            <a className="btn-ghost" href="/" target="_blank" rel="noreferrer">
              预览站点
            </a>
          }
        />
      </PageSticky>
      <Panel title="主题信息" description="与站点外观相关的配置请到「设置 → 外观」">
        <dl className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start gap-6 py-3 text-sm">
              <dt className="w-28 shrink-0 text-muted-foreground">{row.label}</dt>
              <dd className="text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  )
}
