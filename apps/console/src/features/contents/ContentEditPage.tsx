/**
 * 内容编辑页（新建与编辑共用）。
 *
 * 三件必须做对的事：
 *   1. 保存只走 `POST /contents` 或 `PATCH /contents/{id}`，**不碰 status** ——
 *      服务端对 PATCH 里的 status 会直接 400；状态一律走 `POST /{id}/status`。
 *   2. 表单字段由内容类型的能力表（supports）与字段定义（/api/fields）驱动，
 *      页面不支持分类就不显示分类选择，没有自定义字段就不显示那一块。
 *   3. 离开前拦一次未保存修改：应用内跳转用路由 blocker，关标签页用 beforeunload。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { Clock, History, Link2, Pin, Save, Undo2 } from "lucide-react";
import { apiFetch, errorMessage, isApiError } from "@/lib/api";
import type { ContentDetail, ContentRevision, ContentWriteBody, FieldItem } from "@/lib/types";
import { contentStatusLabel, contentStatusTone, contentTypeLabel, contentTypeSupports } from "@/lib/content-meta";
import { formatDateTime, fromLocalInputValue, toLocalInputValue } from "@/lib/format";
import { CONTENT_TYPES, CONTENT_VISIBILITIES } from "@shared/content-types";
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
  Select,
  Switch,
  Textarea,
} from "@/components/ui";
import { CoverPicker } from "@/components/MediaPicker";
import { TermPicker } from "@/components/TermPicker";
import { CustomFieldsForm, serializeCustomFields, type CustomFieldValues } from "@/components/CustomFields";

type EditorMode = "write" | "preview" | "split";

interface EditorState {
  type: string;
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  visibility: string;
  password: string;
  isPinned: boolean;
  allowComment: boolean;
  coverMediaId: string | null;
  coverUrl: string | null;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  canonicalUrl: string;
  ogImageUrl: string;
  scheduledAt: string;
  termIds: string[];
  fields: CustomFieldValues;
  changeNote: string;
}

function emptyState(type = "post"): EditorState {
  return {
    type,
    title: "",
    slug: "",
    excerpt: "",
    bodyMarkdown: "",
    visibility: "public",
    password: "",
    isPinned: false,
    allowComment: true,
    coverMediaId: null,
    coverUrl: null,
    seoTitle: "",
    seoDescription: "",
    seoKeywords: "",
    canonicalUrl: "",
    ogImageUrl: "",
    scheduledAt: "",
    termIds: [],
    fields: {},
    changeNote: "",
  };
}

function fromDetail(detail: ContentDetail): EditorState {
  const fields: CustomFieldValues = {};
  for (const entry of detail.fields) fields[entry.key] = entry.value;
  return {
    type: detail.type,
    title: detail.title,
    slug: detail.slug,
    excerpt: detail.excerpt ?? "",
    bodyMarkdown: detail.bodyMarkdown,
    visibility: detail.visibility,
    password: "",
    isPinned: detail.isPinned,
    allowComment: detail.allowComment,
    coverMediaId: detail.coverMediaId,
    coverUrl: detail.coverUrl,
    seoTitle: detail.seoTitle ?? "",
    seoDescription: detail.seoDescription ?? "",
    seoKeywords: detail.seoKeywords ?? "",
    canonicalUrl: detail.canonicalUrl ?? "",
    ogImageUrl: detail.ogImageUrl ?? "",
    scheduledAt: toLocalInputValue(detail.scheduledAt),
    termIds: detail.terms.map((term) => term.id),
    fields,
    changeNote: "",
  };
}

const HAS_CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

export function ContentEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { canAny, can } = useAuth();

  const [state, setState] = useState<EditorState>(() => emptyState());
  const [baseline, setBaseline] = useState<EditorState>(() => emptyState());
  const [mode, setMode] = useState<EditorMode>("split");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [seoOpen, setSeoOpen] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const hydratedId = useRef<string | null>(null);

  const supports = contentTypeSupports(state.type);

  /* ---------------------------------------------------------- 读取现有内容 */

  const detailQuery = useQuery<ContentDetail>({
    queryKey: ["content", id],
    queryFn: () => apiFetch<ContentDetail>(`/contents/${id}`),
    enabled: !isNew,
  });

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail || hydratedId.current === detail.id) return;
    hydratedId.current = detail.id;
    const next = fromDetail(detail);
    setState(next);
    setBaseline(next);
    setSeoOpen(Boolean(next.seoTitle || next.seoDescription || next.seoKeywords || next.canonicalUrl || next.ogImageUrl));
  }, [detailQuery.data]);

  const fieldsQuery = useQuery<{ items: FieldItem[] }>({
    queryKey: ["fields", "for-editor", state.type],
    queryFn: () => apiFetch<{ items: FieldItem[] }>("/fields", { query: { type: state.type, enabledOnly: "true" } }),
    enabled: can("field.read"),
    staleTime: 60_000,
  });
  const fieldDefinitions = fieldsQuery.data?.items ?? [];

  const revisionsQuery = useQuery<{ items: ContentRevision[] }>({
    queryKey: ["revisions", id],
    queryFn: () => apiFetch<{ items: ContentRevision[] }>(`/contents/${id}/revisions`),
    enabled: !isNew && revisionsOpen,
  });

  /* ---------------------------------------------------------- 脏检查 */

  const dirty = useMemo(
    () => JSON.stringify({ ...state, coverUrl: baseline.coverUrl }) !== JSON.stringify(baseline),
    [state, baseline],
  );

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const blocker = useBlocker(
    useCallback(
      ({
        currentLocation,
        nextLocation,
      }: {
        currentLocation: { pathname: string };
        nextLocation: { pathname: string };
      }) => dirty && currentLocation.pathname !== nextLocation.pathname,
      [dirty],
    ),
  );
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let cancelled = false;
    void confirm({
      title: "有未保存的修改",
      description: "离开当前页面会丢失这些改动。",
      confirmText: "放弃修改并离开",
      tone: "danger",
    }).then((ok) => {
      if (cancelled) return;
      const current = blockerRef.current;
      if (ok) current.proceed?.();
      else current.reset?.();
    });
    return () => {
      cancelled = true;
    };
    // 只依赖 blocker.state：对象身份每次渲染都可能变，写进依赖会导致弹窗被反复打开。
  }, [blocker.state, confirm]);

  /* ---------------------------------------------------------- 保存 */

  const update = <K extends keyof EditorState>(key: K, value: EditorState[K]) => {
    setState((previous) => ({ ...previous, [key]: value }));
  };

  /** 新建要带 `type`，编辑时不带（内容类型创建后只读）。 */
  const buildPayload = (): Omit<ContentWriteBody, "type"> & { type?: string } => {
    const base: Omit<ContentWriteBody, "type"> = {
      title: state.title.trim(),
      slug: state.slug.trim() || undefined,
      excerpt: supports.excerpt ? state.excerpt.trim() || null : null,
      bodyMarkdown: state.bodyMarkdown,
      visibility: state.visibility,
      // 空串会让服务端把密码写成 ""（等于没设密码），所以留空时必须省略这个键：
      // 服务端据此回落成"沿用原密码"。
      password: state.visibility === "password" ? state.password.trim() || undefined : null,
      isPinned: state.isPinned,
      allowComment: state.allowComment,
      coverMediaId: state.coverMediaId,
      seoTitle: supports.seo ? state.seoTitle.trim() || null : null,
      seoDescription: supports.seo ? state.seoDescription.trim() || null : null,
      seoKeywords: supports.seo ? state.seoKeywords.trim() || null : null,
      canonicalUrl: supports.seo ? state.canonicalUrl.trim() || null : null,
      ogImageUrl: supports.seo ? state.ogImageUrl.trim() || null : null,
      scheduledAt: supports.scheduling ? fromLocalInputValue(state.scheduledAt) : null,
      termIds: supports.terms ? state.termIds : [],
      fields: serializeCustomFields(fieldDefinitions, state.fields),
      changeNote: state.changeNote.trim() || undefined,
    };
    return isNew ? { type: state.type, ...base } : base;
  };

  const handleErrors = (error: unknown) => {
    if (isApiError(error) && Object.keys(error.fields).length > 0) {
      setFieldErrors(error.fields);
      setFormError(error.message);
    } else {
      setFieldErrors({});
      setFormError(errorMessage(error));
    }
    toast.error(errorMessage(error));
  };

  const saveMutation = useMutation({
    mutationFn: async (): Promise<ContentDetail | { id: string }> => {
      const payload = buildPayload();
      if (isNew) return apiFetch<ContentDetail>("/contents", { method: "POST", json: payload });
      return apiFetch<ContentDetail>(`/contents/${id}`, { method: "PATCH", json: payload });
    },
    onSuccess: (result) => {
      setFormError(null);
      setFieldErrors({});
      toast.success("已保存");
      void queryClient.invalidateQueries({ queryKey: ["contents"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setState((previous) => ({ ...previous, changeNote: "" }));
      const created = "type" in result ? (result as ContentDetail) : null;
      if (created) {
        // 新建后切到编辑模式，后续保存才走 PATCH，也才有版本与状态流转。
        hydratedId.current = null;
        queryClient.setQueryData(["content", created.id], created);
        navigate(`/contents/${created.id}`, { replace: true });
      } else {
        const current = { ...state, changeNote: "" };
        setBaseline(current);
        void queryClient.invalidateQueries({ queryKey: ["content", id] });
      }
    },
    onError: handleErrors,
  });

  const statusMutation = useMutation({
    mutationFn: async (target: string) => {
      let targetId = id;
      if (!targetId) {
        const created = await apiFetch<ContentDetail>("/contents", { method: "POST", json: buildPayload() });
        targetId = created.id;
      }
      await apiFetch(`/contents/${targetId}/status`, {
        method: "POST",
        json: {
          target,
          scheduledAt: target === "scheduled" ? fromLocalInputValue(state.scheduledAt) : undefined,
        },
      });
      return targetId;
    },
    onSuccess: (targetId, target) => {
      toast.success(`状态已切换为「${contentStatusLabel(target)}」`);
      void queryClient.invalidateQueries({ queryKey: ["contents"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (!id) {
        hydratedId.current = null;
        navigate(`/contents/${targetId}`, { replace: true });
      } else {
        void queryClient.invalidateQueries({ queryKey: ["content", id] });
        void queryClient.invalidateQueries({ queryKey: ["revisions", id] });
      }
    },
    onError: handleErrors,
  });

  const restoreMutation = useMutation({
    mutationFn: (revisionId: string) =>
      apiFetch(`/contents/${id}/revisions/${revisionId}/restore`, { method: "POST" }),
    onSuccess: () => {
      toast.success("已回滚到所选版本");
      hydratedId.current = null;
      void queryClient.invalidateQueries({ queryKey: ["content", id] });
      void queryClient.invalidateQueries({ queryKey: ["revisions", id] });
      void queryClient.invalidateQueries({ queryKey: ["contents"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  /* ---------------------------------------------------------- 预览 */

  const previewHtml = useMemo(() => {
    try {
      const rendered = marked.parse(state.bodyMarkdown, { async: false, gfm: true });
      const html = typeof rendered === "string" ? rendered : "";
      return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    } catch {
      return "<p>Markdown 解析失败</p>";
    }
  }, [state.bodyMarkdown]);

  /* ---------------------------------------------------------- 渲染 */

  if (!isNew && detailQuery.isLoading) return <LoadingBlock label="加载内容" />;
  if (!isNew && detailQuery.isError) {
    return (
      <Card>
        <EmptyState
          kind={isApiError(detailQuery.error) && detailQuery.error.status === 404 ? "forbidden" : "error"}
          title="无法加载该内容"
          description={errorMessage(detailQuery.error)}
        />
      </Card>
    );
  }

  const detail = detailQuery.data;
  const canPublish = canAny(["content.publish.any", "content.publish.own"]);
  const canSave = isNew ? can("content.create") : canAny(["content.update.any", "content.update.own"]);
  // 服务端只在创建时校验"密码保护必须有密码"，更新时留空等于沿用原密码，
  // 所以这里把两种情况分开判断，避免把合法的"留空不改"当成错误。
  const passwordMissing = state.visibility === "password" && !state.password.trim() && !detail?.hasPassword;
  const charCount = state.bodyMarkdown.length;

  // 没权限的流转按钮直接不渲染（需求要求"显隐而非禁用"）：
  // 提审/回草稿属于更新权限，发布与定时属于发布权限。
  const statusTargets: { target: string; label: string }[] = [
    ...(canSave
      ? [
          { target: "draft", label: "草稿" },
          { target: "pending", label: "提交审核" },
        ]
      : []),
    ...(canSave && supports.scheduling ? [{ target: "scheduled", label: "定时发布" }] : []),
    ...(canPublish ? [{ target: "published", label: "发布" }] : []),
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-lg font-semibold text-fg">
            {isNew ? "新建内容" : state.title || "未命名内容"}
          </h1>
          {dirty ? <Badge tone="warn">未保存</Badge> : null}
          {detail ? (
            <Badge tone={contentStatusTone(detail.status)}>{contentStatusLabel(detail.status)}</Badge>
          ) : null}
          <Badge>{contentTypeLabel(state.type)}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isNew ? (
            <Button icon={<History size={14} />} onClick={() => setRevisionsOpen(true)}>
              版本历史{detail ? `（${detail.revisionCount}）` : ""}
            </Button>
          ) : null}
          {canSave ? (
            <Button
              variant="primary"
              icon={<Save size={14} />}
              loading={saveMutation.isPending}
              disabled={!state.title.trim() || passwordMissing}
              onClick={() => saveMutation.mutate()}
            >
              保存
            </Button>
          ) : null}
        </div>
      </div>

      {formError ? (
        <div className="mb-4 rounded-sm border border-danger/35 bg-danger-soft px-3 py-2 text-sm text-danger">
          {formError}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ------------------------------------------------ 左栏 */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-4">
            <Field label="标题" required error={fieldErrors.title} htmlFor="content-title">
              <Input
                id="content-title"
                value={state.title}
                onChange={(event) => update("title", event.target.value)}
                placeholder="写一个能说明问题的标题"
                className="h-10 text-base"
              />
            </Field>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field
                label="Slug"
                className="min-w-48 flex-1"
                error={fieldErrors.slug}
                htmlFor="content-slug"
                hint={
                  state.slug && HAS_CJK.test(state.slug)
                    ? "含中文，服务端保存时会转成拼音后再入库。"
                    : "留空则由服务端按标题生成，冲突时自动追加序号。"
                }
              >
                <Input
                  id="content-slug"
                  value={state.slug}
                  onChange={(event) => update("slug", event.target.value)}
                  className="font-mono"
                  placeholder={isNew ? "留空自动生成" : detail?.slug}
                />
              </Field>
              <Button
                onClick={() => update("slug", state.title.trim())}
                disabled={!state.title.trim()}
                title="把标题填入 slug，中文交由服务端转拼音"
              >
                <Link2 size={14} />
                由标题生成
              </Button>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center gap-1 border-b border-line px-3 py-2">
              {(
                [
                  ["write", "编辑"],
                  ["preview", "预览"],
                  ["split", "分屏"],
                ] as [EditorMode, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={
                    key === mode
                      ? "rounded-xs bg-accent-soft px-2.5 py-1 text-sm font-medium text-accent"
                      : "rounded-xs px-2.5 py-1 text-sm text-muted transition-colors hover:bg-hover hover:text-fg"
                  }
                >
                  {label}
                </button>
              ))}
              <span className="ml-auto text-xs text-subtle">
                {charCount} 字符 · Markdown（原生 HTML 不渲染）
              </span>
            </div>

            <div className={mode === "split" ? "grid lg:grid-cols-2" : "block"}>
              {mode !== "preview" ? (
                <textarea
                  value={state.bodyMarkdown}
                  onChange={(event) => update("bodyMarkdown", event.target.value)}
                  spellCheck={false}
                  placeholder={"# 标题\n\n正文用 Markdown 书写，代码块用三个反引号包裹。"}
                  className="min-h-[26rem] w-full resize-y border-0 bg-surface p-4 font-mono text-sm leading-relaxed text-fg outline-none"
                />
              ) : null}

              {mode !== "write" ? (
                <div
                  className={`tb-markdown min-h-[26rem] overflow-auto p-4 ${
                    mode === "split" ? "border-t border-line lg:border-l lg:border-t-0" : ""
                  }`}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : null}
            </div>
          </Card>
        </div>

        {/* ------------------------------------------------ 右栏 */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="发布设置" description="状态只能通过流转接口修改，不受保存影响。" />
            <div className="flex flex-col gap-3 px-4 py-3">
              {detail ? (
                <p className="text-xs text-muted">
                  当前：
                  <Badge tone={contentStatusTone(detail.status)} className="ml-1">
                    {contentStatusLabel(detail.status)}
                  </Badge>
                </p>
              ) : (
                <p className="text-xs text-muted">新建内容默认保存为草稿，发布前先过一遍正文。</p>
              )}

              {supports.scheduling ? (
                <Field label="定时发布时间" hint="选择「定时发布」时生效，按 UTC 存储。">
                  <Input
                    type="datetime-local"
                    value={state.scheduledAt}
                    onChange={(event) => update("scheduledAt", event.target.value)}
                  />
                </Field>
              ) : null}

              <div className="flex flex-wrap gap-1.5">
                {statusTargets.map((item) => (
                  <Button
                    key={item.target}
                    size="sm"
                    variant={item.target === "published" ? "primary" : "default"}
                    loading={statusMutation.isPending && statusMutation.variables === item.target}
                    onClick={() => statusMutation.mutate(item.target)}
                  >
                    {item.label}
                  </Button>
                ))}
                {statusTargets.length === 0 && detail?.status !== "trashed" ? (
                  <p className="text-xs text-subtle">当前账号没有提审或发布权限，只能保存草稿。</p>
                ) : null}
                {detail && canAny(["content.delete.any", "content.delete.own"]) && detail.status !== "trashed" ? (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      const ok = await confirm({
                        title: "移入回收站？",
                        description: "之后仍可在回收站里恢复。",
                        confirmText: "移入回收站",
                      });
                      if (ok) statusMutation.mutate("trashed");
                    }}
                  >
                    回收站
                  </Button>
                ) : null}
                {detail?.status === "trashed" && can("content.restore") ? (
                  <Button size="sm" variant="default" icon={<Undo2 size={13} />} onClick={() => statusMutation.mutate("draft")}>
                    恢复为草稿
                  </Button>
                ) : null}
              </div>

              {!isNew ? (
                <Field label="版本备注" hint="写进版本记录，方便以后回滚时辨认。">
                  <Input
                    value={state.changeNote}
                    onChange={(event) => update("changeNote", event.target.value)}
                    placeholder="例如：修正第二节的链接"
                  />
                </Field>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="内容属性" />
            <div className="flex flex-col gap-3 px-4 py-3">
              <Field label="内容类型" hint={isNew ? undefined : "创建后不可更改"}>
                <Select
                  value={state.type}
                  disabled={!isNew}
                  onChange={(event) => {
                    const next = event.target.value;
                    setState((previous) => ({ ...previous, type: next }));
                  }}
                >
                  {CONTENT_TYPES.map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {entry.label}
                    </option>
                  ))}
                </Select>
              </Field>

              {supports.excerpt ? (
                <Field label="摘要" hint="留空时按站点设置的长度自动截取正文。" error={fieldErrors.excerpt}>
                  <Textarea
                    rows={3}
                    value={state.excerpt}
                    onChange={(event) => update("excerpt", event.target.value)}
                  />
                </Field>
              ) : null}

              {supports.cover ? (
                <Field label="封面">
                  <CoverPicker
                    value={state.coverMediaId}
                    currentUrl={state.coverUrl ?? detail?.coverUrl ?? null}
                    onChange={(next) =>
                      setState((previous) => ({
                        ...previous,
                        coverMediaId: next.id,
                        coverUrl: next.url ?? previous.coverUrl,
                      }))
                    }
                  />
                </Field>
              ) : null}

              <Field label="可见性" error={fieldErrors.password}>
                <Select value={state.visibility} onChange={(event) => update("visibility", event.target.value)}>
                  {CONTENT_VISIBILITIES.map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {entry.label}
                    </option>
                  ))}
                </Select>
              </Field>

              {state.visibility === "password" ? (
                <Field
                  label="访问密码"
                  error={fieldErrors.password ?? (passwordMissing ? "密码保护内容必须设置密码" : undefined)}
                  hint={detail?.hasPassword && !state.password ? "已设置密码，留空表示保持不变。" : "最多 64 字符。"}
                >
                  <Input
                    type="text"
                    value={state.password}
                    onChange={(event) => update("password", event.target.value)}
                    autoComplete="off"
                  />
                </Field>
              ) : null}

              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <Switch checked={state.isPinned} onChange={(next) => update("isPinned", next)} label="置顶显示" />
                <Switch
                  checked={state.allowComment}
                  onChange={(next) => update("allowComment", next)}
                  label={supports.comments ? "允许评论" : "允许评论（该类型前台不支持评论）"}
                  disabled={!supports.comments}
                />
              </div>
            </div>
          </Card>

          {supports.terms ? (
            <Card>
              <CardHeader title="分类与标签" description="从既有分类法里勾选，多选。" />
              <div className="px-4 py-3">
                <TermPicker value={state.termIds} onChange={(ids) => update("termIds", ids)} />
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="自定义字段" description="字段定义来自「内容模型」，按类型动态渲染。" />
            <div className="px-4 py-3">
              {fieldsQuery.isLoading ? (
                <LoadingBlock label="加载字段定义" />
              ) : fieldsQuery.isError ? (
                <EmptyState kind="error" description={errorMessage(fieldsQuery.error)} />
              ) : (
                <CustomFieldsForm
                  definitions={fieldDefinitions}
                  values={state.fields}
                  onChange={(key, value) => setState((previous) => ({ ...previous, fields: { ...previous.fields, [key]: value } }))}
                />
              )}
            </div>
          </Card>

          {supports.seo ? (
            <Card>
              <CardHeader
                title="搜索引擎"
                description="留空时回落站点默认值。"
                actions={
                  <Button size="sm" variant="ghost" onClick={() => setSeoOpen((value) => !value)}>
                    {seoOpen ? "收起" : "展开"}
                  </Button>
                }
              />
              {seoOpen ? (
                <div className="flex flex-col gap-3 px-4 py-3">
                  <Field label="SEO 标题" error={fieldErrors.seoTitle}>
                    <Input value={state.seoTitle} onChange={(event) => update("seoTitle", event.target.value)} />
                  </Field>
                  <Field label="SEO 描述" error={fieldErrors.seoDescription}>
                    <Textarea
                      rows={3}
                      value={state.seoDescription}
                      onChange={(event) => update("seoDescription", event.target.value)}
                    />
                  </Field>
                  <Field label="关键词" hint="逗号分隔。" error={fieldErrors.seoKeywords}>
                    <Input value={state.seoKeywords} onChange={(event) => update("seoKeywords", event.target.value)} />
                  </Field>
                  <Field label="Canonical URL" error={fieldErrors.canonicalUrl}>
                    <Input
                      value={state.canonicalUrl}
                      onChange={(event) => update("canonicalUrl", event.target.value)}
                      placeholder="https://"
                    />
                  </Field>
                  <Field label="分享图 URL" error={fieldErrors.ogImageUrl}>
                    <Input
                      value={state.ogImageUrl}
                      onChange={(event) => update("ogImageUrl", event.target.value)}
                      placeholder="https://"
                    />
                  </Field>
                </div>
              ) : null}
            </Card>
          ) : null}

          {detail ? (
            <Card>
              <CardHeader title="记录" />
              <dl className="divide-y divide-line text-xs">
                {[
                  ["ID", detail.id],
                  ["作者", detail.authorName ?? "—"],
                  ["创建", formatDateTime(detail.createdAt)],
                  ["更新", formatDateTime(detail.updatedAt)],
                  ["发布", formatDateTime(detail.publishedAt)],
                  ["字数", String(detail.wordCount)],
                  ["浏览 / 评论", `${detail.viewCount} / ${detail.commentCount}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-2 px-4 py-1.5">
                    <dt className="text-muted">{label}</dt>
                    <dd className="truncate font-mono text-fg">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}

          <div className="flex items-center gap-2 text-xs text-subtle">
            <Clock size={12} />
            {dirty ? "有未保存的修改，离开前会提示。" : "所有修改已保存。"}
          </div>
        </div>
      </div>

      <Modal
        open={revisionsOpen}
        onClose={() => setRevisionsOpen(false)}
        title="版本历史"
        description="每次保存都会生成一个版本，可以回滚到任意一版。"
        width="lg"
      >
        {revisionsQuery.isLoading ? (
          <LoadingBlock label="加载版本" />
        ) : revisionsQuery.isError ? (
          <EmptyState kind="error" description={errorMessage(revisionsQuery.error)} />
        ) : (revisionsQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState kind="empty" description="还没有版本记录（动态与项目类型不保留版本）。" />
        ) : (
          <ul className="divide-y divide-line">
            {revisionsQuery.data?.items.map((revision) => (
              <li key={revision.id} className="flex items-center gap-3 py-2.5">
                <span className="w-10 shrink-0 font-mono text-xs text-subtle">v{revision.revisionNo}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{revision.title}</p>
                  <p className="truncate text-xs text-subtle">
                    {formatDateTime(revision.createdAt)} · {revision.bodyLength} 字符
                    {revision.note ? ` · ${revision.note}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="default"
                  loading={restoreMutation.isPending && restoreMutation.variables === revision.id}
                  onClick={async () => {
                    const ok = await confirm({
                      title: `回滚到 v${revision.revisionNo}？`,
                      description: "当前正文会被该版本覆盖，旧内容仍保留在版本记录里。",
                      confirmText: "回滚",
                    });
                    if (ok) restoreMutation.mutate(revision.id);
                  }}
                >
                  回滚
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {!isNew && detail ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-subtle">
          <span className="inline-flex items-center gap-1">
            <Pin size={12} />
            {detail.isPinned ? "已置顶" : "未置顶"}
          </span>
          <span>slug：{detail.slug}</span>
          {detail.hasPassword ? <span>受密码保护</span> : null}
          {detail.status === "published" ? (
            <a
              className="text-accent hover:underline"
              href={detail.type === "page" ? `/${detail.slug}` : `/${detail.type}/${detail.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              在前台查看
            </a>
          ) : null}
        </div>
      ) : null}

      {isNew ? (
        <p className="mt-4 text-xs text-subtle">
          新建时选择「发布」会先落一条草稿再走状态流转接口，保证发布权限与审计路径与既有内容一致。
        </p>
      ) : null}
    </>
  );
}
