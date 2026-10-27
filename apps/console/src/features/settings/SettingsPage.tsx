/**
 * 系统设置。
 *
 * 左栏分组直接来自 `GET /api/settings` 的 `siteSchema`（服务端由 shared/settings-schema.ts 生成），
 * 右栏表单由字段定义渲染 —— 后台不认识任何一个具体设置键。
 *
 * 提交时只带上当前分组的键：一是请求体干净，二是 sensitive 字段（仅 owner 可改）
 * 在非 owner 的会话里根本不会被带上，避免整组保存时被服务端 403 拦下。
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Paintbrush, RefreshCw, Save, Trash2, Wrench } from "lucide-react";
import { apiFetch, errorMessage, isApiError } from "@/lib/api";
import type { SettingsOverview } from "@/lib/types";
import { useAuth } from "@/app/AuthProvider";
import { useConfirm, useToast } from "@/app/providers";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  LoadingBlock,
  PageHeader,
} from "@/components/ui";
import { SettingFieldList, isFieldVisible, type SettingValues } from "@/components/SettingFields";
import { cn } from "@/lib/cn";

type Section = { kind: "group"; key: string } | { kind: "theme" } | { kind: "maintenance" };

export function SettingsPage() {
  const [section, setSection] = useState<Section>({ kind: "group", key: "general" });
  const [siteValues, setSiteValues] = useState<SettingValues>({});
  const [themeValues, setThemeValues] = useState<SettingValues>({});
  const [savedSnapshot, setSavedSnapshot] = useState<string>("{}");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { can, isOwner } = useAuth();

  const canManage = can("setting.manage");
  const canManageTheme = can("theme.manage");
  const canRunTasks = can("system.task.run");

  const overviewQuery = useQuery<SettingsOverview>({
    queryKey: ["settings"],
    queryFn: () => apiFetch<SettingsOverview>("/settings"),
  });

  const overview = overviewQuery.data;

  useEffect(() => {
    if (!overview) return;
    const next: SettingValues = {};
    for (const group of overview.siteSchema) {
      for (const field of group.fields) {
        next[field.key] = overview.site[field.key] ?? field.default;
      }
    }
    setSiteValues(next);
    setSavedSnapshot(JSON.stringify(next));
    setThemeValues({ ...overview.theme.values });
  }, [overview]);

  const groups = overview?.siteSchema ?? [];
  const activeGroup = section.kind === "group" ? groups.find((group) => group.group === section.key) ?? groups[0] : null;

  const visibleFields = useMemo(
    () => (activeGroup ? activeGroup.fields.filter((field) => isFieldVisible(field, isOwner)) : []),
    [activeGroup, isOwner],
  );

  const dirty = JSON.stringify(siteValues) !== savedSnapshot;

  useEffect(() => {
    if (groups.length > 0 && section.kind === "group" && !groups.some((group) => group.group === section.key)) {
      setSection({ kind: "group", key: groups[0]?.group ?? "general" });
    }
  }, [groups, section]);

  const siteMutation = useMutation({
    mutationFn: (values: SettingValues) =>
      apiFetch<{ updated: number; site: Record<string, unknown> }>("/settings/site", {
        method: "PATCH",
        json: { values },
      }),
    onSuccess: (_data, values) => {
      toast.success("设置已保存");
      setErrors({});
      // 快照按"服务端现在持有的值"推进：只覆盖本次提交的键，
      // 免得用户在请求飞行期间又改了别的项却被误判成已同步。
      setSavedSnapshot((previous) => {
        const merged = { ...(JSON.parse(previous) as SettingValues), ...values };
        return JSON.stringify(merged);
      });
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error) => {
      if (isApiError(error) && Object.keys(error.fields).length > 0) setErrors(error.fields);
      toast.error(errorMessage(error));
    },
  });

  const themeMutation = useMutation({
    mutationFn: (payload: { active?: string; values?: SettingValues }) =>
      apiFetch<{ active: string; values: Record<string, unknown> }>("/settings/theme", {
        method: "PATCH",
        json: payload,
      }),
    onSuccess: (_result, variables) => {
      toast.success(variables.active ? "主题已切换" : "主题配置已保存");
      setErrors({});
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error) => {
      if (isApiError(error) && Object.keys(error.fields).length > 0) setErrors(error.fields);
      toast.error(errorMessage(error));
    },
  });

  const maintenanceMutation = useMutation({
    mutationFn: () => apiFetch<{ published: number; purged: number; tasks: number }>("/settings/maintenance/run", { method: "POST" }),
    onSuccess: (result) => {
      toast.success(`维护任务完成：发布 ${result.published} 篇，清理 ${result.purged} 条，执行任务 ${result.tasks} 个`);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const cacheMutation = useMutation({
    mutationFn: () => apiFetch<{ cleared: boolean; version: string }>("/settings/cache", { method: "DELETE" }),
    onSuccess: (result) => {
      toast.success(`页面缓存已清空，新版本号 ${result.version}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (overviewQuery.isLoading) return <LoadingBlock label="加载系统设置" />;
  if (overviewQuery.isError) {
    return (
      <Card>
        <EmptyState kind="error" description={errorMessage(overviewQuery.error)} />
      </Card>
    );
  }
  if (!overview) return null;

  const activeTheme = overview.theme.themes.find((theme) => theme.id === overview.theme.active);
  const visibleThemeFields = overview.theme.schema.filter((field) => isFieldVisible(field, isOwner));

  return (
    <>
      <PageHeader
        title="系统设置"
        description="站点配置、主题与维护操作；敏感项（登录策略、开放注册）仅站点所有者可见。"
        actions={
          canManage && activeGroup ? (
            <Button
              variant="primary"
              icon={<Save size={14} />}
              disabled={!dirty}
              loading={siteMutation.isPending}
              onClick={() => {
                const values: SettingValues = {};
                for (const field of visibleFields) values[field.key] = siteValues[field.key];
                siteMutation.mutate(values);
              }}
            >
              保存本组
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Card className="h-fit">
          <nav className="py-1.5">
            {groups.map((group) => {
              const selected = section.kind === "group" && group.group === activeGroup?.group;
              const hidden = group.fields.filter((field) => isFieldVisible(field, isOwner)).length;
              return (
                <button
                  key={group.group}
                  type="button"
                  onClick={() => setSection({ kind: "group", key: group.group })}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left transition-colors",
                    selected ? "bg-accent-soft" : "hover:bg-hover",
                  )}
                >
                  <span className={cn("text-sm", selected ? "font-medium text-accent" : "text-fg")}>{group.label}</span>
                  <span className="text-xs text-subtle">
                    {hidden} 项
                    {hidden !== group.fields.length ? `（${group.fields.length - hidden} 项仅所有者可见）` : ""}
                  </span>
                </button>
              );
            })}

            <div className="mt-2 border-t border-line pt-1.5">
              <button
                type="button"
                onClick={() => setSection({ kind: "theme" })}
                className={cn(
                  "flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors",
                  section.kind === "theme" ? "bg-accent-soft font-medium text-accent" : "text-fg hover:bg-hover",
                )}
              >
                <Paintbrush size={14} strokeWidth={1.75} />
                主题
              </button>
              <button
                type="button"
                onClick={() => setSection({ kind: "maintenance" })}
                className={cn(
                  "flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors",
                  section.kind === "maintenance" ? "bg-accent-soft font-medium text-accent" : "text-fg hover:bg-hover",
                )}
              >
                <Wrench size={14} strokeWidth={1.75} />
                维护
              </button>
            </div>
          </nav>
        </Card>

        {/* ------------------------------------------------ 站点设置分组 */}
        {section.kind === "group" && activeGroup ? (
          <Card>
            <CardHeader
              title={activeGroup.label}
              description={activeGroup.description}
              actions={
                dirty ? <Badge tone="warn">有未保存修改</Badge> : <Badge tone="ok">已同步</Badge>
              }
            />
            <div className="px-4 py-4">
              {!canManage ? (
                <p className="mb-3 text-xs text-subtle">当前账号没有 setting.manage 权限，表单为只读。</p>
              ) : null}
              {visibleFields.length === 0 ? (
                <EmptyState kind="forbidden" description="这一组设置项全部仅站点所有者可见。" />
              ) : (
                <SettingFieldList
                  fields={visibleFields}
                  values={siteValues}
                  errors={errors}
                  disabled={!canManage}
                  onChange={(key, value) => setSiteValues((previous) => ({ ...previous, [key]: value }))}
                />
              )}
            </div>
          </Card>
        ) : null}

        {/* ------------------------------------------------ 主题 */}
        {section.kind === "theme" ? (
          <Card>
            <CardHeader
              title="主题"
              description={
                activeTheme
                  ? `${activeTheme.name} v${activeTheme.version} · ${activeTheme.author}`
                  : `当前主题：${overview.theme.active}`
              }
            />
            <div className="flex flex-col gap-5 px-4 py-4">
              <div className="flex flex-col gap-3">
                <p className="text-xs font-medium text-muted">启用主题</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {overview.theme.themes.map((theme) => {
                    const active = theme.id === overview.theme.active;
                    return (
                      <div
                        key={theme.id}
                        className={cn(
                          "rounded-sm border px-3 py-2.5",
                          active ? "border-accent bg-accent-soft/50" : "border-line",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-fg">{theme.name}</span>
                          <Badge>v{theme.version}</Badge>
                          {active ? <Badge tone="accent">使用中</Badge> : null}
                        </div>
                        <p className="mt-1 text-xs text-muted">{theme.description}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {theme.supports.darkMode ? <Badge>暗色</Badge> : null}
                          {theme.supports.toc ? <Badge>目录</Badge> : null}
                          {theme.supports.sidebar ? <Badge>侧栏</Badge> : null}
                          {theme.supports.comments ? <Badge>评论</Badge> : null}
                          {theme.supports.moments ? <Badge>动态</Badge> : null}
                          {theme.supports.projects ? <Badge>项目</Badge> : null}
                        </div>
                        {!active && canManageTheme ? (
                          <Button
                            size="sm"
                            variant="default"
                            className="mt-2"
                            loading={themeMutation.isPending && themeMutation.variables?.active === theme.id}
                            onClick={async () => {
                              const ok = await confirm({
                                title: `切换到主题「${theme.name}」？`,
                                description: "前台立即换用该主题渲染；当前主题的配置会被保留。",
                                confirmText: "切换主题",
                              });
                              if (ok) themeMutation.mutate({ active: theme.id });
                            }}
                          >
                            启用
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-line pt-4">
                <p className="mb-3 text-xs font-medium text-muted">
                  主题配置（{overview.theme.active}）
                </p>
                {visibleThemeFields.length === 0 ? (
                  <EmptyState kind="empty" description="当前主题没有声明可配置项。" />
                ) : (
                  <SettingFieldList
                    fields={visibleThemeFields}
                    values={themeValues}
                    errors={errors}
                    disabled={!canManageTheme}
                    onChange={(key, value) => setThemeValues((previous) => ({ ...previous, [key]: value }))}
                  />
                )}
                {canManageTheme && visibleThemeFields.length > 0 ? (
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="primary"
                      icon={<Save size={14} />}
                      loading={themeMutation.isPending && themeMutation.variables?.values !== undefined}
                      onClick={() => {
                        const values: SettingValues = {};
                        for (const field of visibleThemeFields) values[field.key] = themeValues[field.key];
                        themeMutation.mutate({ values });
                      }}
                    >
                      保存主题配置
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}

        {/* ------------------------------------------------ 维护 */}
        {section.kind === "maintenance" ? (
          <Card>
            <CardHeader title="维护操作" description="与定时任务走同一条流程，手工执行用于即时生效。" />
            <div className="flex flex-col divide-y divide-line">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">立即执行维护任务</p>
                  <p className="text-xs text-muted">
                    到点发布定时内容、清理超期回收站、清理过期会话与令牌、跑排队任务。
                    站点设置里关闭「启用定时任务」时全部跳过。
                  </p>
                </div>
                <Button
                  variant="default"
                  icon={<RefreshCw size={14} />}
                  disabled={!canRunTasks}
                  loading={maintenanceMutation.isPending}
                  onClick={() => maintenanceMutation.mutate()}
                >
                  立即执行
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">清空页面缓存</p>
                  <p className="text-xs text-muted">
                    页面缓存键带全局版本号，bump 一次等价于全站清缓存；前台下一次访问会重新渲染。
                  </p>
                </div>
                <Button
                  variant="danger"
                  icon={<Trash2 size={14} />}
                  disabled={!canRunTasks}
                  loading={cacheMutation.isPending}
                  onClick={async () => {
                    const ok = await confirm({
                      title: "清空页面缓存？",
                      description: "前台所有页面会在下次访问时重新渲染，短时间内的响应会稍慢。",
                      confirmText: "清空缓存",
                      tone: "danger",
                    });
                    if (ok) cacheMutation.mutate();
                  }}
                >
                  清空缓存
                </Button>
              </div>

              {!canRunTasks ? (
                <p className="px-4 py-3 text-xs text-subtle">
                  维护操作需要 <span className="font-mono">system.task.run</span> 权限。
                </p>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
