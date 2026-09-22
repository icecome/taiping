import type { ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  FileText,
  Home,
  LogOut,
  MessageSquare,
  MessageCircle,
  Palette,
  Search,
  Settings,
  Tags,
  User,
  Image,
  Layout,
} from 'lucide-react'
import { api } from '../../api/endpoints'
import { ToastHost } from '../ui/Toast'
import { ConfirmDialogHost } from '../ui/ConfirmDialog'
import { menuItems } from '../../features/registry'

const groupOrder: Array<'overview' | 'contents' | 'appearance' | 'system'> = [
  'overview',
  'contents',
  'appearance',
  'system',
]
const groupLabels: Record<string, string> = {
  overview: '',
  contents: '内容',
  appearance: '外观',
  system: '系统',
}

const iconMap: Record<string, ReactNode> = {
  '/': <Home size={16} />,
  '/posts': <BookOpen size={16} />,
  '/pages': <FileText size={16} />,
  '/moments': <MessageSquare size={16} />,
  '/comments': <MessageCircle size={16} />,
  '/taxonomy': <Tags size={16} />,
  '/media': <Image size={16} />,
  '/settings': <Settings size={16} />,
  '/theme': <Palette size={16} />,
}

/* 移动端底栏 5 项核心导航 */
const mobileNavItems = [
  { to: '/', label: '概览', icon: <Home size={18} /> },
  { to: '/posts', label: '文章', icon: <BookOpen size={18} /> },
  { to: '/moments', label: '说说', icon: <MessageSquare size={18} /> },
  { to: '/comments', label: '评论', icon: <MessageCircle size={18} /> },
  { to: '/settings', label: '设置', icon: <User size={18} /> },
]

export function AppShell() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const logout = useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      queryClient.clear()
      navigate('/login', { replace: true })
    },
  })

  return (
    <div className="admin-shell bg-background">
      {/* 侧边栏 */}
      <aside className="admin-sidebar border-r border-border bg-card overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b border-border-subtle">
          <div className="text-base font-semibold text-foreground tracking-wide">太平后台</div>
          <div className="mt-2 flex items-center gap-2 px-2 py-1.5 border border-border rounded bg-secondary text-muted-foreground">
            <Search size={14} />
            <span className="text-xs">搜索</span>
            <span className="ml-auto text-xs border border-border-subtle px-1 rounded bg-card">
              Ctrl K
            </span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-4">
          {groupOrder.map((g) => {
            const items = menuItems.filter((m) => m.group === g)
            if (!items.length) return null
            return (
              <div key={g}>
                {groupLabels[g] ? (
                  <div className="px-3 mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                    {groupLabels[g] ?? g}
                  </div>
                ) : null}
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        `nav-item ${isActive ? 'nav-item-active' : ''}`
                      }
                    >
                      {iconMap[item.to] ?? <Layout size={16} />}
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>
        <div className="border-t border-border-subtle px-3 py-3 flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-secondary border border-border flex items-center justify-center text-xs text-muted-foreground">
            管
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-foreground truncate">Administrator</div>
            <div className="text-xs text-muted-foreground">管理员</div>
          </div>
          <button
            type="button"
            className="w-9 h-9 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
            title="退出登录"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <div className="admin-main">
        <div className="admin-content">
          <div className="admin-inner">
            <Outlet />
          </div>
        </div>
      </div>

      {/* 移动端底栏导航 */}
      <nav className="mobile-nav">
        {mobileNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `mobile-nav-item ${isActive ? 'active' : ''}`
            }
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <ToastHost />
      <ConfirmDialogHost />
    </div>
  )
}
