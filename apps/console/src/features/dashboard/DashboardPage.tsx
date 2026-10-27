/**
 * 仪表盘：一次 GET /api/dashboard 拿到全部卡片数据。
 *
 * 趋势图用纯 CSS 柱状图（高度百分比 + flex 布局），不引图表库：
 * 14 根柱子用不着一套动画与比例尺系统，而体积是后台首屏的真实成本。
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileText, MessageSquare, Image as ImageIcon, Users, Tags, Puzzle, Clock, TrendingUp } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api";
import type { DashboardData } from "@/lib/types";
import { contentStatusLabel, contentStatusTone, contentTypeLabel } from "@/lib/content-meta";
import { formatNumber, formatRelative, truncate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, LoadingBlock, PageHeader, Td, Th, Tr, TableWrap } from "@/components/ui";

export function DashboardPage() {
  const dashboard = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<DashboardData>("/dashboard"),
    staleTime: 30_000,
  });

  if (dashboard.isLoading) return <LoadingBlock label="正在汇总站点数据" />;
  if (dashboard.isError) {
    return (
      <Card>
        <EmptyState kind="error" description={errorMessage(dashboard.error)} />
      </Card>
    );
  }

  const data = dashboard.data;
  if (!data) return null;

  const { counts, system } = data;
  const peak = Math.max(1, ...data.publishTrend.map((point) => point.count));

  return (
    <>
      <PageHeader title="仪表盘" description="站点总量、待办与近 14 天发布情况。" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="内容" value={counts.contents} hint={`已发布 ${counts.published}`} to="/contents" />
        <StatCard label="待审内容" value={counts.pending} hint={`草稿 ${counts.drafts}`} to="/contents?status=pending" accent={counts.pending > 0} />
        <StatCard label="定时发布" value={counts.scheduled} hint={`回收站 ${counts.trashed}`} to="/contents?status=scheduled" />
        <StatCard
          label="评论"
          value={counts.comments}
          hint={`待审 ${counts.pendingComments}`}
          to="/comments"
          accent={counts.pendingComments > 0}
        />
        <StatCard label="媒体" value={counts.media} hint="R2 对象" to="/media" />
        <StatCard label="用户" value={counts.users} hint={`分类标签 ${counts.terms}`} to="/users" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="近 14 天发布趋势"
            description="按 published_at 的 UTC 日期归集，缺的日子补 0。"
            actions={
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <TrendingUp size={13} />
                峰值 {peak}
              </span>
            }
          />
          <div className="flex h-44 items-end gap-1.5 px-4 py-4">
            {data.publishTrend.map((point) => {
              const height = point.count === 0 ? 2 : Math.max(6, Math.round((point.count / peak) * 100));
              return (
                <div key={point.date} className="group flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <span className="text-xs text-subtle opacity-0 transition-opacity group-hover:opacity-100">
                    {point.count}
                  </span>
                  <div
                    className="w-full rounded-xs bg-accent/80 transition-colors group-hover:bg-accent"
                    style={{ height: `${height}%` }}
                    title={`${point.date}：${point.count} 篇`}
                  />
                  <span className="truncate text-[10px] text-subtle">{point.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="系统信息" description="运行时与存储后端。" />
          <dl className="divide-y divide-line text-sm">
            {[
              ["环境", system.environment],
              ["数据库", system.database],
              ["存储", system.storage],
              ["版本", system.version],
              ["请求 ID", system.requestId],
              ["插件", String(counts.plugins)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 px-4 py-2">
                <dt className="text-muted">{label}</dt>
                <dd className="truncate font-mono text-xs text-fg">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="最近更新"
            description="按更新时间倒序，最多 8 条。"
            actions={
              <Link to="/contents" className="text-xs text-accent hover:underline">
                全部内容
              </Link>
            }
          />
          {data.recentContents.length === 0 ? (
            <EmptyState kind="empty" description="还没有任何内容。" />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>标题</Th>
                  <Th>类型</Th>
                  <Th>状态</Th>
                  <Th align="right">更新</Th>
                </tr>
              </thead>
              <tbody>
                {data.recentContents.map((item) => (
                  <Tr key={item.id}>
                    <Td className="max-w-64">
                      <Link to={`/contents/${item.id}`} className="block truncate hover:text-accent">
                        {item.title}
                      </Link>
                      <span className="block truncate text-xs text-subtle">{item.authorName ?? "未知作者"}</span>
                    </Td>
                    <Td>
                      <Badge>{contentTypeLabel(item.type)}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={contentStatusTone(item.status)}>{contentStatusLabel(item.status)}</Badge>
                    </Td>
                    <Td align="right" className="whitespace-nowrap text-xs text-muted">
                      {formatRelative(item.updatedAt)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader
            title="最近评论"
            description="不含回收站。"
            actions={
              <Link to="/comments" className="text-xs text-accent hover:underline">
                评论管理
              </Link>
            }
          />
          {data.recentComments.length === 0 ? (
            <EmptyState kind="empty" description="还没有访客评论。" />
          ) : (
            <ul className="divide-y divide-line">
              {data.recentComments.map((comment) => (
                <li key={comment.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-fg">{comment.authorName}</span>
                    <span className="text-xs text-subtle">{formatRelative(comment.createdAt)}</span>
                    <span className="ml-auto shrink-0">
                      <Badge tone={comment.status === "pending" ? "warn" : comment.status === "spam" ? "danger" : "ok"}>
                        {comment.status === "pending" ? "待审" : comment.status === "spam" ? "垃圾" : "已通过"}
                      </Badge>
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{truncate(comment.body, 100)}</p>
                  <p className="mt-0.5 truncate text-xs text-subtle">于《{comment.contentTitle}》</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader title="浏览排行" description="已发布内容按浏览量倒序。" />
          {data.topContents.length === 0 ? (
            <EmptyState kind="empty" description="还没有已发布的内容。" />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th className="w-12" align="right">
                    #
                  </Th>
                  <Th>标题</Th>
                  <Th align="right">
                    <span className="inline-flex items-center gap-1">
                      <FileText size={12} /> 浏览
                    </span>
                  </Th>
                  <Th align="right">
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare size={12} /> 评论
                    </span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.topContents.map((item, index) => (
                  <Tr key={item.id}>
                    <Td align="right" className="text-xs text-subtle">
                      {index + 1}
                    </Td>
                    <Td>
                      <Link to={`/contents/${item.id}`} className="hover:text-accent">
                        {item.title}
                      </Link>
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {formatNumber(item.viewCount)}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {formatNumber(item.commentCount)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-subtle">
        <span className="inline-flex items-center gap-1">
          <Tags size={12} /> 分类标签 {counts.terms}
        </span>
        <span className="inline-flex items-center gap-1">
          <ImageIcon size={12} /> 媒体 {counts.media}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users size={12} /> 用户 {counts.users}
        </span>
        <span className="inline-flex items-center gap-1">
          <Puzzle size={12} /> 插件 {counts.plugins}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={12} /> 统计时间 {formatRelative(new Date().toISOString())}
        </span>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  hint,
  to,
  accent = false,
}: {
  label: string;
  value: number;
  hint: string;
  to: string;
  accent?: boolean;
}) {
  return (
    <Link
      to={to}
      className="rounded-sm border border-line bg-surface px-3.5 py-3 transition-colors hover:border-line-strong hover:bg-hover"
    >
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${accent ? "text-accent" : "text-fg"}`}>
        {formatNumber(value)}
      </p>
      <p className="mt-0.5 truncate text-xs text-subtle">{hint}</p>
    </Link>
  );
}
