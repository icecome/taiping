/**
 * 内容列表。
 *
 * 筛选状态放在 URL 里（`/contents?status=pending`）：仪表盘的"待审内容"卡片、
 * 书签、刷新都能落到同一个视图，不需要再维护一份内存状态。
 *
 * 行内动作与批量动作都走服务端既有接口：单条状态流转走 `POST /{id}/status`，
 * 恢复/彻底删除分别是 `POST /{id}/restore` 与 `DELETE /{id}/purge`，批量走 `POST /bulk`。
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ExternalLink, Pencil, Plus, RotateCcw, Search, Trash } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api";
import type { BulkResult, ContentSummary, Paged } from "@/lib/types";
import { contentStatusLabel, contentStatusTone, contentTypeLabel } from "@/lib/content-meta";
import { formatRelative, formatNumber } from "@/lib/format";
import { CONTENT_TYPES } from "@shared/content-types";
import { useAuth } from "@/app/AuthProvider";
import { useConfirm, useToast } from "@/app/providers";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  LoadingOverlay,
  PageHeader,
  Pagination,
  Select,
  TableSkeleton,
  TableWrap,
  Td,
  Th,
  Toolbar,
  Tr,
} from "@/components/ui";

const STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "pending", label: "待审核" },
  { value: "scheduled", label: "定时发布" },
  { value: "published", label: "已发布" },
  { value: "trashed", label: "回收站" },
];

const SORT_OPTIONS = [
  { value: "updated", label: "最近更新" },
  { value: "created", label: "创建时间" },
  { value: "published", label: "发布时间" },
  { value: "title", label: "标题" },
  { value: "views", label: "浏览量" },
];

export function ContentListPage() {
  const { can, canAny } = useAuth();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const type = params.get("type") ?? "";
  const status = params.get("status") ?? "all";
  const sort = params.get("sort") ?? "updated";
  const keyword = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  const [searchInput, setSearchInput] = useState(keyword);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSearchInput(keyword);
  }, [keyword]);

  useEffect(() => {
    setSelected([]);
  }, [type, status, sort, keyword, page]);

  const listQuery = useQuery<Paged<ContentSummary>>({
    queryKey: ["contents", { type, status, sort, keyword, page }],
    queryFn: () =>
      apiFetch<Paged<ContentSummary>>("/contents", {
        query: { type, status, sort, q: keyword, page, pageSize: 20 },
      }),
    placeholderData: (previous) => previous,
  });

  const items = listQuery.data?.items ?? [];
  const meta = listQuery.data?.meta ?? { page: 1, pageSize: 20, total: 0, totalPages: 1 };

  const canEdit = canAny(["content.update.any", "content.update.own"]);
  const canDelete = canAny(["content.delete.any", "content.delete.own"]);
  const canPublish = canAny(["content.publish.any", "content.publish.own"]);
  const canRestore = can("content.restore");
  const canCreate = can("content.create");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["contents"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const bulkMutation = useMutation({
    mutationFn: (payload: { ids: string[]; action: "publish" | "trash" | "restore" | "purge" | "pending" }) =>
      apiFetch<BulkResult>("/contents/bulk", { method: "POST", json: payload }),
    onSuccess: (result, variables) => {
      const labels: Record<string, string> = {
        publish: "发布",
        trash: "移入回收站",
        restore: "恢复",
        purge: "彻底删除",
        pending: "提交审核",
      };
      if (result.failed.length === 0) {
        toast.success(`已${labels[variables.action]} ${result.succeeded.length} 条`);
      } else {
        toast.error(
          `已${labels[variables.action]} ${result.succeeded.length} 条，${result.failed.length} 条失败：${result.failed[0]?.reason ?? ""}`,
        );
      }
      setSelected([]);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; target: string }) =>
      apiFetch<ContentSummary>(`/contents/${payload.id}/status`, {
        method: "POST",
        json: { target: payload.target },
      }),
    onSuccess: () => {
      toast.success("状态已更新");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => apiFetch<ContentSummary>(`/contents/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      toast.success("已从回收站恢复");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const purgeMutation = useMutation({
    mutationFn: (id: string) => apiFetch<{ purged: boolean }>(`/contents/${id}/purge`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("已彻底删除");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const updateParams = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (resetPage) next.delete("page");
    setParams(next, { replace: true });
  };

  const allSelected = items.length > 0 && items.every((item) => selected.includes(item.id));
  const isTrashView = status === "trashed";

  const bulkActions = useMemo(() => {
    const actions: { key: string; label: string; action: "publish" | "trash" | "restore" | "purge" | "pending"; danger?: boolean }[] = [];
    if (isTrashView) {
      if (canRestore) {
        actions.push({ key: "restore", label: "恢复", action: "restore" });
        actions.push({ key: "purge", label: "彻底删除", action: "purge", danger: true });
      }
    } else {
      if (canPublish) actions.push({ key: "publish", label: "发布", action: "publish" });
      if (canPublish) actions.push({ key: "pending", label: "提交审核", action: "pending" });
      if (canDelete) actions.push({ key: "trash", label: "移入回收站", action: "trash" });
    }
    return actions;
  }, [isTrashView, canRestore, canPublish, canDelete]);

  return (
    <>
      <PageHeader
        title="内容"
        description="文章、页面、动态、项目共用一套列表；状态只能通过流转接口修改。"
        actions={
          canCreate ? (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate("/contents/new")}>
              新建内容
            </Button>
          ) : null
        }
      />

      <Card>
        <Toolbar>
          <Select
            value={type}
            onChange={(event) => updateParams({ type: event.target.value })}
            className="w-32"
            aria-label="内容类型"
          >
            <option value="">全部类型</option>
            {CONTENT_TYPES.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </Select>

          <Select
            value={status}
            onChange={(event) => updateParams({ status: event.target.value })}
            className="w-32"
            aria-label="内容状态"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select
            value={sort}
            onChange={(event) => updateParams({ sort: event.target.value })}
            className="w-32"
            aria-label="排序方式"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <form
            className="flex min-w-52 flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              updateParams({ q: searchInput.trim() || null });
            }}
          >
            <div className="relative min-w-40 flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="搜索标题、slug、摘要"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="default">
              搜索
            </Button>
            {keyword ? (
              <Button variant="ghost" onClick={() => updateParams({ q: null })}>
                清除
              </Button>
            ) : null}
          </form>
        </Toolbar>

        {selected.length > 0 && bulkActions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft/60 px-4 py-2.5 text-sm">
            <span className="text-accent">已选 {selected.length} 条</span>
            <div className="ml-auto flex flex-wrap gap-2">
              {bulkActions.map((action) => (
                <Button
                  key={action.key}
                  size="sm"
                  variant={action.danger ? "danger" : "default"}
                  loading={bulkMutation.isPending && bulkMutation.variables?.action === action.action}
                  onClick={async () => {
                    if (action.action === "purge") {
                      const ok = await confirm({
                        title: `彻底删除 ${selected.length} 条内容？`,
                        description: "内容、版本、评论与搜索索引都会被物理删除，无法恢复。",
                        confirmText: "彻底删除",
                        tone: "danger",
                      });
                      if (!ok) return;
                    }
                    if (action.action === "trash") {
                      const ok = await confirm({
                        title: `把 ${selected.length} 条内容移入回收站？`,
                        description: "之后仍可在回收站里恢复。",
                        confirmText: "移入回收站",
                      });
                      if (!ok) return;
                    }
                    bulkMutation.mutate({ ids: selected, action: action.action });
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="relative">
          <LoadingOverlay visible={listQuery.isFetching && !listQuery.isLoading} />
          <TableWrap label="内容列表" minWidth={1000}>
            
            <thead>
              <tr>
                {bulkActions.length > 0 ? (
                  <Th className="w-9">
                    <input
                      type="checkbox"
                      aria-label="全选本页"
                      className="h-3.5 w-3.5 cursor-pointer accent-[var(--tb-accent)]"
                      checked={allSelected}
                      onChange={(event) => setSelected(event.target.checked ? items.map((item) => item.id) : [])}
                    />
                  </Th>
                ) : null}
                <Th>标题</Th>
                <Th className="w-20">类型</Th>
                <Th className="w-24">状态</Th>
                <Th className="w-32">作者</Th>
                <Th className="w-28">更新时间</Th>
                <Th className="w-24" align="right">
                  浏览 / 评论
                </Th>
                {/* 操作列要给"编辑 + 前台打开 + 移入回收站"三个动作留够宽度。
                    宽度不足时按钮标签会折行（现在按钮已加 whitespace-nowrap，
                    折行变成溢出），所以这里一次给足。 */}
                <Th className="w-48" align="right">
                  操作
                </Th>
              </tr>
            </thead>

            {listQuery.isLoading ? (
              <TableSkeleton rows={8} columns={8} />
            ) : (
              <tbody>
                {items.map((item) => {
                  const selectedRow = selected.includes(item.id);
                  return (
                    <Tr key={item.id} className={selectedRow ? "bg-hover" : undefined}>
                      {bulkActions.length > 0 ? (
                        <Td>
                          <input
                            type="checkbox"
                            aria-label={`选择 ${item.title}`}
                            className="h-3.5 w-3.5 cursor-pointer accent-[var(--tb-accent)]"
                            checked={selectedRow}
                            onChange={(event) =>
                              setSelected((previous) =>
                                event.target.checked
                                  ? [...previous, item.id]
                                  : previous.filter((id) => id !== item.id),
                              )
                            }
                          />
                        </Td>
                      ) : null}
                      <Td>
                        <Link to={`/contents/${item.id}`} className="block truncate font-medium hover:text-accent">
                          {item.title}
                        </Link>
                        <span className="block truncate font-mono text-xs text-subtle">/{item.slug}</span>
                        {item.terms.length > 0 ? (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {item.terms.slice(0, 4).map((term) => (
                              <Badge key={term.id}>{term.name}</Badge>
                            ))}
                          </span>
                        ) : null}
                      </Td>
                      <Td>
                        <Badge>{contentTypeLabel(item.type)}</Badge>
                      </Td>
                      <Td>
                        <Badge tone={contentStatusTone(item.status)}>{contentStatusLabel(item.status)}</Badge>
                      </Td>
                      <Td className="truncate text-xs text-muted">{item.authorName ?? "—"}</Td>
                      <Td className="whitespace-nowrap text-xs text-muted">{formatRelative(item.updatedAt)}</Td>
                      <Td align="right" className="whitespace-nowrap text-xs tabular-nums text-muted">
                        {formatNumber(item.viewCount)} / {formatNumber(item.commentCount)}
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit ? (
                            <Button size="sm" variant="ghost" onClick={() => navigate(`/contents/${item.id}`)}>
                              <Pencil size={13} />
                              编辑
                            </Button>
                          ) : null}
                          {item.status === "published" ? (
                            <a
                              href={item.type === "page" ? `/${item.slug}` : `/${item.type}/${item.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              title="在前台打开"
                              aria-label={`在前台打开《${item.title}》`}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted transition-colors hover:bg-hover hover:text-fg"
                            >
                              <ExternalLink size={13} />
                            </a>
                          ) : null}
                          {item.status === "trashed" ? (
                            <>
                              {canRestore ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<RotateCcw size={13} />}
                                  loading={restoreMutation.isPending && restoreMutation.variables === item.id}
                                  onClick={() => restoreMutation.mutate(item.id)}
                                >
                                  恢复
                                </Button>
                              ) : null}
                              {canRestore ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-danger hover:text-danger"
                                  icon={<Trash size={13} />}
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: `彻底删除《${item.title}》？`,
                                      description: "内容、版本、评论与搜索索引都会被物理删除，无法恢复。",
                                      confirmText: "彻底删除",
                                      tone: "danger",
                                    });
                                    if (ok) purgeMutation.mutate(item.id);
                                  }}
                                >
                                  彻底删除
                                </Button>
                              ) : null}
                            </>
                          ) : canDelete ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Trash size={13} />}
                              onClick={async () => {
                                const ok = await confirm({
                                  title: `把《${item.title}》移入回收站？`,
                                  description: "之后仍可在回收站里恢复。",
                                  confirmText: "移入回收站",
                                });
                                if (ok) statusMutation.mutate({ id: item.id, target: "trashed" });
                              }}
                            >
                              回收站
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
            ) : keyword || type || status !== "all" ? (
              <EmptyState
                kind="search"
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setParams(new URLSearchParams(), { replace: true });
                    }}
                  >
                    清空筛选条件
                  </Button>
                }
              />
            ) : (
              <EmptyState
                kind="empty"
                description="还没有任何内容。"
                action={
                  canCreate ? (
                    <Button variant="primary" size="sm" onClick={() => navigate("/contents/new")}>
                      新建第一篇
                    </Button>
                  ) : null
                }
              />
            )
          ) : null}
        </div>

        {items.length > 0 ? <Pagination meta={meta} onPage={(next) => updateParams({ page: String(next) }, false)} /> : null}
      </Card>

      <p className="mt-3 text-xs text-subtle">
        提示：只有持有 <code className="font-mono">content.update.any</code> 的账号能看到并编辑他人内容。
      </p>
    </>
  );
}
