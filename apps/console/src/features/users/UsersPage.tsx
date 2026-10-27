/**
 * 用户管理。
 *
 * 四种写操作各自独立（资料 / 密码 / 角色 / 状态），因为它们触发的副作用不同：
 * 停用与改角色都会立刻吊销该用户的全部会话，界面上要把这件事讲清楚。
 * 角色下拉优先取 `/api/roles`（含自定义角色）；没有 role.read 权限时回落到内置角色键。
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Search, ShieldCheck, UserRoundPlus } from "lucide-react";
import { apiFetch, errorMessage, isApiError } from "@/lib/api";
import type { Paged, RoleItem, UserItem } from "@/lib/types";
import { ROLE_KEYS, BUILTIN_ROLES } from "@shared/permissions";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useAuth } from "@/app/AuthProvider";
import { useConfirm, useToast } from "@/app/providers";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  LoadingOverlay,
  Modal,
  PageHeader,
  Pagination,
  Select,
  TableSkeleton,
  TableWrap,
  Td,
  Textarea,
  Th,
  Toolbar,
  Tr,
} from "@/components/ui";

interface CreateForm {
  email: string;
  username: string;
  displayName: string;
  password: string;
  roles: string[];
  status: "active" | "suspended";
  bio: string;
  website: string;
}

interface ProfileForm {
  id: string;
  displayName: string;
  bio: string;
  website: string;
  avatarUrl: string;
  locale: string;
  status: "active" | "suspended";
}

export function UsersPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createForm, setCreateForm] = useState<CreateForm | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserItem | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [rolesTarget, setRolesTarget] = useState<UserItem | null>(null);
  const [roleSelection, setRoleSelection] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { can, me } = useAuth();

  const canCreate = can("user.create");
  const canUpdate = can("user.update");
  const canDelete = can("user.delete");
  const canAssign = can("user.assignRole");
  const canReadRoles = can("role.read");

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter]);

  const listQuery = useQuery<Paged<UserItem>>({
    queryKey: ["users", { page, search, roleFilter, statusFilter }],
    queryFn: () =>
      apiFetch<Paged<UserItem>>("/users", {
        query: { page, pageSize: 20, q: search, role: roleFilter, status: statusFilter },
      }),
    placeholderData: (previous) => previous,
  });

  const rolesQuery = useQuery<{ items: RoleItem[] }>({
    queryKey: ["roles"],
    queryFn: () => apiFetch<{ items: RoleItem[] }>("/roles"),
    enabled: canReadRoles,
    staleTime: 60_000,
  });

  const roleOptions = canReadRoles && rolesQuery.data
    ? rolesQuery.data.items.map((role) => ({ key: role.key, name: role.name }))
    : ROLE_KEYS.map((key) => ({
        key,
        name: BUILTIN_ROLES.find((role) => role.key === key)?.name ?? key,
      }));

  const items = listQuery.data?.items ?? [];
  const meta = listQuery.data?.meta ?? { page: 1, pageSize: 20, total: 0, totalPages: 1 };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["users"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const handleError = (error: unknown) => {
    if (isApiError(error) && Object.keys(error.fields).length > 0) setFieldErrors(error.fields);
    toast.error(errorMessage(error));
  };

  const createMutation = useMutation({
    mutationFn: (form: CreateForm) =>
      apiFetch<UserItem>("/users", {
        method: "POST",
        json: {
          email: form.email.trim(),
          username: form.username.trim(),
          displayName: form.displayName.trim(),
          password: form.password,
          roles: form.roles,
          status: form.status,
          bio: form.bio.trim() || null,
          website: form.website.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("用户已创建");
      setCreateForm(null);
      setFieldErrors({});
      refresh();
    },
    onError: handleError,
  });

  const updateMutation = useMutation({
    mutationFn: (form: ProfileForm) =>
      apiFetch<UserItem>(`/users/${form.id}`, {
        method: "PATCH",
        json: {
          displayName: form.displayName.trim(),
          bio: form.bio.trim() || null,
          website: form.website.trim() || null,
          avatarUrl: form.avatarUrl.trim() || null,
          locale: form.locale.trim() || "zh-CN",
          status: form.status,
        },
      }),
    onSuccess: () => {
      toast.success("资料已更新");
      setProfileForm(null);
      setFieldErrors({});
      refresh();
    },
    onError: handleError,
  });

  const passwordMutation = useMutation({
    mutationFn: (payload: { id: string; newPassword: string }) =>
      apiFetch<{ reset: boolean; revokedSessions: number }>(`/users/${payload.id}/password`, {
        method: "POST",
        json: { newPassword: payload.newPassword },
      }),
    onSuccess: (result) => {
      toast.success(`密码已重置，同时下线了 ${result.revokedSessions} 个会话`);
      setPasswordTarget(null);
      setNewPassword("");
      setFieldErrors({});
    },
    onError: handleError,
  });

  const rolesMutation = useMutation({
    mutationFn: (payload: { id: string; roles: string[] }) =>
      apiFetch<UserItem>(`/users/${payload.id}/roles`, { method: "PUT", json: { roles: payload.roles } }),
    onSuccess: () => {
      toast.success("角色已更新，该用户的旧会话已失效");
      setRolesTarget(null);
      refresh();
    },
    onError: handleError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: boolean; contentKept: number }>(`/users/${id}`, { method: "DELETE" }),
    onSuccess: (result) => {
      toast.success(`用户已删除，保留了 ${result.contentKept} 篇内容`);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <PageHeader
        title="用户"
        description="管理后台账号、角色与状态；删除用户不会删除其内容。"
        actions={
          canCreate ? (
            <Button
              variant="primary"
              icon={<UserRoundPlus size={15} />}
              onClick={() => {
                setFieldErrors({});
                setCreateForm({
                  email: "",
                  username: "",
                  displayName: "",
                  password: "",
                  roles: ["author"],
                  status: "active",
                  bio: "",
                  website: "",
                });
              }}
            >
              新建用户
            </Button>
          ) : null
        }
      />

      <Card>
        <Toolbar>
          <form
            className="flex min-w-52 flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(keyword.trim());
            }}
          >
            <div className="relative min-w-40 flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索邮箱、用户名或昵称"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="default">
              搜索
            </Button>
          </form>
          <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="w-32" aria-label="角色">
            <option value="">全部角色</option>
            {roleOptions.map((role) => (
              <option key={role.key} value={role.key}>
                {role.name}
              </option>
            ))}
          </Select>
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="w-28"
            aria-label="状态"
          >
            <option value="">全部状态</option>
            <option value="active">已启用</option>
            <option value="suspended">已停用</option>
          </Select>
        </Toolbar>

        <div className="relative">
          <LoadingOverlay visible={listQuery.isFetching && !listQuery.isLoading} />
          <TableWrap label="用户列表" minWidth={880}>
            
            <thead>
              <tr>
                <Th>用户</Th>
                <Th className="w-48">角色</Th>
                <Th className="w-20">状态</Th>
                <Th className="w-20" align="right">
                  内容
                </Th>
                <Th className="w-32">最近登录</Th>
                <Th className="w-64" align="right">
                  操作
                </Th>
              </tr>
            </thead>
            {listQuery.isLoading ? (
              <TableSkeleton rows={6} columns={6} />
            ) : (
              <tbody>
                {items.map((user) => {
                  const isSelf = user.id === me?.id;
                  return (
                    <Tr key={user.id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent">
                            {user.displayName.slice(0, 1)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {user.displayName}
                              {isSelf ? <span className="ml-1.5 text-xs text-subtle">（我）</span> : null}
                            </p>
                            <p className="truncate text-xs text-muted">
                              {user.email} · @{user.username}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {user.roles.length === 0 ? (
                            <span className="text-xs text-subtle">无角色</span>
                          ) : (
                            user.roles.map((role) => (
                              <Badge key={role} tone={role === "owner" ? "accent" : "neutral"}>
                                {roleOptions.find((option) => option.key === role)?.name ?? role}
                              </Badge>
                            ))
                          )}
                        </div>
                      </Td>
                      <Td>
                        <Badge tone={user.status === "active" ? "ok" : "danger"}>
                          {user.status === "active" ? "已启用" : "已停用"}
                        </Badge>
                        {user.mustChangePassword ? <Badge tone="warn" className="mt-1">需改密</Badge> : null}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {user.contentCount}
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-muted">
                        {user.lastLoginAt ? formatRelative(user.lastLoginAt) : "从未登录"}
                      </Td>
                      <Td align="right">
                        <div className="flex flex-wrap items-center justify-end gap-0.5">
                          {canUpdate ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Pencil size={13} />}
                              onClick={() => {
                                setFieldErrors({});
                                setProfileForm({
                                  id: user.id,
                                  displayName: user.displayName,
                                  bio: user.bio ?? "",
                                  website: user.website ?? "",
                                  avatarUrl: user.avatarUrl ?? "",
                                  locale: user.locale,
                                  status: user.status === "suspended" ? "suspended" : "active",
                                });
                              }}
                            >
                              资料
                            </Button>
                          ) : null}
                          {canUpdate ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<KeyRound size={13} />}
                              onClick={() => {
                                setFieldErrors({});
                                setNewPassword("");
                                setPasswordTarget(user);
                              }}
                            >
                              改密
                            </Button>
                          ) : null}
                          {canAssign ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<ShieldCheck size={13} />}
                              onClick={() => {
                                setFieldErrors({});
                                setRoleSelection(user.roles);
                                setRolesTarget(user);
                              }}
                            >
                              角色
                            </Button>
                          ) : null}
                          {canUpdate && !isSelf ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className={user.status === "active" ? "text-warn" : "text-ok"}
                              onClick={async () => {
                                const nextStatus = user.status === "active" ? "suspended" : "active";
                                if (nextStatus === "suspended") {
                                  const ok = await confirm({
                                    title: `停用 ${user.displayName}？`,
                                    description: "该账号的登录会话会立刻全部失效，无法再登录后台。",
                                    confirmText: "停用",
                                    tone: "danger",
                                  });
                                  if (!ok) return;
                                }
                                updateMutation.mutate({
                                  id: user.id,
                                  displayName: user.displayName,
                                  bio: user.bio ?? "",
                                  website: user.website ?? "",
                                  avatarUrl: user.avatarUrl ?? "",
                                  locale: user.locale,
                                  status: nextStatus,
                                });
                              }}
                            >
                              {user.status === "active" ? "停用" : "启用"}
                            </Button>
                          ) : null}
                          {canDelete && !isSelf ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger hover:text-danger"
                              onClick={async () => {
                                const ok = await confirm({
                                  title: `删除用户 ${user.displayName}？`,
                                  description: "账号、会话与 API 令牌会一并删除；其内容会保留但作者信息变成孤立引用。",
                                  confirmText: "删除用户",
                                  tone: "danger",
                                });
                                if (ok) deleteMutation.mutate(user.id);
                              }}
                            >
                              删除
                            </Button>
                          ) : null}
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            )}
          </TableWrap>

          {!listQuery.isLoading && items.length === 0 ? (
            listQuery.isError ? (
              <EmptyState kind="error" description={errorMessage(listQuery.error)} />
            ) : (
              <EmptyState kind={search || roleFilter || statusFilter ? "search" : "empty"} />
            )
          ) : null}
        </div>

        {items.length > 0 ? <Pagination meta={meta} onPage={setPage} /> : null}
      </Card>

      {/* ---------------------------------------------------- 新建用户 */}
      <Modal
        open={createForm !== null}
        onClose={() => setCreateForm(null)}
        title="新建用户"
        description="口令强度按站点设置校验；roles 至少选一个。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateForm(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={createMutation.isPending}
              disabled={!createForm?.email.trim() || !createForm?.username.trim() || !createForm?.password}
              onClick={() => createForm && createMutation.mutate(createForm)}
            >
              创建
            </Button>
          </>
        }
      >
        {createForm ? (
          <div className="flex flex-col gap-4">
            <Field label="邮箱" required error={fieldErrors.email}>
              <Input
                type="email"
                value={createForm.email}
                onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
              />
            </Field>
            <Field label="用户名" required error={fieldErrors.username} hint="字母、数字、下划线与连字符，3–32 位。">
              <Input
                value={createForm.username}
                onChange={(event) => setCreateForm({ ...createForm, username: event.target.value })}
              />
            </Field>
            <Field label="显示名" required error={fieldErrors.displayName}>
              <Input
                value={createForm.displayName}
                onChange={(event) => setCreateForm({ ...createForm, displayName: event.target.value })}
              />
            </Field>
            <Field label="初始密码" required error={fieldErrors.password} hint="长度下限由站点设置的密码策略决定。">
              <Input
                type="text"
                value={createForm.password}
                autoComplete="new-password"
                onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
              />
            </Field>
            <Field label="角色" required error={fieldErrors.roles}>
              <div className="flex flex-col gap-1.5 rounded-sm border border-line p-2.5">
                {roleOptions.map((role) => (
                  <Checkbox
                    key={role.key}
                    label={role.name}
                    checked={createForm.roles.includes(role.key)}
                    onChange={(event) =>
                      setCreateForm({
                        ...createForm,
                        roles: event.target.checked
                          ? [...createForm.roles, role.key]
                          : createForm.roles.filter((key) => key !== role.key),
                      })
                    }
                  />
                ))}
              </div>
            </Field>
            <Field label="状态">
              <Select
                value={createForm.status}
                onChange={(event) =>
                  setCreateForm({ ...createForm, status: event.target.value as "active" | "suspended" })
                }
              >
                <option value="active">已启用</option>
                <option value="suspended">已停用</option>
              </Select>
            </Field>
            <Field label="简介" error={fieldErrors.bio}>
              <Textarea
                rows={2}
                value={createForm.bio}
                onChange={(event) => setCreateForm({ ...createForm, bio: event.target.value })}
              />
            </Field>
          </div>
        ) : null}
      </Modal>

      {/* ---------------------------------------------------- 编辑资料 */}
      <Modal
        open={profileForm !== null}
        onClose={() => setProfileForm(null)}
        title="编辑资料"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProfileForm(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={updateMutation.isPending}
              disabled={!profileForm?.displayName.trim()}
              onClick={() => profileForm && updateMutation.mutate(profileForm)}
            >
              保存
            </Button>
          </>
        }
      >
        {profileForm ? (
          <div className="flex flex-col gap-4">
            <Field label="显示名" required error={fieldErrors.displayName}>
              <Input
                value={profileForm.displayName}
                onChange={(event) => setProfileForm({ ...profileForm, displayName: event.target.value })}
              />
            </Field>
            <Field label="头像 URL" error={fieldErrors.avatarUrl}>
              <Input
                value={profileForm.avatarUrl}
                onChange={(event) => setProfileForm({ ...profileForm, avatarUrl: event.target.value })}
                placeholder="https://"
              />
            </Field>
            <Field label="个人主页" error={fieldErrors.website}>
              <Input
                value={profileForm.website}
                onChange={(event) => setProfileForm({ ...profileForm, website: event.target.value })}
                placeholder="https://"
              />
            </Field>
            <Field label="界面语言" error={fieldErrors.locale}>
              <Input
                value={profileForm.locale}
                onChange={(event) => setProfileForm({ ...profileForm, locale: event.target.value })}
              />
            </Field>
            <Field label="状态" hint="改成「已停用」会立刻吊销该用户的全部会话。" error={fieldErrors.status}>
              <Select
                value={profileForm.status}
                onChange={(event) =>
                  setProfileForm({ ...profileForm, status: event.target.value as "active" | "suspended" })
                }
              >
                <option value="active">已启用</option>
                <option value="suspended">已停用</option>
              </Select>
            </Field>
            <Field label="简介" error={fieldErrors.bio}>
              <Textarea
                rows={3}
                value={profileForm.bio}
                onChange={(event) => setProfileForm({ ...profileForm, bio: event.target.value })}
              />
            </Field>
          </div>
        ) : null}
      </Modal>

      {/* ---------------------------------------------------- 重置密码 */}
      <Modal
        open={passwordTarget !== null}
        onClose={() => setPasswordTarget(null)}
        title="重置密码"
        description={passwordTarget ? `为 ${passwordTarget.displayName} 设置新密码` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPasswordTarget(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={passwordMutation.isPending}
              disabled={!newPassword}
              onClick={() => passwordTarget && passwordMutation.mutate({ id: passwordTarget.id, newPassword })}
            >
              重置
            </Button>
          </>
        }
      >
        <Field label="新密码" required error={fieldErrors.newPassword} hint="重置后该用户的全部登录会话会被吊销。">
          <Input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
        </Field>
      </Modal>

      {/* ---------------------------------------------------- 分配角色 */}
      <Modal
        open={rolesTarget !== null}
        onClose={() => setRolesTarget(null)}
        title="分配角色"
        description={rolesTarget ? `${rolesTarget.displayName} 的角色集合（整体替换）` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRolesTarget(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={rolesMutation.isPending}
              disabled={roleSelection.length === 0}
              onClick={() => rolesTarget && rolesMutation.mutate({ id: rolesTarget.id, roles: roleSelection })}
            >
              保存角色
            </Button>
          </>
        }
      >
        {canReadRoles && rolesQuery.isLoading ? (
          <LoadingBlock label="加载角色" />
        ) : (
          <div className="flex flex-col gap-1.5 rounded-sm border border-line p-2.5">
            {roleOptions.map((role) => (
              <Checkbox
                key={role.key}
                label={role.name}
                checked={roleSelection.includes(role.key)}
                onChange={(event) =>
                  setRoleSelection((previous) =>
                    event.target.checked ? [...previous, role.key] : previous.filter((key) => key !== role.key),
                  )
                }
              />
            ))}
          </div>
        )}
        {fieldErrors.roles ? <p className="mt-2 text-xs text-danger">{fieldErrors.roles}</p> : null}
        <p className="mt-3 text-xs text-subtle">
          授予 owner 仅限站点所有者；站点必须至少保留一个 owner。
        </p>
      </Modal>

      <p className="mt-3 text-xs text-subtle">
        账号创建时间见用户详情，列表最近登录时间用相对时间展示。
        {items[0] ? ` 最新一条创建于 ${formatDateTime(items[0].createdAt)}。` : ""}
      </p>
    </>
  );
}
