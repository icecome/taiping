/**
 * 路由表。
 *
 * basename 固定为 `/admin`：生产环境后台挂在 /admin 下，而 Vite 的 `base` 是 `/`
 * （静态资源从根路径加载），所以只给路由加 basename，不碰构建配置。
 */
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "@/app/AppLayout";
import { RequireAuth, RequirePermission } from "@/app/RouteGuards";
import { Button, EmptyState } from "@/components/ui";
import { LoginPage } from "@/features/auth/LoginPage";
import { AccountPage } from "@/features/auth/AccountPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { ContentListPage } from "@/features/contents/ContentListPage";
import { ContentEditPage } from "@/features/contents/ContentEditPage";
import { TermsPage } from "@/features/terms/TermsPage";
import { CommentsPage } from "@/features/comments/CommentsPage";
import { MediaPage } from "@/features/media/MediaPage";
import { UsersPage } from "@/features/users/UsersPage";
import { RolesPage } from "@/features/roles/RolesPage";
import { FieldsPage } from "@/features/fields/FieldsPage";
import { NavPage } from "@/features/nav/NavPage";
import { PluginsPage } from "@/features/plugins/PluginsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { AuditPage } from "@/features/audit/AuditPage";

function NotFound() {
  return (
    <div className="rounded-sm border border-line bg-surface">
      <EmptyState
        kind="empty"
        title="页面不存在"
        description="地址可能已变更，或者你输错了路径。"
        action={
          <Button variant="default" onClick={() => window.location.assign("/admin")}>
            回到仪表盘
          </Button>
        }
      />
    </div>
  );
}

export const router = createBrowserRouter(
  [
    { path: "/login", element: <LoginPage /> },
    {
      path: "/",
      element: (
        <RequireAuth>
          <AppLayout />
        </RequireAuth>
      ),
      handle: { title: "控制台" },
      children: [
        {
          index: true,
          element: (
            <RequirePermission permission="content.read">
              <DashboardPage />
            </RequirePermission>
          ),
          handle: { title: "仪表盘" },
        },
        {
          path: "contents",
          element: (
            <RequirePermission permission="content.read">
              <ContentListPage />
            </RequirePermission>
          ),
          handle: { title: "内容" },
        },
        {
          path: "contents/new",
          element: (
            <RequirePermission permission="content.create">
              <ContentEditPage />
            </RequirePermission>
          ),
          handle: { title: "新建内容" },
        },
        {
          path: "contents/:id",
          element: (
            <RequirePermission permission={["content.update.own", "content.update.any"]}>
              <ContentEditPage />
            </RequirePermission>
          ),
          handle: { title: "编辑内容" },
        },
        {
          path: "terms",
          element: (
            <RequirePermission permission="term.read">
              <TermsPage />
            </RequirePermission>
          ),
          handle: { title: "分类与标签" },
        },
        {
          path: "comments",
          element: (
            <RequirePermission permission="comment.read">
              <CommentsPage />
            </RequirePermission>
          ),
          handle: { title: "评论" },
        },
        {
          path: "media",
          element: (
            <RequirePermission permission="media.read">
              <MediaPage />
            </RequirePermission>
          ),
          handle: { title: "媒体库" },
        },
        {
          path: "users",
          element: (
            <RequirePermission permission="user.read">
              <UsersPage />
            </RequirePermission>
          ),
          handle: { title: "用户" },
        },
        {
          path: "roles",
          element: (
            <RequirePermission permission="role.read">
              <RolesPage />
            </RequirePermission>
          ),
          handle: { title: "角色与权限" },
        },
        {
          path: "fields",
          element: (
            <RequirePermission permission="field.read">
              <FieldsPage />
            </RequirePermission>
          ),
          handle: { title: "内容模型" },
        },
        {
          path: "nav",
          element: (
            <RequirePermission permission="nav.read">
              <NavPage />
            </RequirePermission>
          ),
          handle: { title: "导航" },
        },
        {
          path: "plugins",
          element: (
            <RequirePermission permission="plugin.read">
              <PluginsPage />
            </RequirePermission>
          ),
          handle: { title: "插件" },
        },
        {
          path: "settings",
          element: (
            <RequirePermission permission="setting.read">
              <SettingsPage />
            </RequirePermission>
          ),
          handle: { title: "系统设置" },
        },
        {
          path: "audit",
          element: (
            <RequirePermission permission="system.audit.read">
              <AuditPage />
            </RequirePermission>
          ),
          handle: { title: "审计日志" },
        },
        { path: "account", element: <AccountPage />, handle: { title: "账号设置" } },
        { path: "*", element: <NotFound /> },
      ],
    },
    { path: "*", element: <Navigate to="/" replace /> },
  ],
  { basename: "/admin" },
);
