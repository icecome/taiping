/**
 * 分类与标签。
 *
 * 三个标签页共用一张 terms 表：分类是树（可设父级），标签与系列平铺。
 * 排序用"上移/下移"改同层 sortOrder 再整批提交 `POST /api/terms/reorder` ——
 * 批量提交的好处是服务端能一次性做成环校验，不会出现半截写入。
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Search, Tags, Trash } from "lucide-react";
import { apiFetch, errorMessage, isApiError } from "@/lib/api";
import type { Paged, TermNode } from "@/lib/types";
import { TERM_TYPES } from "@shared/content-types";
import { termTypeLabel } from "@/lib/content-meta";
import { formatNumber } from "@/lib/format";
import { useAuth } from "@/app/AuthProvider";
import { useConfirm, useToast } from "@/app/providers";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  TableWrap,
  Tabs,
  Td,
  Textarea,
  Th,
  Toolbar,
  Tr,
} from "@/components/ui";

type TermType = "category" | "tag" | "series";

interface FlatTerm extends TermNode {
  depth: number;
}

function flatten(nodes: TermNode[], depth = 0): FlatTerm[] {
  const out: FlatTerm[] = [];
  for (const node of nodes) {
    out.push({ ...node, depth });
    if (node.children.length > 0) out.push(...flatten(node.children, depth + 1));
  }
  return out;
}

interface FormState {
  id: string | null;
  type: TermType;
  name: string;
  slug: string;
  description: string;
  parentId: string;
  sortOrder: string;
}

function emptyForm(type: TermType, parentId = ""): FormState {
  return { id: null, type, name: "", slug: "", description: "", parentId, sortOrder: "0" };
}

export function TermsPage() {
  const [type, setType] = useState<TermType>("category");
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const canManage = can("term.manage");

  const listQuery = useQuery<Paged<TermNode>>({
    queryKey: ["terms", type, search],
    queryFn: () => apiFetch<Paged<TermNode>>("/terms", { query: { type, q: search, pageSize: 100, withCount: "true" } }),
    placeholderData: (previous) => previous,
  });

  const rows = useMemo(() => flatten(listQuery.data?.items ?? []), [listQuery.data]);
  const isCategory = type === "category";

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["terms"] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: FormState) => {
      const body: Record<string, unknown> = {
        name: payload.name.trim(),
        slug: payload.slug.trim() || undefined,
        description: payload.description.trim() || null,
        sortOrder: Number(payload.sortOrder) || 0,
      };
      if (isCategory) body.parentId = payload.parentId || null;
      if (payload.id) return apiFetch(`/terms/${payload.id}`, { method: "PATCH", json: body });
      return apiFetch("/terms", { method: "POST", json: { type: payload.type, ...body } });
    },
    onSuccess: () => {
      toast.success("已保存");
      setForm(null);
      setFieldErrors({});
      invalidate();
    },
    onError: (error) => {
      if (isApiError(error) && Object.keys(error.fields).length > 0) setFieldErrors(error.fields);
      toast.error(errorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean; affectedContents: number }>(`/terms/${id}`, { method: "DELETE" }),
    onSuccess: (result) => {
      toast.success(`已删除，${result.affectedContents} 篇内容解除关联`);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) =>
      apiFetch<{ updated: number }>("/terms/reorder", { method: "POST", json: { items } }),
    onSuccess: () => {
      toast.success("顺序已保存");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const move = (row: FlatTerm, direction: -1 | 1) => {
    const siblings = rows.filter((item) => item.parentId === row.parentId);
    const index = siblings.findIndex((item) => item.id === row.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    const next = [...siblings];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    reorderMutation.mutate(next.map((item, position) => ({ id: item.id, sortOrder: position * 10 })));
  };

  const parentOptions = useMemo(
    () => rows.filter((row) => row.type === "category").map((row) => ({ id: row.id, label: `${"— ".repeat(row.depth)}${row.name}` })),
    [rows],
  );

  useEffect(() => {
    setSearch("");
  }, [type]);

  return (
    <>
      <PageHeader
        title="分类与标签"
        description="分类支持层级；标签与系列平铺。删除词条不会删除内容，只解除关联。"
        actions={
          canManage ? (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setForm(emptyForm(type))}>
              新建{termTypeLabel(type)}
            </Button>
          ) : null
        }
      />

      <Card>
        <Tabs
          value={type}
          onChange={(next) => setType(next)}
          items={TERM_TYPES.map((entry) => ({ value: entry.key as TermType, label: entry.label }))}
        />
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
                placeholder="按名称或 slug 搜索"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="default">
              搜索
            </Button>
            {search ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setKeyword("");
                  setSearch("");
                }}
              >
                清除
              </Button>
            ) : null}
          </form>
          <span className="text-xs text-subtle">共 {rows.length} 项</span>
        </Toolbar>

        {listQuery.isLoading ? (
          <LoadingBlock label="加载分类标签" />
        ) : listQuery.isError ? (
          <EmptyState kind="error" description={errorMessage(listQuery.error)} />
        ) : rows.length === 0 ? (
          <EmptyState
            kind={search ? "search" : "empty"}
            description={search ? undefined : `还没有${termTypeLabel(type)}，点右上角新建一个。`}
          />
        ) : (
          <TableWrap label="分类标签列表" minWidth={760}>
            
            <thead>
              <tr>
                <Th>名称</Th>
                <Th className="w-40">Slug</Th>
                <Th className="w-20" align="right">
                  内容数
                </Th>
                <Th className="w-24" align="right">
                  排序
                </Th>
                <Th className="w-40" align="right">
                  操作
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <div className="flex items-center gap-2" style={{ paddingLeft: `${row.depth * 18}px` }}>
                      {row.depth > 0 ? <span className="text-subtle">└</span> : null}
                      <span className="truncate font-medium">{row.name}</span>
                      {row.description ? (
                        <span className="truncate text-xs text-subtle">{row.description}</span>
                      ) : null}
                    </div>
                  </Td>
                  <Td className="truncate font-mono text-xs text-muted">{row.slug}</Td>
                  <Td align="right" className="tabular-nums">
                    {formatNumber(row.count)}
                  </Td>
                  <Td align="right" className="tabular-nums text-xs text-muted">
                    {row.sortOrder}
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-1">
                      {canManage ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="上移"
                            onClick={() => move(row, -1)}
                            disabled={reorderMutation.isPending}
                          >
                            <ArrowUp size={13} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="下移"
                            onClick={() => move(row, 1)}
                            disabled={reorderMutation.isPending}
                          >
                            <ArrowDown size={13} />
                          </Button>
                          {isCategory ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="新建子分类"
                              onClick={() => setForm(emptyForm("category", row.id))}
                            >
                              <Plus size={13} />
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            title="编辑"
                            onClick={() =>
                              setForm({
                                id: row.id,
                                type: row.type as TermType,
                                name: row.name,
                                slug: row.slug,
                                description: row.description ?? "",
                                parentId: row.parentId ?? "",
                                sortOrder: String(row.sortOrder),
                              })
                            }
                          >
                            <Pencil size={13} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger hover:text-danger"
                            title="删除"
                            onClick={async () => {
                              const ok = await confirm({
                                title: `删除「${row.name}」？`,
                                description:
                                  row.children.length > 0
                                    ? "子分类会被上提到它的父级，内容本身不受影响。"
                                    : "与该词条的关联会被解除，内容本身不受影响。",
                                confirmText: "删除",
                                tone: "danger",
                              });
                              if (ok) deleteMutation.mutate(row.id);
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
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={form !== null}
        onClose={() => {
          setForm(null);
          setFieldErrors({});
        }}
        title={form?.id ? `编辑${termTypeLabel(form.type)}` : `新建${termTypeLabel(form?.type ?? type)}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={saveMutation.isPending}
              disabled={!form?.name.trim()}
              onClick={() => form && saveMutation.mutate(form)}
            >
              保存
            </Button>
          </>
        }
      >
        {form ? (
          <div className="flex flex-col gap-4">
            <Field label="名称" required error={fieldErrors.name}>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoFocus />
            </Field>
            <Field label="Slug" hint="留空由名称生成；中文会转成拼音。" error={fieldErrors.slug}>
              <Input
                value={form.slug}
                onChange={(event) => setForm({ ...form, slug: event.target.value })}
                className="font-mono"
              />
            </Field>
            <Field label="描述" error={fieldErrors.description}>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>
            {form.type === "category" ? (
              <Field label="父级分类" error={fieldErrors.parentId} hint="留空为顶级分类。">
                <Select value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}>
                  <option value="">（顶级）</option>
                  {parentOptions
                    .filter((option) => option.id !== form.id)
                    .map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                </Select>
              </Field>
            ) : null}
            <Field label="排序权重" hint="数字越小越靠前；列表里的上下移会重写这一列。" error={fieldErrors.sortOrder}>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
              />
            </Field>
          </div>
        ) : null}
      </Modal>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-subtle">
        <Tags size={12} />
        内容数按"已发布且未删除"实时统计，草稿不计入。
      </p>
    </>
  );
}
