/**
 * 账号设置：改自己的密码 + 管理自己的登录设备。
 *
 * 注意一个服务端细节：`GET /api/auth/sessions` 的 `current` 字段是通过比对
 * Bearer 令牌算出来的；本项目后台用 HttpOnly Cookie，所以这里一律显示为 false。
 * 因此界面上不做"当前设备"高亮，只提示"下线后需要重新登录"。
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { apiFetch, errorMessage, isApiError } from "@/lib/api";
import type { LoginSessionInfo } from "@/lib/types";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useAuth } from "@/app/AuthProvider";
import { useConfirm, useToast } from "@/app/providers";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
} from "@/components/ui";

export function AccountPage() {
  const { me, refresh } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sessionsQuery = useQuery<{ items: LoginSessionInfo[] }>({
    queryKey: ["auth-sessions"],
    queryFn: () => apiFetch<{ items: LoginSessionInfo[] }>("/auth/sessions"),
  });

  const passwordMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ revokedSessions: number }>("/auth/password", {
        method: "POST",
        json: { currentPassword, newPassword },
      }),
    onSuccess: (result) => {
      toast.success(`密码已修改，其它 ${result.revokedSessions} 个会话已被下线`);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setErrors({});
      void refresh();
      void queryClient.invalidateQueries({ queryKey: ["auth-sessions"] });
    },
    onError: (error) => {
      if (isApiError(error) && Object.keys(error.fields).length > 0) setErrors(error.fields);
      toast.error(errorMessage(error));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiFetch<{ revoked: boolean }>(`/auth/sessions/${id}`, { method: "DELETE" }),
    onSuccess: (result) => {
      toast.success(result.revoked ? "该设备已下线" : "该会话已经失效");
      void queryClient.invalidateQueries({ queryKey: ["auth-sessions"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;

  return (
    <>
      <PageHeader title="账号设置" description="修改自己的登录密码，查看并下线登录设备。" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="账号信息" description="角色由管理员分配，个人无法自行调整。" />
          <dl className="divide-y divide-line text-sm">
            {[
              ["显示名", me?.displayName ?? "—"],
              ["邮箱", me?.email ?? "—"],
              ["用户名", me?.username ?? "—"],
              ["身份", me?.isSuperAdmin ? "站点所有者" : "普通账号"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-muted">{label}</dt>
                <dd className="truncate font-mono text-xs text-fg">{value}</dd>
              </div>
            ))}
            <div className="flex items-start justify-between gap-3 px-4 py-2.5">
              <dt className="text-muted">角色</dt>
              <dd className="flex flex-wrap justify-end gap-1">
                {(me?.roles ?? []).map((role) => (
                  <Badge key={role} tone={role === "owner" ? "accent" : "neutral"}>
                    {role}
                  </Badge>
                ))}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <dt className="text-muted">权限数</dt>
              <dd className="text-xs text-fg">{me?.permissions.length ?? 0} 项</dd>
            </div>
          </dl>
          {me?.mustChangePassword ? (
            <p className="border-t border-line px-4 py-3 text-xs text-warn">
              管理员要求你修改密码，改完后该标记会自动清除。
            </p>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="修改密码"
            description="改密会吊销该账号在其它设备上的全部会话，并重新签发当前会话。"
          />
          <form
            className="flex flex-col gap-4 px-4 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (mismatch) return;
              passwordMutation.mutate();
            }}
          >
            <Field label="当前密码" required error={errors.currentPassword}>
              <Input
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
            <Field label="新密码" required error={errors.newPassword} hint="长度下限由站点设置里的密码策略决定。">
              <Input
                type="password"
                value={newPassword}
                autoComplete="new-password"
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </Field>
            <Field
              label="确认新密码"
              required
              error={mismatch ? "两次输入不一致" : undefined}
            >
              <Input
                type="password"
                value={confirmPassword}
                autoComplete="new-password"
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              icon={<ShieldCheck size={14} />}
              loading={passwordMutation.isPending}
              disabled={!currentPassword || !newPassword || mismatch}
            >
              修改密码
            </Button>
          </form>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="登录设备"
          description="最多显示最近 50 个未撤销的会话。"
          actions={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void queryClient.invalidateQueries({ queryKey: ["auth-sessions"] })}
            >
              刷新
            </Button>
          }
        />
        {sessionsQuery.isLoading ? (
          <LoadingBlock label="加载会话" />
        ) : sessionsQuery.isError ? (
          <EmptyState kind="error" description={errorMessage(sessionsQuery.error)} />
        ) : (sessionsQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState kind="empty" description="没有有效的登录会话。" />
        ) : (
          <ul className="divide-y divide-line">
            {sessionsQuery.data?.items.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-line bg-sunken text-muted">
                  <MonitorSmartphone size={15} strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{session.userAgent ?? "未知客户端"}</p>
                  <p className="truncate text-xs text-subtle">
                    IP {session.ip ?? "未知"} · 登录于 {formatDateTime(session.createdAt)} · 有效期至{" "}
                    {formatDateTime(session.expiresAt)}
                  </p>
                </div>
                <Badge>{formatRelative(session.createdAt)}</Badge>
                {session.current ? <Badge tone="accent">当前设备</Badge> : null}
                <Button
                  size="sm"
                  variant="danger"
                  icon={<LogOut size={13} />}
                  loading={revokeMutation.isPending && revokeMutation.variables === session.id}
                  onClick={async () => {
                    const ok = await confirm({
                      title: "下线这个会话？",
                      description: "如果它正好是当前设备，你会被立刻登出，需要重新登录。",
                      confirmText: "下线",
                      tone: "danger",
                    });
                    if (ok) revokeMutation.mutate(session.id);
                  }}
                >
                  下线
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-line px-4 py-3 text-xs text-subtle">
          凭证保存在 HttpOnly Cookie 中，页面脚本读不到，因此无法在此精确标记"当前设备"。
        </p>
      </Card>
    </>
  );
}
