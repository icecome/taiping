/**
 * 导航管理。
 *
 * 三个展示位置（header / footer / sidebar）在同一页分组展示，因为菜单总量很小，
 * 分成三个页签反而让人看不到全貌。
 * 排序同样走"上移/下移 + 批量提交"，父级只能在同一 location 内选择（服务端会强校验）。
 */
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Trash } from "lucide-react";
import { apiFetch, errorMessage, isApiError } from "@/lib/api";
import type { NavItem } from "@/lib/types";
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
  Modal,
  PageHeader,
  Select,
  Switch,
  TableWrap,
  Td,
  Th,
  Tr,
} from "@/components/ui";

type NavLocation = "header" | "footer" | "sidebar";

const LOCATIONS: { key: NavLocation; label: string; hint: string }[] = [
  { key: "header", label: "顶部导航", hint: "站点头部的主菜单" },
  { key: "footer", label: "底部导航", hint: "页脚链接组" },
  { key: "sidebar", label: "侧边栏", hint: "主题启用侧栏时显示" },
];

interface NavForm {
  id: string | null;
  location: NavLocation;
  label: string;
  href: string;
  parentId: string;
  target: "_self" | "_blank";
  icon: string;
  sortOrder: string;
  enabled: boolean;
}

function emptyForm(location: NavLocation, parentId = ""): NavForm {
  return {
    id: null,
    location,
    label: "",
    href: "",
    parentId,
    target: "_self",
    icon: "",
    sortOrder: "0",
    enabled: true,
  };
}

