/**
 * 登录态上下文。
 *
 * 启动时用 `GET /api/auth/me` 探活（关掉 401 自动跳转，避免未登录时页面反复重定向）：
 * 401 就是"未登录"，其它错误才当异常。
 * 权限判定只读 `me.permissions`，owner 由 isSuperAdmin 短路放行 —— 与服务端 rbac 语义一致。
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, isApiError } from "@/lib/api";
import type { Me } from "@/lib/types";

export const ME_QUERY_KEY = ["me"] as const;

interface AuthContextValue {
  me: Me | null;
  loading: boolean;
  /** 探活失败且不是 401（例如服务未启动），用来区分"未登录"与"连不上"。 */
  loadError: Error | null;
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
  isOwner: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery<Me | null>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        return await apiFetch<Me>("/auth/me", { redirectOn401: false });
      } catch (error) {
        if (isApiError(error) && (error.status === 401 || error.code === "UNAUTHORIZED")) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 30_000,
  });

  const me = meQuery.data ?? null;

  const logoutMutation = useMutation({
    mutationFn: () => apiFetch<{ loggedOut: boolean }>("/auth/logout", { method: "POST" }),
    onSettled: () => {
      queryClient.setQueryData(ME_QUERY_KEY, null);
      queryClient.clear();
    },
  });

  const isOwner = me?.isSuperAdmin === true || me?.roles.includes("owner") === true;

  const can = useCallback(
    (permission: string) => {
      if (!me) return false;
      if (isOwner) return true;
      return me.permissions.includes(permission);
    },
    [me, isOwner],
  );

  const canAny = useCallback(
    (permissions: string[]) => permissions.some((permission) => can(permission)),
    [can],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  }, [queryClient]);

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      loading: meQuery.isLoading,
      loadError: meQuery.error instanceof Error ? meQuery.error : null,
      can,
      canAny,
      isOwner,
      refresh,
      logout,
    }),
    [me, meQuery.isLoading, meQuery.error, can, canAny, isOwner, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return context;
}

/** 单独取当前用户，派生出登录态判断时不至于把 loading 当成未登录。 */
export function useMe(): Me | null {
  return useAuth().me;
}
