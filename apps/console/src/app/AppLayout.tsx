/**
 * 后台外壳：左侧固定侧边栏 + 顶部面包屑与操作区 + 主区域滚动。
 *
 * 移动端（< 768px）侧边栏变成抽屉：同一个 DOM 结构切换定位方式，
 * 这样菜单项只维护一份，不需要为移动端再写一遍列表。
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useMatches } from "react-router-dom";
import { ChevronDown, LogOut, Menu as MenuIcon, Monitor, Moon, PanelLeft, Sun, UserRound, X } from "lucide-react";
import { useAuth } from "@/app/AuthProvider";
import { visibleNavGroups } from "@/app/nav-config";
import { useThemeMode, type ThemeMode } from "@/app/providers";
import { cn } from "@/lib/cn";
import { Badge, IconButton } from "@/components/ui";

const SIDEBAR_STORAGE_KEY = "taiping.console.sidebar";

export function AppLayout() {
  const { me, can, logout } = useAuth();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "collapsed";
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
    } catch {
      /* 忽略：仅影响下次打开时的默认状态 */
    }
  }, [collapsed]);

  // 路由变化时收起移动端抽屉，避免点击菜单后抽屉还挡着内容。
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const groups = visibleNavGroups(can);

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* 移动端抽屉遮罩 */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          role="presentation"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-line bg-surface transition-[width,transform] duration-150",
          collapsed ? "w-14" : "w-56",
          drawerOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
          <Link to="/" className="flex min-w-0 items-center gap-2" aria-label="回到仪表盘">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs bg-accent text-xs font-semibold text-accent-fg">
              太
            </span>
            {!collapsed ? <span className="truncate text-sm font-semibold text-fg">太平 CMS</span> : null}
          </Link>
          <div className="ml-auto flex items-center">
            <span className="md:hidden">
              <IconButton label="关闭菜单" onClick={() => setDrawerOpen(false)}>
                <X size={15} />
              </IconButton>
            </span>
            <span className="hidden md:inline-flex">
              <IconButton
                label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
                onClick={() => setCollapsed((value) => !value)}
              >
                <PanelLeft size={15} />
              </IconButton>
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-4">
              {collapsed ? (
                <div className="mx-2 mb-2 border-t border-line" />
              ) : (
                <p className="mb-1 px-2 text-xs font-medium tracking-wide text-subtle">{group.label}</p>
              )}
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active =
                    item.to === "/"
                      ? location.pathname === "/"
                      : location.pathname.startsWith(item.matchPrefix ?? `/${item.to.split("/")[1]}`);
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xs px-2 py-1.5 text-sm transition-colors",
                          active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-hover hover:text-fg",
                          collapsed && "justify-center px-0",
                        )}
                      >
                        <Icon size={16} strokeWidth={1.75} className="shrink-0" />
                        {!collapsed ? <span className="truncate">{item.label}</span> : null}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <SidebarFooter collapsed={collapsed} displayName={me?.displayName ?? ""} onLogout={logout} />
      </aside>

      <div className={cn("flex min-w-0 flex-1 flex-col transition-[margin] duration-150", collapsed ? "md:ml-14" : "md:ml-56")}>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur">
          <span className="md:hidden">
            <IconButton label="打开菜单" onClick={() => setDrawerOpen(true)}>
              <MenuIcon size={17} />
            </IconButton>
          </span>
          <Breadcrumbs />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserMenu displayName={me?.displayName ?? ""} email={me?.email ?? ""} roles={me?.roles ?? []} onLogout={logout} />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6">
          <div className="mx-auto w-full max-w-[1180px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 面包屑 */

interface RouteHandle {
  title?: string;
  parent?: string;
}

function Breadcrumbs() {
  const matches = useMatches();
  const crumbs: { title: string; parent?: string }[] = [];
  for (const match of matches) {
    const handle = match.handle as RouteHandle | undefined;
    if (handle?.title) crumbs.push({ title: handle.title, parent: handle.parent });
  }

  if (crumbs.length === 0) return <div className="min-w-0" />;

  return (
    <nav aria-label="面包屑" className="flex min-w-0 items-center gap-1.5 text-sm">
      {crumbs.map((crumb, index) => (
        <span key={`${crumb.title}-${index}`} className="flex min-w-0 items-center gap-1.5">
          {index > 0 ? <span className="text-subtle">/</span> : null}
          {crumb.parent && index === 0 ? (
            <>
              <span className="hidden text-muted sm:inline">{crumb.parent}</span>
              <span className="hidden text-subtle sm:inline">/</span>
            </>
          ) : null}
          <span className={cn("truncate", index === crumbs.length - 1 ? "font-medium text-fg" : "text-muted")}>
            {crumb.title}
          </span>
        </span>
      ))}
    </nav>
  );
}

/* ---------------------------------------------------------------- 主题切换 */

const THEME_ORDER: ThemeMode[] = ["light", "dark", "system"];

function ThemeToggle() {
  const { mode, setMode } = useThemeMode();
  const next = THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length];
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  const label = mode === "light" ? "亮色" : mode === "dark" ? "暗色" : "跟随系统";
  return (
    <IconButton label={`外观：${label}（点击切换到 ${next === "light" ? "亮色" : next === "dark" ? "暗色" : "跟随系统"}）`} onClick={() => setMode(next)}>
      <Icon size={16} strokeWidth={1.75} />
    </IconButton>
  );
}

/* ---------------------------------------------------------------- 用户菜单 */

function UserMenu({
  displayName,
  email,
  roles,
  onLogout,
}: {
  displayName: string;
  email: string;
  roles: string[];
  onLogout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-sm border border-transparent px-1.5 py-1 text-sm text-fg transition-colors hover:border-line hover:bg-hover"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent">
          {displayName.slice(0, 1) || "?"}
        </span>
        <span className="hidden max-w-28 truncate sm:inline">{displayName}</span>
        <ChevronDown size={14} className="text-subtle" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-60 rounded-sm border border-line bg-surface py-1 shadow-md"
        >
          <div className="border-b border-line px-3 py-2">
            <p className="truncate text-sm font-medium text-fg">{displayName}</p>
            <p className="truncate text-xs text-muted">{email}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {roles.map((role) => (
                <Badge key={role} tone="neutral">
                  {role}
                </Badge>
              ))}
            </div>
          </div>
          <Link
            to="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-fg transition-colors hover:bg-hover"
          >
            <UserRound size={15} strokeWidth={1.75} />
            账号设置
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onLogout();
                window.location.assign("/admin/login");
              } finally {
                setBusy(false);
              }
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-hover disabled:opacity-60"
          >
            <LogOut size={15} strokeWidth={1.75} />
            退出登录
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SidebarFooter({
  collapsed,
  displayName,
  onLogout,
}: {
  collapsed: boolean;
  displayName: string;
  onLogout: () => Promise<void>;
}) {
  return (
    <div className="shrink-0 border-t border-line p-2">
      <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
        {collapsed ? (
          <IconButton label={`退出登录（${displayName}）`} onClick={() => void onLogout()}>
            <LogOut size={15} strokeWidth={1.75} />
          </IconButton>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate px-1 text-xs text-subtle">{displayName}</span>
            <IconButton label="退出登录" onClick={() => void onLogout()}>
              <LogOut size={15} strokeWidth={1.75} />
            </IconButton>
          </>
        )}
      </div>
    </div>
  );
}

/** 供页面在标题区插入右侧操作（预留的插槽组件，避免每页自己写 flex 布局）。 */
export function HeaderActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