export function NavPage() {
  const [form, setForm] = useState<NavForm | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const canManage = can("nav.manage");

  const listQuery = useQuery<{ items: NavItem[]; tree: NavItem[] }>({
    queryKey: ["nav"],
    queryFn: () => apiFetch<{ items: NavItem[]; tree: NavItem[] }>("/nav"),
  });

  const items = listQuery.data?.items ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["nav"] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: NavForm) => {
      const body: Record<string, unknown> = {
        location: payload.location,
        label: payload.label.trim(),
        href: payload.href.trim(),
        target: payload.target,
        icon: payload.icon.trim() || null,
        sortOrder: Number(payload.sortOrder) || 0,
        enabled: payload.enabled,
        parentId: payload.parentId || null,
      };
      if (payload.id) return apiFetch<NavItem>(`/nav/${payload.id}`, { method: "PATCH", json: body });
      return apiFetch<NavItem>("/nav", { method: "POST", json: body });
    },
    onSuccess: () => {
      toast.success("导航项已保存");
      setForm(null);
      setFieldErrors({});
      invalidate();
    },
    onError: (error) => {
      if (isApiError(error) && Object.keys(error.fields).length > 0) setFieldErrors(error.fields);
      toast.error(errorMessage(error));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (payload: { id: string; enabled: boolean }) =>
      apiFetch<NavItem>(`/nav/${payload.id}`, { method: "PATCH", json: { enabled: payload.enabled } }),
    onSuccess: () => {
      toast.success("已更新启用状态");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: boolean; detachedChildren: number }>(`/nav/${id}`, { method: "DELETE" }),
    onSuccess: (result) => {
      toast.success(
        result.detachedChildren > 0 ? `已删除，${result.detachedChildren} 个子项被提升为顶级` : "已删除",
      );
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const reorderMutation = useMutation({
    mutationFn: (payload: { id: string; sortOrder: number }[]) =>
      apiFetch<{ updated: number }>("/nav/reorder", { method: "POST", json: { items: payload } }),
    onSuccess: () => {
      toast.success("顺序已保存");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const move = (item: NavItem, direction: -1 | 1) => {
    const siblings = items.filter((entry) => entry.location === item.location && entry.parentId === item.parentId);
    const index = siblings.findIndex((entry) => entry.id === item.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    const next = [...siblings];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    reorderMutation.mutate(next.map((entry, position) => ({ id: entry.id, sortOrder: position * 10 })));
  };

  const grouped = useMemo(
    () =>
      LOCATIONS.map((location) => ({
        ...location,
        roots: items.filter((item) => item.location === location.key && !item.parentId),
        childrenOf: (parentId: string) => items.filter((item) => item.parentId === parentId),
      })),
    [items],
  );

  const parentOptions = (location: NavLocation, selfId: string | null) =>
    items.filter(
      (item) => item.location === location && !item.parentId && item.id !== selfId,
    );

  if (listQuery.isLoading) return <LoadingBlock label="加载导航" />;
  if (listQuery.isError) {
    return (
      <Card>
        <EmptyState kind="error" description={errorMessage(listQuery.error)} />
      </Card>
    );
  }

  const renderRow = (item: NavItem, depth: number) => (
    <Tr key={item.id}>
      <Td>
        <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 18}px` }}>
          {depth > 0 ? <span className="text-subtle">└</span> : null}
          <span className="truncate font-medium">{item.label}</span>
          {item.icon ? <span className="font-mono text-xs text-subtle">{item.icon}</span> : null}
          {item.target === "_blank" ? (
            <Badge tone="info">
              <ExternalLink size={10} /> 新窗口
            </Badge>
          ) : null}
        </div>
      </Td>
      <Td className="truncate font-mono text-xs text-muted">{item.href}</Td>
      <Td className="text-xs text-muted tabular-nums">{item.sortOrder}</Td>
      <Td>
        {item.enabled ? <Badge tone="ok">启用</Badge> : <Badge>停用</Badge>}
      </Td>
      <Td align="right">
        <div className="flex items-center justify-end gap-0.5">
          {canManage ? (
            <>
              <Button size="sm" variant="ghost" title="上移" onClick={() => move(item, -1)} disabled={reorderMutation.isPending}>
                <ArrowUp size={13} />
              </Button>
              <Button size="sm" variant="ghost" title="下移" onClick={() => move(item, 1)} disabled={reorderMutation.isPending}>
                <ArrowDown size={13} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title="加子项"
                disabled={depth > 0}
                onClick={() => setForm(emptyForm(item.location, item.id))}
              >
                <Plus size={13} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title="编辑"
                onClick={() => {
                  setFieldErrors({});
                  setForm({
                    id: item.id,
                    location: item.location,
                    label: item.label,
                    href: item.href,
                    parentId: item.parentId ?? "",
                    target: item.target,
                    icon: item.icon ?? "",
                    sortOrder: String(item.sortOrder),
                    enabled: item.enabled,
                  });
                }}
              >
                <Pencil size={13} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title={item.enabled ? "停用" : "启用"}
                onClick={() => toggleMutation.mutate({ id: item.id, enabled: !item.enabled })}
              >
                {item.enabled ? "停用" : "启用"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger hover:text-danger"
                title="删除"
                onClick={async () => {
                  const ok = await confirm({
                    title: `删除导航项「${item.label}」？`,
                    description: "它的子项会被提升为顶级项，不会被一起删除。",
                    confirmText: "删除",
                    tone: "danger",
                  });
                  if (ok) deleteMutation.mutate(item.id);
                }}
              >
                <Trash size={13} />
              </Button>
            </>
          ) : (
            <Badge>只读</Badge>
          )}
        </div>
      </Td>
    </Tr>
  );

  return (
    <>
      <PageHeader
        title="导航"
        description="按展示位置分组管理菜单；父级必须与子级在同一位置。"
        actions={
          canManage ? (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setForm(emptyForm("header"))}>
              新建导航项
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-4">
        {grouped.map((group) => (
          <Card key={group.key}>
            <CardHeader
              title={group.label}
              description={group.hint}
              actions={
                <span className="text-xs text-subtle">
                  {group.roots.length} 个顶级项
                  {canManage ? (
                    <Button size="sm" variant="ghost" className="ml-2" onClick={() => setForm(emptyForm(group.key))}>
                      添加
                    </Button>
                  ) : null}
                </span>
              }
            />
            {group.roots.length === 0 ? (
              <EmptyState kind="empty" description={`${group.label}还没有配置任何项。`} />
            ) : (
              <TableWrap label="导航项列表" minWidth={860}>
            
                <thead>
                  <tr>
                    <Th>名称</Th>
                    <Th className="w-64">链接</Th>
                    <Th className="w-16">排序</Th>
                    <Th className="w-20">状态</Th>
                    <Th className="w-72" align="right">
                      操作
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {group.roots.map((item) => (
                    <Fragment key={item.id}>
                      {renderRow(item, 0)}
                      {group.childrenOf(item.id).map((child) => renderRow(child, 1))}
                    </Fragment>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        ))}
      </div>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? "编辑导航项" : "新建导航项"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={saveMutation.isPending}
              disabled={!form?.label.trim() || !form?.href.trim()}
              onClick={() => form && saveMutation.mutate(form)}
            >
              保存
            </Button>
          </>
        }
      >
        {form ? (
          <div className="flex flex-col gap-4">
            <Field label="展示位置" required error={fieldErrors.location}>
              <Select
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value as NavLocation, parentId: "" })}
              >
                {LOCATIONS.map((location) => (
                  <option key={location.key} value={location.key}>
                    {location.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="名称" required error={fieldErrors.label}>
              <Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} autoFocus />
            </Field>
            <Field
              label="链接"
              required
              error={fieldErrors.href}
              hint="以 / 开头表示站内路径，也支持 http(s)、mailto:、tel:。"
            >
              <Input
                value={form.href}
                onChange={(event) => setForm({ ...form, href: event.target.value })}
                className="font-mono"
                placeholder="/about"
              />
            </Field>
            <Field label="父级项" error={fieldErrors.parentId} hint="留空为顶级项；只支持两级。">
              <Select value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}>
                <option value="">（顶级）</option>
                {parentOptions(form.location, form.id).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="打开方式">
                <Select
                  value={form.target}
                  onChange={(event) => setForm({ ...form, target: event.target.value as "_self" | "_blank" })}
                >
                  <option value="_self">当前窗口</option>
                  <option value="_blank">新窗口</option>
                </Select>
              </Field>
              <Field label="图标名" hint="主题约定的图标键，可留空。">
                <Input value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-5 border-t border-line pt-3">
              <Field label="排序权重" error={fieldErrors.sortOrder} className="w-28">
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
                />
              </Field>
              <div className="pt-5">
                <Switch checked={form.enabled} onChange={(checked) => setForm({ ...form, enabled: checked })} label="启用" />
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
