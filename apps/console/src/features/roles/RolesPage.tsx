/**
 * 角色与权限。
 *
 * 权限矩阵按 `GET /api/roles/permissions` 的分组渲染（分组定义在服务端 shared/permissions.ts），
 * 后台不重抄一份权限目录 —— 服务端加权限键，这里立刻出现对应勾选框。
 *
 * owner 角色的权限恒为全集且不可调整（服务端会对带 permissions 的 PATCH 直接 400），
 * 所以矩阵在这里是只读的。
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, ShieldCheck, Trash } from "lucide-react";
import { apiFetch, errorMessage, isApiError } from "@/lib/api";
import type { PermissionGroup, RoleItem } from "@/lib/types";
import { useAuth } from "@/app/AuthProvider";
import { useConfirm, useToast } from "@/app/providers";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Textarea,
} from "@/components/ui";
import { cn } from "@/lib/cn";

interface CreateRoleForm {
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

export function RolesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<string[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [createForm, setCreateForm] = useState<CreateRoleForm | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const canManage = can("role.manage");

  const rolesQuery = useQuery<{ items: RoleItem[] }>({
    queryKey: ["roles"],
    queryFn: () => apiFetch<{ items: RoleItem[] }>("/roles"),
  });

  const permissionsQuery = useQuery<{ groups: PermissionGroup[] }>({
    queryKey: ["role-permissions"],
    queryFn: () => apiFetch<{ groups: PermissionGroup[] }>("/roles/permissions"),
    staleTime: 300_000,
  });

  const roles = rolesQuery.data?.items ?? [];
  const selected = useMemo(() => roles.find((role) => role.id === selectedId) ?? null, [roles, selectedId]);

  useEffect(() => {
    if (roles.length === 0) return;
    if (!selectedId || !roles.some((role) => role.id === selectedId)) {
      const first = roles[0];
      setSelectedId(first.id);
    }
  }, [roles, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setDraftPermissions(selected.permissions);
    setDraftName(selected.name);
    setDraftDescription(selected.description ?? "");
  }, [selected]);

  const allPermissionKeys = useMemo(
    () => (permissionsQuery.data?.groups ?? []).flatMap((group) => group.permissions.map((permission) => permission.key)),
    [permissionsQuery.data],
  );

  const dirtyPermissions = useMemo(() => {
    if (!selected) return false;
    const before = [...selected.permissions].sort().join(",");
    const after = [...draftPermissions].sort().join(",");
    return before !== after || draftName !== selected.name || draftDescription !== (selected.description ?? "");
  }, [selected, draftPermissions, draftName, draftDescription]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["roles"] });
    void queryClient.invalidateQueries({ queryKey: ["me"] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: { id: string; permissions?: string[]; name: string; description: string }) =>
      apiFetch<RoleItem>(`/roles/${payload.id}`, {
        method: "PATCH",
        json: {
          name: payload.name,
          description: payload.description.trim() || null,
          ...(payload.permissions ? { permissions: payload.permissions } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("角色已保存");
      refresh();
    },
    onError: (error) => {
      if (isApiError(error) && Object.keys(error.fields).length > 0) setFieldErrors(error.fields);
      toast.error(errorMessage(error));
    },
  });

  const createMutation = useMutation({
    mutationFn: (form: CreateRoleForm) =>
      apiFetch<RoleItem>("/roles", {
        method: "POST",
        json: {
          key: form.key.trim(),
          name: form.name.trim(),
          description: form.description.trim() || null,
          permissions: form.permissions,
        },
      }),
    onSuccess: (role) => {
      toast.success("角色已创建");
      setCreateForm(null);
      setFieldErrors({});
      setSelectedId(role.id);
      refresh();
    },
    onError: (error) => {
      if (isApiError(error) && Object.keys(error.fields).length > 0) setFieldErrors(error.fields);
      toast.error(errorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean; key: string }>(`/roles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("角色已删除");
      setSelectedId(null);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const toggle = (key: string, checked: boolean) => {
    setDraftPermissions((previous) =>
      checked ? [...new Set([...previous, key])] : previous.filter((item) => item !== key),
    );
  };

  const toggleGroup = (group: PermissionGroup, checked: boolean) => {
    const keys = group.permissions.map((permission) => permission.key);
    setDraftPermissions((previous) =>
      checked
        ? [...new Set([...previous, ...keys])]
        : previous.filter((item) => !keys.includes(item)),
    );
  };

  if (rolesQuery.isLoading) return <LoadingBlock label="加载角色" />;
  if (rolesQuery.isError) {
    return (
      <Card>
        <EmptyState kind="error" description={errorMessage(rolesQuery.error)} />
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="角色与权限"
        description="角色只是权限的集合；业务判定一律走权限键，不判角色名。"
        actions={
          canManage ? (
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => {
                setFieldErrors({});
                setCreateForm({ key: "", name: "", description: "", permissions: [] });
              }}
            >
              新建角色
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader title="角色列表" description={`共 ${roles.length} 个`} />
          <ul className="divide-y divide-line">
            {roles.map((role) => (
              <li key={role.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(role.id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors",
                    role.id === selectedId ? "bg-accent-soft" : "hover:bg-hover",
                  )}
                >
                  <span className="flex w-full items-center gap-1.5">
                    <span className={cn("truncate text-sm font-medium", role.id === selectedId ? "text-accent" : "text-fg")}>
                      {role.name}
                    </span>
                    {role.builtin ? <Badge>内置</Badge> : null}
                  </span>
                  <span className="text-xs text-subtle">
                    {role.key} · {role.userCount} 人 · {role.permissions.length} 项权限
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          {permissionsQuery.isLoading ? (
            <LoadingBlock label="加载权限目录" />
          ) : permissionsQuery.isError ? (
            <EmptyState kind="error" description={errorMessage(permissionsQuery.error)} />
          ) : !selected ? (
            <EmptyState kind="empty" description="先在左侧选择一个角色。" />
          ) : (
            <>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {selected.name}
                    {selected.builtin ? <Badge>内置</Badge> : null}
                    {selected.key === "owner" ? <Badge tone="accent">权限不可调整</Badge> : null}
                  </span>
                }
                description={selected.description ?? "未填写说明"}
                actions={
                  canManage && selected.key !== "owner" ? (
                    <>
                      {!selected.builtin ? (
                        <Button
                          size="sm"
                          variant="danger"
                          icon={<Trash size={13} />}
                          onClick={async () => {
                            const ok = await confirm({
                              title: `删除角色「${selected.name}」？`,
                              description:
                                selected.userCount > 0
                                  ? `该角色仍被 ${selected.userCount} 个用户使用，服务端会拒绝删除。`
                                  : "删除后无法恢复。",
                              confirmText: "删除",
                              tone: "danger",
                            });
                            if (ok) deleteMutation.mutate(selected.id);
                          }}
                        >
                          删除
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<Save size={13} />}
                        disabled={!dirtyPermissions}
                        loading={saveMutation.isPending}
                        onClick={() =>
                          saveMutation.mutate({
                            id: selected.id,
                            permissions: draftPermissions,
                            name: draftName,
                            description: draftDescription,
                          })
                        }
                      >
                        保存
                      </Button>
                    </>
                  ) : null
                }
              />

              <div className="flex flex-col gap-4 px-4 py-4">
                {canManage && selected.key !== "owner" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="角色名称" error={fieldErrors.name}>
                      <Input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
                    </Field>
                    <Field label="说明" error={fieldErrors.description}>
                      <Input value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} />
                    </Field>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-sunken px-3 py-2 text-xs text-muted">
                  <ShieldCheck size={13} />
                  已选 {draftPermissions.length} / {allPermissionKeys.length} 项权限
                  {canManage && selected.key !== "owner" ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setDraftPermissions([...allPermissionKeys])}>
                        全选
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDraftPermissions([])}>
                        全不选
                      </Button>
                    </>
                  ) : null}
                  {fieldErrors.permissions ? <span className="text-danger">{fieldErrors.permissions}</span> : null}
                </div>

                <div className="flex flex-col gap-4">
                  {(permissionsQuery.data?.groups ?? []).map((group) => {
                    const keys = group.permissions.map((permission) => permission.key);
                    const checkedCount = keys.filter((key) => draftPermissions.includes(key)).length;
                    const readOnly = !canManage || selected.key === "owner";
                    return (
                      <section key={group.group} className="rounded-sm border border-line">
                        <header className="flex items-center gap-2 border-b border-line bg-sunken px-3 py-2">
                          <h4 className="text-sm font-medium text-fg">{group.label}</h4>
                          <span className="text-xs text-subtle">
                            {checkedCount}/{keys.length}
                          </span>
                          {!readOnly ? (
                            <span className="ml-auto flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => toggleGroup(group, true)}>
                                全选
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => toggleGroup(group, false)}>
                                清空
                              </Button>
                            </span>
                          ) : null}
                        </header>
                        <div className="grid gap-1.5 p-3 sm:grid-cols-2">
                          {group.permissions.map((permission) => (
                            <label
                              key={permission.key}
                              className={cn(
                                "flex items-start gap-2 rounded-xs px-1.5 py-1 transition-colors",
                                !readOnly && "cursor-pointer hover:bg-hover",
                              )}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--tb-accent)] disabled:cursor-not-allowed"
                                checked={draftPermissions.includes(permission.key)}
                                disabled={readOnly}
                                onChange={(event) => toggle(permission.key, event.target.checked)}
                              />
                              <span className="min-w-0">
                                <span className="block text-sm text-fg">{permission.label}</span>
                                <span className="block font-mono text-xs text-subtle">{permission.key}</span>
                                <span className="block text-xs text-muted">{permission.description}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      <Modal
        open={createForm !== null}
        onClose={() => setCreateForm(null)}
        title="新建自定义角色"
        description="key 用于程序判定，创建后不可更改。"
        width="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateForm(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={createMutation.isPending}
              disabled={!createForm?.key.trim() || !createForm?.name.trim()}
              onClick={() => createForm && createMutation.mutate(createForm)}
            >
              创建
            </Button>
          </>
        }
      >
        {createForm ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="角色 key" required error={fieldErrors.key} hint="小写字母开头，可含数字、下划线与连字符。">
                <Input
                  value={createForm.key}
                  onChange={(event) => setCreateForm({ ...createForm, key: event.target.value })}
                  className="font-mono"
                  placeholder="reviewer"
                />
              </Field>
              <Field label="角色名称" required error={fieldErrors.name}>
                <Input
                  value={createForm.name}
                  onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
                  placeholder="审稿人"
                />
              </Field>
            </div>
            <Field label="说明" error={fieldErrors.description}>
              <Textarea
                rows={2}
                value={createForm.description}
                onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })}
              />
            </Field>
            <div>
              <p className="mb-2 text-xs font-medium text-muted">
                初始权限（{createForm.permissions.length} 项，创建后仍可在矩阵里调整）
              </p>
              <div className="max-h-72 overflow-y-auto rounded-sm border border-line p-3">
                {(permissionsQuery.data?.groups ?? []).map((group) => (
                  <div key={group.group} className="mb-3">
                    <p className="mb-1 text-xs text-subtle">{group.label}</p>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {group.permissions.map((permission) => (
                        <Checkbox
                          key={permission.key}
                          label={`${permission.label}（${permission.key}）`}
                          checked={createForm.permissions.includes(permission.key)}
                          onChange={(event) =>
                            setCreateForm({
                              ...createForm,
                              permissions: event.target.checked
                                ? [...createForm.permissions, permission.key]
                                : createForm.permissions.filter((key) => key !== permission.key),
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
