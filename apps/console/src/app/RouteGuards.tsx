/**
 * 路由守卫。
 *
 * 两层：先确认"登录了没有"（未登录整站跳登录页），再看"这个模块能不能看"。
 * 权限不足时不跳转而是就地渲染「无权限」空状态 —— 菜单里本来就不会出现这个入口，
 * 能走到这里通常是手输 URL 或权限刚被回收，就地说明比静默重定向更容易排查。
 */
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { EmptyState, LoadingBlock } from "@/components/ui";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading, loadError } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingBlock label="正在校验登录状态" />;

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-sm border border-line bg-surface">
          <EmptyState
            kind="error"
            title="无法连接服务端"
            description={`${loadError.message}。确认后端已在 8787 端口运行后刷新页面。`}
          />
        </div>
      </div>
    );
  }

  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;

  return <>{children}</>;
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: string | string[];
  children: ReactNode;
}) {
  const { can, canAny } = useAuth();
  const allowed = Array.isArray(permission) ? canAny(permission) : can(permission);
  if (!allowed) {
    return (
      <div className="rounded-sm border border-line bg-surface">
        <EmptyState
          kind="forbidden"
          description="当前账号没有访问该模块的权限。如果这是误判，请让站点所有者检查角色配置。"
        />
      </div>
    );
  }
  return <>{children}</>;
}
