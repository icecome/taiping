/**
 * 后台入口。
 *
 * Provider 顺序有依赖：查询客户端必须在最外层（AuthProvider 用它做 me 缓存），
 * 提示与确认要在 RouterProvider 之外（页面里的 useToast/useConfirm 才能拿到），
 * 主题模式在最前面，避免首帧闪一下亮色。
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "@/app/AuthProvider";
import { ConfirmProvider, ThemeModeProvider, ToastProvider } from "@/app/providers";
import { router } from "@/router";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

const container = document.getElementById("root");
if (!container) throw new Error("找不到 #root 挂载点");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <RouterProvider router={router} />
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeModeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
