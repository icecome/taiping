/**
 * 评论管理。
 *
 * 四个状态分区（待审 / 已通过 / 垃圾 / 回收站）各自分页；状态计数从
 * `GET /api/comments/stats` 一次拿全，避免为每个页签单独发一次请求。
 * 删除是物理删除（含该评论的全部回复），所以必须二次确认。
 */
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Check, CornerUpLeft, Search, ShieldAlert, Trash, Undo2 } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api";
import type { BulkResult, CommentItem, CommentStats, Paged } from "@/lib/types";
import { commentStatusLabel, commentStatusTone } from "@/lib/content-meta";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/app/AuthProvider";
import { useConfirm, useToast } from "@/app/providers";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingOverlay,
  Modal,
  PageHeader,
  Pagination,
  TableSkeleton,
  TableWrap,
  Tabs,
  Td,
  Textarea,
  Th,
  Toolbar,
  Tr,
} from "@/components/ui";

type CommentTab = "all" | "pending" | "approved" | "spam" | "trashed";

export function CommentsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") ?? "all") as CommentTab;
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const keyword = params.get("q") ?? "";

  const [searchInput, setSearchInput] = useState(keyword);
  const [selected, setSelected] = useState<string[]>([]);
  const [replying, setReplying] = useState<CommentItem | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();

  const canModerate = can("comment.moderate");
  const canDelete = can("comment.delete");
  const canReply = can("comment.reply");

  useEffect(() => {
    setSearchInput(keyword);
  }, [keyword]);

  useEffect(() => {
    setSelected([]);
  }, [status, keyword, page]);

  const listQuery = useQuery<Paged<CommentItem>>({
    queryKey: ["comments", { status, page, keyword }],
    queryFn: () => apiFetch<Paged<CommentItem>>("/comments", { query: { status, page, pageSize: 20, q: keyword } }),
    placeholderData: (previous) => previous,
  });

  const statsQuery = useQuery<CommentStats>({
    queryKey: ["comment-stats"],
    queryFn: () => apiFetch<CommentStats>("/comments/stats"),
    staleTime: 20_000,
  });

  const items = listQuery.data?.items ?? [];
  const meta = listQuery.data?.meta ?? { page: 1, pageSize: 20, total: 0, totalPages: 1 };
  const stats = statsQuery.data;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["comments"] });
    void queryClient.invalidateQueries({ queryKey: ["comment-stats"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const moderateMutation = useMutation({
    mutationFn: (payload: { id: string; status: string }) =>
      apiFetch<CommentItem>(`/comments/${payload.id}/moderate`, { method: "POST", json: { status: payload.status } }),
    onSuccess: (_result, variables) => {
      toast.success(`已标记为「${commentStatusLabel(variables.status)}」`);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean; removed: number }>(`/comments/${id}`, { method: "DELETE" }),
    onSuccess: (result) => {
      toast.success(`已删除 ${result.removed} 条（含子回复）`);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const replyMutation = useMutation({
    mutationFn: (payload: { id: string; body: string }) =>
      apiFetch<CommentItem>(`/comments/${payload.id}/reply`, { method: "POST", json: { body: payload.body } }),
    onSuccess: () => {
      toast.success("回复已发布");
      setReplying(null);
      setReplyBody("");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const bulkMutation = useMutation({
    mutationFn: (payload: { ids: string[]; action: string }) =>
      apiFetch<BulkResult>("/comments/bulk", { method: "POST", json: payload }),
    onSuccess: (result) => {
      if (result.failed.length === 0) toast.success(`已处理 ${result.succeeded.length} 条`);
      else toast.error(`成功 ${result.succeeded.length} 条，失败 ${result.failed.length} 条`);
      setSelected([]);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const setParamsSafely = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (resetPage) next.delete("page");
    setParams(next, { replace: true });
  };

  const tabItems: { value: CommentTab; label: string; count?: number }[] = [
    { value: "all", label: "全部", count: stats?.total },
    { value: "pending", label: "待审", count: stats?.pending },
    { value: "approved", label: "已通过", count: stats?.approved },
    { value: "spam", label: "垃圾", count: stats?.spam },
    { value: "trashed", label: "回收站", count: stats?.trashed },
  ];

  const rowActions = (item: CommentItem) => {
    const actions: { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean }[] = [];
    if (canModerate && item.status !== "approved") {
      actions.push({
        label: "通过",
        icon: <Check size={13} />,
        onClick: () => moderateMutation.mutate({ id: item.id, status: "approved" }),
      });
    }
    if (canModerate && item.status !== "spam") {
      actions.push({
        label: "垃圾",
        icon: <ShieldAlert size={13} />,
        onClick: () => moderateMutation.mutate({ id: item.id, status: "spam" }),
      });
    }
    if (canModerate && item.status !== "pending") {
      actions.push({
        label: "待审",
        icon: <Undo2 size={13} />,
        onClick: () => moderateMutation.mutate({ id: item.id, status: "pending" }),
      });
    }
    if (canReply) {
      actions.push({
        label: "回复",
        icon: <CornerUpLeft size={13} />,
        onClick: () => {
          setReplying(item);
          setReplyBody("");
        },
      });
    }
    if (canDelete) {
      actions.push({
        label: "删除",
        icon: <Trash size={13} />,
        danger: true,
        onClick: () => {
          void confirm({
            title: "删除这条评论？",
            description: "该评论及其全部回复会被物理删除，无法恢复。",
            confirmText: "删除",
            tone: "danger",
          }).then((ok) => {
            if (ok) deleteMutation.mutate(item.id);
          });
        },
      });
    }
    return actions;
  };

  return (
    <>
      <PageHeader title="评论" description="审核、回复与清理访客评论；评论数只统计已通过的部分。" />

      <Card>
        <Tabs value={status} onChange={(next) => setParamsSafely({ status: next === "all" ? null : next })} items={tabItems} />
        <Toolbar>
          <form
            className="flex min-w-52 flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setParamsSafely({ q: searchInput.trim() || null });
            }}
          >
            <div className="relative min-w-40 flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="搜索作者、邮箱或正文"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="default">
              搜索
            </Button>
            {keyword ? (
              <Button variant="ghost" onClick={() => setParamsSafely({ q: null })}>
                清除
              </Button>
            ) : null}
          </form>
        </Toolbar>

        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft/60 px-4 py-2.5 text-sm">
            <span className="text-accent">已选 {selected.length} 条</span>
            <div className="ml-auto flex flex-wrap gap-2">
              {canModerate
                ? (
                    [
                      ["approved", "批量通过"],
                      ["pending", "批量待审"],
                      ["spam", "批量垃圾"],
                      ["trashed", "批量回收"],
                    ] as [string, string][]
                  ).map(([action, label]) => (
                    <Button
                      key={action}
                      size="sm"
                      onClick={() => bulkMutation.mutate({ ids: selected, action })}
                      loading={bulkMutation.isPending && bulkMutation.variables?.action === action}
                    >
                      {label}
                    </Button>
                  ))
                : null}
              {canDelete ? (
                <Button
                  size="sm"
                  variant="danger"
                  loading={bulkMutation.isPending && bulkMutation.variables?.action === "delete"}
                  onClick={async () => {
                    const ok = await confirm({
                      title: `删除 ${selected.length} 条评论？`,
                      description: "包含各自的子回复，物理删除后无法恢复。",
                      confirmText: "删除",
                      tone: "danger",
                    });
                    if (ok) bulkMutation.mutate({ ids: selected, action: "delete" });
                  }}
                >
                  批量删除
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                取消选择
              </Button>
            </div>
          </div>
        ) : null}

        <div className="relative">
          <LoadingOverlay visible={listQuery.isFetching && !listQuery.isLoading} />
          <TableWrap label="评论列表" minWidth={1020}>
            
            <thead>
              <tr>
                <Th className="w-9">
                  <input
                    type="checkbox"
                    aria-label="全选本页"
                    className="h-3.5 w-3.5 cursor-pointer accent-[var(--tb-accent)]"
                    checked={items.length > 0 && items.every((item) => selected.includes(item.id))}
                    onChange={(event) => setSelected(event.target.checked ? items.map((item) => item.id) : [])}
                  />
                </Th>
                <Th>评论</Th>
                <Th className="w-52">所属内容</Th>
                <Th className="w-24">状态</Th>
                <Th className="w-40">时间</Th>
                <Th className="w-64" align="right">
                  操作
                </Th>
              </tr>
            </thead>
            {listQuery.isLoading ? (
              <TableSkeleton rows={6} columns={6} />
            ) : (
              <tbody>
                {items.map((item) => (
                  <Tr key={item.id} className={selected.includes(item.id) ? "bg-hover" : undefined}>
                    <Td>
                      <input
                        type="checkbox"
                        aria-label="选择评论"
                        className="h-3.5 w-3.5 cursor-pointer accent-[var(--tb-accent)]"
                        checked={selected.includes(item.id)}
                        onChange={(event) =>
                          setSelected((previous) =>
                            event.target.checked ? [...previous, item.id] : previous.filter((id) => id !== item.id),
                          )
                        }
                      />
                    </Td>
                    <Td className="max-w-md">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-fg">{item.authorName}</span>
                        {item.authorEmail ? <span className="text-xs text-subtle">{item.authorEmail}</span> : null}
                        {item.isOwner ? <Badge tone="accent">站点自己</Badge> : null}
                        {item.depth > 0 ? <Badge>第 {item.depth + 1} 层</Badge> : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted">{item.body}</p>
                    </Td>
                    <Td>
                      {item.contentId ? (
                        <Link to={`/contents/${item.contentId}`} className="block truncate text-sm hover:text-accent">
                          {item.contentTitle ?? "（内容已删除）"}
                        </Link>
                      ) : (
                        <span className="text-sm text-subtle">—</span>
                      )}
                      <span className="block truncate text-xs text-subtle">{item.ip ?? ""}</span>
                    </Td>
                    <Td>
                      <Badge tone={commentStatusTone(item.status)}>{commentStatusLabel(item.status)}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(item.createdAt)}</Td>
                    <Td align="right">
                      <div className="flex flex-wrap items-center justify-end gap-0.5">
                        {rowActions(item).map((action) => (
                          <Button
                            key={action.label}
                            size="sm"
                            variant="ghost"
                            className={action.danger ? "text-danger hover:text-danger" : undefined}
                            icon={action.icon}
                            onClick={action.onClick}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            )}
          </TableWrap>

          {!listQuery.isLoading && items.length === 0 ? (
            listQuery.isError ? (
              <EmptyState kind="error" description={errorMessage(listQuery.error)} />
            ) : (
              <EmptyState
                kind={keyword || status !== "all" ? "search" : "empty"}
                description={keyword || status !== "all" ? "这个条件下没有评论。" : "还没有访客留下评论。"}
              />
            )
          ) : null}
        </div>

        {items.length > 0 ? <Pagination meta={meta} onPage={(next) => setParamsSafely({ page: String(next) }, false)} /> : null}
      </Card>

      <Modal
        open={replying !== null}
        onClose={() => setReplying(null)}
        title="回复评论"
        description={replying ? `回复 ${replying.authorName}：${replying.body.slice(0, 60)}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReplying(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={replyMutation.isPending}
              disabled={!replyBody.trim()}
              onClick={() => replying && replyMutation.mutate({ id: replying.id, body: replyBody.trim() })}
            >
              发布回复
            </Button>
          </>
        }
      >
        <Field label="回复正文" hint="以当前登录账号的显示名发出，状态直接为已通过。">
          <Textarea rows={5} value={replyBody} onChange={(event) => setReplyBody(event.target.value)} autoFocus />
        </Field>
      </Modal>
    </>
  );
}
