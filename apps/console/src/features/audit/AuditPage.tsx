/**
 * 审计日志。
 *
 * 筛选条件全部下推到 SQL（服务端实现），所以这里只负责收集条件与翻页。
 * meta 已经是对象（服务端解析过），默认折行展示，展开后看格式化 JSON。
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api";
import type { AuditEntry, Paged } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, EmptyState, Field, Input, LoadingOverlay, PageHeader, Pagination, TableSkeleton, TableWrap, Td, Th, Toolbar, Tr } from "@/components/ui";

export function AuditPage() {
  const [action, setAction] = useState("");
  const [actorId, setActorId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [action, actorId, search, from, to]);

  const listQuery = useQuery<Paged<AuditEntry>>({
    queryKey: ["audit", { action, actorId, search, from, to, page }],
    queryFn: () =>
      apiFetch<Paged<AuditEntry>>("/audit", {
        query: {
          action,
          actorId,
          q: search,
          from: from ? new Date(from).toISOString() : "",
          to: to ? new Date(to).toISOString() : "",
          page,
          pageSize: 20,
        },
      }),
    placeholderData: (previous) => previous,
  });

  const actionsQuery = useQuery<{ items: string[] }>({
    queryKey: ["audit-actions"],
    queryFn: () => apiFetch<{ items: string[] }>("/audit/actions"),
    staleTime: 300_000,
  });

  const items = listQuery.data?.items ?? [];
  const meta = listQuery.data?.meta ?? { page: 1, pageSize: 20, total: 0, totalPages: 1 };
  const hasFilter = Boolean(action || search || from || to);

  return (
    <>
      <PageHeader title="审计日志" description="写操作都会留一条记录：谁、什么时候、对什么、结果如何。" />

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
                placeholder="搜索动作、操作人或目标 ID"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="default">
              搜索
            </Button>
          </form>

          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            aria-label="动作筛选"
            className="h-8.5 w-44 cursor-pointer rounded-sm border border-line bg-surface px-2.5 text-sm"
          >
            <option value="">全部动作</option>
            {(actionsQuery.data?.items ?? []).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <Input
              value={actorId}
              onChange={(event) => setActorId(event.target.value)}
              placeholder="操作人 ID（精确匹配）"
              aria-label="操作人 ID"
              className="w-48"
            />
            <Input
              type="datetime-local"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              aria-label="起始时间"
              className="w-48"
            />
            <span className="text-xs text-subtle">至</span>
            <Input
              type="datetime-local"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              aria-label="结束时间"
              className="w-48"
            />
          </div>

          {hasFilter ? (
            <Button
              variant="ghost"
              onClick={() => {
                setAction("");
                setActorId("");
                setKeyword("");
                setSearch("");
                setFrom("");
                setTo("");
              }}
            >
              清空筛选
            </Button>
          ) : null}
        </Toolbar>

        <div className="relative">
          <LoadingOverlay visible={listQuery.isFetching && !listQuery.isLoading} />
          <TableWrap label="审计日志" minWidth={1020}>
            
            <thead>
              <tr>
                <Th className="w-40">时间</Th>
                <Th className="w-36">操作人</Th>
                <Th className="w-44">动作</Th>
                <Th className="w-52">对象</Th>
                <Th>meta</Th>
                <Th className="w-32">来源 IP</Th>
              </tr>
            </thead>
            {listQuery.isLoading ? (
              <TableSkeleton rows={8} columns={6} />
            ) : (
              <tbody>
                {items.map((entry) => {
                  const open = expanded === entry.id;
                  const metaKeys = Object.keys(entry.meta);
                  return (
                    <Tr key={entry.id}>
                      <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(entry.createdAt)}</Td>
                      <Td className="truncate text-xs">
                        {entry.actorName ?? <span className="text-subtle">系统</span>}
                        {entry.actorId ? (
                          <span className="block truncate font-mono text-[11px] text-subtle">{entry.actorId}</span>
                        ) : null}
                      </Td>
                      <Td>
                        <Badge tone="info">{entry.action}</Badge>
                      </Td>
                      <Td className="text-xs">
                        {entry.targetType ? (
                          <>
                            <span className="text-muted">{entry.targetType}</span>
                            {entry.targetId ? (
                              <span className="block truncate font-mono text-[11px] text-subtle">{entry.targetId}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </Td>
                      <Td>
                        {metaKeys.length === 0 ? (
                          <span className="text-xs text-subtle">—</span>
                        ) : (
                          <div>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              onClick={() => setExpanded(open ? null : entry.id)}
                            >
                              {metaKeys.length} 个字段
                            </Button>
                            {open ? (
                              <pre className="mt-1 max-h-56 overflow-auto rounded-sm border border-line bg-sunken p-2 font-mono text-[11px] text-muted">
                                {JSON.stringify(entry.meta, null, 2)}
                              </pre>
                            ) : (
                              <p className="mt-0.5 truncate text-[11px] text-subtle">
                                {metaKeys.map((key) => `${key}=${String(entry.meta[key])}`).join(" · ")}
                              </p>
                            )}
                          </div>
                        )}
                      </Td>
                      <Td className="font-mono text-[11px] text-subtle">{entry.ip ?? "—"}</Td>
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
              <EmptyState
                kind={hasFilter ? "search" : "empty"}
                description={hasFilter ? "这个条件下没有日志。" : "还没有任何操作记录。"}
              />
            )
          ) : null}
        </div>

        {items.length > 0 ? <Pagination meta={meta} onPage={setPage} /> : null}

        <div className="border-t border-line px-4 py-3">
          <Field label="说明">
            <p className="text-xs text-subtle">
              时间区间按 UTC 存储；界面输入的是本地时间，提交前已转成 ISO。删除历史日志（
              <span className="font-mono">DELETE /api/audit/purge</span>）仅在站点所有者会话里可用，
              为避免误操作，这里没有放入口。
            </p>
          </Field>
        </div>
      </Card>
    </>
  );
}
