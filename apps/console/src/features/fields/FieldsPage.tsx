/**
 * 内容模型（自定义字段定义）。
 *
 * 字段类型下拉直接读 `FIELD_TYPES`（@shared/content-types），不在这里重抄一份枚举。
 * 排序用上移/下移改 sortOrder 后整批提交 `/api/fields/reorder`：顺序即内容编辑页里的字段顺序。
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash } from "lucide-react";
import { apiFetch, errorMessage, isApiError } from "@/lib/api";
import type { FieldItem, FieldOption } from "@/lib/types";
import { CONTENT_TYPES, FIELD_TYPES } from "@shared/content-types";
import { contentTypeLabel, fieldTypeLabel } from "@/lib/content-meta";
import { useAuth } from "@/app/AuthProvider";
import { useConfirm, useToast } from "@/app/providers";
import {
  Badge,
  Button,
  Card,
  Checkbox,
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
  Textarea,
  Th,
  Toolbar,
  Tr,
} from "@/components/ui";

interface FieldForm {
  id: string | null;
  key: string;
  label: string;
  description: string;
  fieldType: string;
  appliesToAll: boolean;
  appliesTo: string[];
  isRequired: boolean;
  enabled: boolean;
  sortOrder: string;
  defaultValue: string;
  options: FieldOption[];
}

function emptyForm(): FieldForm {
  return {
    id: null,
    key: "",
    label: "",
    description: "",
    fieldType: "text",
    appliesToAll: true,
    appliesTo: [],
    isRequired: false,
    enabled: true,
    sortOrder: "0",
    defaultValue: "",
    options: [{ value: "", label: "" }],
  };
}

export function FieldsPage() {
  const [form, setForm] = useState<FieldForm | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const canManage = can("field.manage");

  const listQuery = useQuery<{ items: FieldItem[] }>({
    queryKey: ["fields"],
    queryFn: () => apiFetch<{ items: FieldItem[] }>("/fields"),
  });

  const items = listQuery.data?.items ?? [];

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["fields"] });

  const saveMutation = useMutation({
    mutationFn: (payload: FieldForm) => {
      const options = payload.options.filter((option) => option.value.trim() && option.label.trim());
      const body: Record<string, unknown> = {
        label: payload.label.trim(),
        description: payload.description.trim() || null,
        fieldType: payload.fieldType,
        options,
        appliesTo: payload.appliesToAll ? ["*"] : payload.appliesTo,
        isRequired: payload.isRequired,
        enabled: payload.enabled,
        sortOrder: Number(payload.sortOrder) || 0,
        defaultValue:
          payload.defaultValue === "" ? null : payload.fieldType === "boolean" ? payload.defaultValue === "true" : payload.defaultValue,
      };
      if (payload.id) return apiFetch<FieldItem>(`/fields/${payload.id}`, { method: "PATCH", json: body });
      return apiFetch<FieldItem>("/fields", { method: "POST", json: { key: payload.key.trim(), ...body } });
    },
    onSuccess: () => {
      toast.success("字段已保存");
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
    mutationFn: (id: string) =>
      apiFetch<{ deleted: boolean; removedValues: number }>(`/fields/${id}`, { method: "DELETE" }),
    onSuccess: (result) => {
      toast.success(`字段已删除，清理了 ${result.removedValues} 条历史值`);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const reorderMutation = useMutation({
    mutationFn: (payload: { id: string; sortOrder: number }[]) =>
      apiFetch<{ updated: number }>("/fields/reorder", { method: "POST", json: { items: payload } }),
    onSuccess: () => {
      toast.success("顺序已保存");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const move = (item: FieldItem, direction: -1 | 1) => {
    const index = items.findIndex((entry) => entry.id === item.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    reorderMutation.mutate(next.map((entry, position) => ({ id: entry.id, sortOrder: position * 10 })));
  };

  const appliesToText = useMemo(
    () => (item: FieldItem) =>
      item.appliesTo.includes("*") ? "全部内容类型" : item.appliesTo.map(contentTypeLabel).join("、"),
    [],
  );

  return (
    <>
      <PageHeader
        title="内容模型"
        description="定义内容的自定义字段；业务代码不需要为新增字段改动。"
        actions={
          canManage ? (
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => {
                setFieldErrors({});
                setForm(emptyForm());
              }}
            >
              新建字段
            </Button>
          ) : null
        }
      />

      <Card>
        <Toolbar>
          <span className="text-xs text-muted">共 {items.length} 个字段定义</span>
          <span className="ml-auto text-xs text-subtle">顺序即内容编辑页里的字段排列顺序</span>
        </Toolbar>

        {listQuery.isLoading ? (
          <LoadingBlock label="加载字段定义" />
        ) : listQuery.isError ? (
          <EmptyState kind="error" description={errorMessage(listQuery.error)} />
        ) : items.length === 0 ? (
          <EmptyState
            kind="empty"
            description={
              canManage
                ? "还没有自定义字段，点「新建字段」加一个（例如副标题、来源链接）。"
                : "还没有自定义字段。"
            }
          />
        ) : (
          <TableWrap label="字段定义列表" minWidth={980}>
            
            <thead>
              <tr>
                <Th>字段</Th>
                <Th className="w-24">类型</Th>
                <Th className="w-56">适用范围</Th>
                <Th className="w-20">必填</Th>
                <Th className="w-20">启用</Th>
                <Th className="w-24" align="right">
                  排序
                </Th>
                <Th className="w-40" align="right">
                  操作
                </Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <Tr key={item.id}>
                  <Td>
                    <p className="truncate font-medium">{item.label}</p>
                    <p className="truncate font-mono text-xs text-subtle">{item.key}</p>
                    {item.description ? <p className="truncate text-xs text-muted">{item.description}</p> : null}
                  </Td>
                  <Td>
                    <Badge tone="info">{fieldTypeLabel(item.fieldType)}</Badge>
                    {item.fieldType === "select" ? (
                      <p className="mt-1 truncate text-xs text-subtle">{item.options.length} 个候选值</p>
                    ) : null}
                  </Td>
                  <Td className="truncate text-xs text-muted">{appliesToText(item)}</Td>
                  <Td>{item.isRequired ? <Badge tone="warn">必填</Badge> : <span className="text-xs text-subtle">否</span>}</Td>
                  <Td>
                    {item.enabled ? <Badge tone="ok">启用</Badge> : <Badge>停用</Badge>}
                  </Td>
                  <Td align="right" className="tabular-nums text-xs text-muted">
                    {item.sortOrder}
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
                            title="编辑"
                            onClick={() => {
                              setFieldErrors({});
                              setForm({
                                id: item.id,
                                key: item.key,
                                label: item.label,
                                description: item.description ?? "",
                                fieldType: item.fieldType,
                                appliesToAll: item.appliesTo.includes("*"),
                                appliesTo: item.appliesTo.filter((entry) => entry !== "*"),
                                isRequired: item.isRequired,
                                enabled: item.enabled,
                                sortOrder: String(item.sortOrder),
                                defaultValue:
                                  item.defaultValue === null || item.defaultValue === undefined
                                    ? ""
                                    : String(item.defaultValue),
                                options:
                                  item.options.length > 0 ? item.options : [{ value: "", label: "" }],
                              });
                            }}
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
                                title: `删除字段「${item.label}」？`,
                                description: "该字段的全部历史值（field_values）会一并清理，无法恢复。",
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
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? "编辑字段定义" : "新建字段定义"}
        description={form?.id ? "key 创建后不可修改。" : "key 是索引路径，创建后不可修改。"}
        width="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={saveMutation.isPending}
              disabled={!form?.label.trim() || (!form?.id && !form?.key.trim())}
              onClick={() => form && saveMutation.mutate(form)}
            >
              保存
            </Button>
          </>
        }
      >
        {form ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="字段 key"
                required
                error={fieldErrors.key}
                hint="小写字母开头，2–32 位，只含小写字母、数字与下划线。"
              >
                <Input
                  value={form.key}
                  disabled={Boolean(form.id)}
                  onChange={(event) => setForm({ ...form, key: event.target.value })}
                  className="font-mono"
                  placeholder="subtitle"
                />
              </Field>
              <Field label="显示名称" required error={fieldErrors.label}>
                <Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
              </Field>
            </div>

            <Field label="说明" error={fieldErrors.description}>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="字段类型" error={fieldErrors.fieldType} hint="类型决定值落到哪一列；改动不会迁移历史值。">
                <Select value={form.fieldType} onChange={(event) => setForm({ ...form, fieldType: event.target.value })}>
                  {FIELD_TYPES.map((type) => (
                    <option key={type.key} value={type.key}>
                      {type.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="排序权重" error={fieldErrors.sortOrder}>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
                />
              </Field>
            </div>

            <div className="rounded-sm border border-line p-3">
              <Switch
                checked={form.appliesToAll}
                onChange={(checked) => setForm({ ...form, appliesToAll: checked })}
                label="适用于全部内容类型"
              />
              {!form.appliesToAll ? (
                <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                  {CONTENT_TYPES.map((type) => (
                    <Checkbox
                      key={type.key}
                      label={type.label}
                      checked={form.appliesTo.includes(type.key)}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          appliesTo: event.target.checked
                            ? [...form.appliesTo, type.key]
                            : form.appliesTo.filter((entry) => entry !== type.key),
                        })
                      }
                    />
                  ))}
                </div>
              ) : null}
              {fieldErrors.appliesTo ? <p className="mt-1.5 text-xs text-danger">{fieldErrors.appliesTo}</p> : null}
            </div>

            {form.fieldType === "select" ? (
              <div className="rounded-sm border border-line p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-muted">候选值（至少一个，值需唯一）</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Plus size={12} />}
                    onClick={() => setForm({ ...form, options: [...form.options, { value: "", label: "" }] })}
                  >
                    添加
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  {form.options.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={option.value}
                        placeholder="值，如 paperback"
                        onChange={(event) => {
                          const options = [...form.options];
                          options[index] = { ...option, value: event.target.value };
                          setForm({ ...form, options });
                        }}
                        className="font-mono"
                      />
                      <Input
                        value={option.label}
                        placeholder="显示名，如 平装"
                        onChange={(event) => {
                          const options = [...form.options];
                          options[index] = { ...option, label: event.target.value };
                          setForm({ ...form, options });
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger hover:text-danger"
                        onClick={() =>
                          setForm({ ...form, options: form.options.filter((_, position) => position !== index) })
                        }
                      >
                        <Trash size={13} />
                      </Button>
                    </div>
                  ))}
                </div>
                {fieldErrors.options ? <p className="mt-1.5 text-xs text-danger">{fieldErrors.options}</p> : null}
              </div>
            ) : null}

            <Field
              label="默认值"
              error={fieldErrors.defaultValue}
              hint={
                form.fieldType === "boolean"
                  ? "填 true 或 false"
                  : form.fieldType === "number"
                    ? "填数字"
                    : form.fieldType === "json"
                      ? "填合法 JSON"
                      : "留空表示无默认值"
              }
            >
              {form.fieldType === "boolean" ? (
                <Select value={form.defaultValue} onChange={(event) => setForm({ ...form, defaultValue: event.target.value })}>
                  <option value="">（无）</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </Select>
              ) : (
                <Input
                  value={form.defaultValue}
                  onChange={(event) => setForm({ ...form, defaultValue: event.target.value })}
                />
              )}
            </Field>

            <div className="flex flex-wrap gap-5 border-t border-line pt-3">
              <Switch checked={form.isRequired} onChange={(checked) => setForm({ ...form, isRequired: checked })} label="必填" />
              <Switch checked={form.enabled} onChange={(checked) => setForm({ ...form, enabled: checked })} label="启用" />
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
