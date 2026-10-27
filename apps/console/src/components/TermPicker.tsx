/**
 * 分类 / 标签 / 系列选择器。
 *
 * 三个分类法一次拉全（页面量级在百，分页反而让勾选状态难以理解）：
 * 分类按树缩进展示，标签与系列按内容数倒序平铺。
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { Paged, TermNode } from "@/lib/types";
import { cn } from "@/lib/cn";
import { EmptyState, LoadingBlock } from "@/components/ui";

export type TermTypeKey = "category" | "tag" | "series";

const TYPE_LABELS: Record<TermTypeKey, string> = {
  category: "分类",
  tag: "标签",
  series: "系列",
};

interface FlatTerm {
  id: string;
  name: string;
  count: number;
  depth: number;
}

function flatten(nodes: TermNode[], depth = 0): FlatTerm[] {
  const out: FlatTerm[] = [];
  for (const node of nodes) {
    out.push({ id: node.id, name: node.name, count: node.count, depth });
    if (node.children.length > 0) out.push(...flatten(node.children, depth + 1));
  }
  return out;
}

function useTermList(type: TermTypeKey) {
  return useQuery<Paged<TermNode>>({
    queryKey: ["terms", type, "picker"],
    queryFn: () => apiFetch<Paged<TermNode>>("/terms", { query: { type, pageSize: 100, withCount: "true" } }),
    staleTime: 60_000,
  });
}

export function TermPicker({
  value,
  onChange,
  disabled,
  types = ["category", "tag", "series"],
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  types?: TermTypeKey[];
}) {
  const category = useTermList("category");
  const tag = useTermList("tag");
  const series = useTermList("series");

  const lists = useMemo(() => {
    const source: Record<TermTypeKey, Paged<TermNode> | undefined> = {
      category: category.data,
      tag: tag.data,
      series: series.data,
    };
    const out: { type: TermTypeKey; items: FlatTerm[] }[] = [];
    for (const type of types) {
      out.push({ type, items: flatten(source[type]?.items ?? []) });
    }
    return out;
  }, [category.data, tag.data, series.data, types]);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const list of lists) {
      for (const item of list.items) map.set(item.id, item.name);
    }
    return map;
  }, [lists]);

  const loading = category.isLoading || tag.isLoading || series.isLoading;
  const failed = category.isError || tag.isError || series.isError;

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  };

  if (loading) return <LoadingBlock label="加载分类标签" />;
  if (failed) return <EmptyState kind="error" description="分类标签没取回来，稍后重试。" />;

  const empty = lists.every((list) => list.items.length === 0);
  if (empty) return <EmptyState kind="empty" description="还没有分类或标签，先到「分类与标签」页创建。" />;

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-xs border border-accent/35 bg-accent-soft px-1.5 py-0.5 text-xs text-accent"
            >
              {nameById.get(id) ?? id}
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggle(id)}
                aria-label={`移除 ${nameById.get(id) ?? id}`}
                className="text-accent/70 transition-colors hover:text-accent"
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {lists.map((list) =>
        list.items.length === 0 ? null : (
          <div key={list.type} className="rounded-sm border border-line">
            <p className="border-b border-line bg-sunken px-2.5 py-1.5 text-xs font-medium text-muted">
              {TYPE_LABELS[list.type]}
            </p>
            <div className="max-h-52 overflow-y-auto p-1.5">
              {list.items.map((item) => (
                <label
                  key={item.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-xs px-2 py-1 text-sm transition-colors hover:bg-hover",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                  style={{ paddingLeft: `${item.depth * 14 + 8}px` }}
                >
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={value.includes(item.id)}
                    onChange={() => toggle(item.id)}
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--tb-accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="shrink-0 text-xs text-subtle">{item.count}</span>
                </label>
              ))}
            </div>
          </div>
        ),
      )}
    </div>
  );
}
