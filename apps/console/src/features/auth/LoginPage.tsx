/**
 * 登录页。
 *
 * 错误分两类展示：`error.fields` 落到对应输入框下方，其余按 `error.code` 给一句人话。
 * 登录成功直接把返回值写进 me 缓存，省掉一次往返，也让随后的重定向不会闪回未登录态。
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { CircleAlert } from "lucide-react";
import { apiFetch, errorMessage, isApiError } from "@/lib/api";
import type { Me } from "@/lib/types";
import { ME_QUERY_KEY, useAuth } from "@/app/AuthProvider";
import { Button, Checkbox, Field, Input, LoadingBlock } from "@/components/ui";

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const { me, loading, refresh } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setFormError(null);
    setFieldErrors({});
  }, [identifier, password]);

  const login = useMutation({
    mutationFn: (payload: { identifier: string; password: string; remember: boolean }) =>
      apiFetch<Me>("/auth/login", { method: "POST", json: payload, redirectOn401: false }),
    onSuccess: async (data) => {
      queryClient.setQueryData(ME_QUERY_KEY, data);
      void refresh();
      const state = location.state as LocationState | null;
      navigate(state?.from && state.from !== "/login" ? state.from : "/", { replace: true });
    },
    onError: (error) => {
      if (isApiError(error) && Object.keys(error.fields).length > 0) {
        setFieldErrors(error.fields);
        setFormError(error.message);
        return;
      }
      setFieldErrors({});
      setFormError(errorMessage(error));
    },
  });

  if (loading) return <LoadingBlock label="正在校验登录状态" />;
  if (me) return <Navigate to="/" replace />;

  const submit = () => {
    if (!identifier.trim() || !password) {
      setFormError("请填写邮箱（或用户名）与密码");
      return;
    }
    login.mutate({ identifier: identifier.trim(), password, remember });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-accent text-sm font-semibold text-accent-fg">
            太
          </span>
          <div>
            <p className="text-base font-semibold text-fg">太平 CMS</p>
            <p className="text-xs text-muted">后台管理控制台</p>
          </div>
        </div>

        <form
          className="rounded-sm border border-line bg-surface p-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-4">
            <Field label="邮箱或用户名" required error={fieldErrors.identifier} htmlFor="login-identifier">
              <Input
                id="login-identifier"
                value={identifier}
                autoComplete="username"
                autoFocus
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="you@example.com"
              />
            </Field>

            <Field label="密码" required error={fieldErrors.password} htmlFor="login-password">
              <Input
                id="login-password"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            <Checkbox
              label="保持登录（有效期延长至 30 天）"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />

            {formError ? (
              <div className="flex items-start gap-2 rounded-sm border border-danger/35 bg-danger-soft px-3 py-2 text-xs text-danger">
                <CircleAlert size={14} className="mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            ) : null}

            <Button type="submit" variant="primary" loading={login.isPending} className="w-full">
              登录
            </Button>
          </div>
        </form>

        <p className="mt-4 text-center text-xs text-subtle">
          登录凭据通过 HttpOnly Cookie 保存，页面脚本读不到令牌。
        </p>
      </div>
    </div>
  );
}
