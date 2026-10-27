/**
 * 侧边栏导航配置。
 *
 * 每一项声明自己需要的权限键；`permission` 为空表示所有登录用户可见。
 * 界面只做"显隐"，不做"禁用"—— 看不到的入口比灰色的入口更容易理解，
 * 真正的拦截仍在服务端 `assertCan`（R4）。
 */
import {
  Blocks,
  FileText,
  LayoutDashboard,
  Menu as MenuIcon,
  MessageSquare,
  Image as ImageIcon,
  Puzzle,
  ScrollText,
  Settings as SettingsIcon,
  ShieldCheck,
  Tags,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface ConsoleNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** 需要的权限键；省略表示无需额外权限。 */
  permission?: string;
  /** 命中该前缀即视为选中（用于详情页高亮父菜单）。 */
  matchPrefix?: string;
}

export interface ConsoleNavGroup {
  label: string;
  items: ConsoleNavItem[];
}

export const CONSOLE_NAV: ConsoleNavGroup[] = [
  {
    label: "概览",
    items: [{ to: "/", label: "仪表盘", icon: LayoutDashboard, permission: "content.read" }],
  },
  {
    label: "内容",
    items: [
      { to: "/contents", label: "内容", icon: FileText, permission: "content.read", matchPrefix: "/contents" },
      { to: "/terms", label: "分类与标签", icon: Tags, permission: "term.read" },
      { to: "/comments", label: "评论", icon: MessageSquare, permission: "comment.read" },
      { to: "/media", label: "媒体库", icon: ImageIcon, permission: "media.read" },
    ],
  },
  {
    label: "站点",
    items: [
      { to: "/fields", label: "内容模型", icon: Blocks, permission: "field.read" },
      { to: "/nav", label: "导航", icon: MenuIcon, permission: "nav.read" },
      { to: "/plugins", label: "插件", icon: Puzzle, permission: "plugin.read" },
      { to: "/settings", label: "系统设置", icon: SettingsIcon, permission: "setting.read" },
    ],
  },
  {
    label: "权限",
    items: [
      { to: "/users", label: "用户", icon: Users, permission: "user.read" },
      { to: "/roles", label: "角色与权限", icon: ShieldCheck, permission: "role.read" },
    ],
  },
  {
    label: "系统",
    items: [{ to: "/audit", label: "审计日志", icon: ScrollText, permission: "system.audit.read" }],
  },
  {
    label: "个人",
    items: [{ to: "/account", label: "账号设置", icon: UserRound }],
  },
];

/** 按权限过滤后的导航；没有任何可见项的分组直接去掉，避免留下空标题。 */
export function visibleNavGroups(can: (permission: string) => boolean): ConsoleNavGroup[] {
  return CONSOLE_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || can(item.permission)),
  })).filter((group) => group.items.length > 0);
}
