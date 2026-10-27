/**
 * 插件管理。
 *
 * 清单来自 `GET /api/plugins`：它把代码里的 manifest（插件有什么）与数据库状态（现在是什么）
 * 合并后返回，所以"新部署但从未启用"的插件也会出现在列表里（installed = false）。
 *
 * 配置表单复用设置页的字段渲染器：插件设置字段与站点设置字段是同一个形状（少了 group）。
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Puzzle, RotateCcw } from "lucide-react";
import { apiFetch, errorMessage, isApiError } from "@/lib/api";
import type { PluginEntry } from "@/lib/types";
import { useAuth } from "@/app/AuthProvider";
import { useConfirm, useToast } from "@/app/providers";
import { Badge, Button, Card, EmptyState, LoadingBlock, PageHeader, Switch } from "@/components/ui";
import { SettingFieldList, type SettingValues } from "@/components/SettingFields";

export function PluginsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SettingValues>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const canManage = can("plugin.manage");

  const listQuery = useQuery<{ items: PluginEntry[] }>({
    queryKey: ["plugins"],
    queryFn: () => apiFetch<{ items: PluginEntry[] }>("/plugins"),
  });

  const items = listQuery.data?.items ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["plugins"] });
    void queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  const updateMutation = useMutation({
    mutationFn: (payload: { key: string; enabled?: boolean; settings?: SettingValues }) =>
      apiFetch<PluginEntry>(`/plugins/${payload.key}`, {
        method: "PATCH",
        json: {
          ...(payload.enabled === undefined ? {} : { enabled: payload.enabled }),
          ...(payload.settings === undefined ? {} : { settings: payload.settings }),
        },
      }),
    onSuccess: (_entry, variables) => {
      toast.success(variables.enabled === undefined ? "插件配置已保存" : "插件状态已更新");
      setErrors({});
      invalidate();
    },
    onError: (error) => {
      if (isApiError(error) && Object.keys(error.fields).length > 0) setErrors(error.fields);
      toast.error(errorMessage(error));
    },
  });

  const resetMutation = useMutation({
    mutationFn: (key: string) => apiFetch<PluginEntry>(`/plugins/${key}/reset`, { method: "POST" }),
    onSuccess: (_entry, key) => {
      toast.success("已恢复默认配置");
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const draftOf = useMemo(
    () => (plugin: PluginEntry) => drafts[plugin.key] ?? { ...plugin.settings },
    [drafts],
  );

  if (listQuery.isLoading) return <LoadingBlock label="加载插件" />;
  if (listQuery.isError) {
    return (
      <Card>
        <EmptyState kind="error" description={errorMessage(listQuery.error)} />
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="插件"
        description="插件通过钩子接入内容渲染与评论流程；配置改动会同时刷新页面缓存。"
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState kind="empty" description="没有注册任何插件。" />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((plugin) => {
            const open = expanded === plugin.key;
            const values = draftOf(plugin);
            return (
              <Card key={plugin.key}>
                <div className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-line bg-sunken text-muted">
                    <Puzzle size={16} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-fg">{plugin.name}</h3>
                      <Badge>v{plugin.version}</Badge>
                      {plugin.enabled ? <Badge tone="ok">已启用</Badge> : <Badge>已停用</Badge>}
                      {!plugin.installed ? <Badge tone="info">未安装</Badge> : null}
                      {!plugin.hasManifest ? <Badge tone="warn">代码中已移除</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted">{plugin.description || "（无说明）"}</p>
                    <p className="mt-0.5 text-xs text-subtle">
                      key：<span className="font-mono">{plugin.key}</span>
                      {plugin.author ? ` · 作者：${plugin.author}` : ""}
                      {plugin.settingsSchema.length > 0 ? ` · ${plugin.settingsSchema.length} 个配置项` : " · 无可配置项"}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <Switch
                      checked={plugin.enabled}
                      disabled={!canManage || !plugin.hasManifest}
                      label={plugin.enabled ? "启用中" : "已停用"}
                      onChange={(checked) => updateMutation.mutate({ key: plugin.key, enabled: checked })}
                    />
                    {plugin.settingsSchema.length > 0 && plugin.hasManifest ? (
                      <Button
                        variant="default"
                        icon={open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        onClick={() => setExpanded(open ? null : plugin.key)}
                      >
                        配置
                      </Button>
                    ) : null}
                  </div>
                </div>

                {open ? (
                  <div className="border-t border-line bg-sunken/40 px-4 py-4">
                    {!canManage ? (
                      <p className="text-xs text-subtle">当前账号没有 plugin.manage 权限，配置为只读。</p>
                    ) : null}
                    <SettingFieldList
                      fields={plugin.settingsSchema}
                      values={values}
                      errors={errors}
                      disabled={!canManage}
                      onChange={(key, value) =>
                        setDrafts((previous) => ({
                          ...previous,
                          [plugin.key]: { ...draftOf(plugin), [key]: value },
                        }))
                      }
                    />
                    {canManage ? (
                      <div className="mt-4 flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          icon={<RotateCcw size={13} />}
                          loading={resetMutation.isPending && resetMutation.variables === plugin.key}
                          onClick={async () => {
                            const ok = await confirm({
                              title: `恢复 ${plugin.name} 的默认配置？`,
                              description: "配置值会被重置为插件声明的默认值，启用状态不变。",
                              confirmText: "恢复默认",
                            });
                            if (ok) resetMutation.mutate(plugin.key);
                          }}
                        >
                          恢复默认
                        </Button>
                        <Button
                          variant="primary"
                          loading={updateMutation.isPending && updateMutation.variables?.key === plugin.key}
                          onClick={() => updateMutation.mutate({ key: plugin.key, settings: values })}
                        >
                          保存配置
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
