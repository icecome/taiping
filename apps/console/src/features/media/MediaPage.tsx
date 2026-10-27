/**
 * 媒体库。
 *
 * 上传走 multipart（`file` / `folder` / `altText`），其余是普通 JSON。
 * 列表用网格而不是表格：媒体管理的第一诉求是"认出那张图"，缩略图比文件名有用得多。
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clipboard, ImageOff, Pencil, Search, Trash } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api";
import type { MediaItem, MediaUploadResult, Paged } from "@/lib/types";
import { formatBytes, formatDateTime } from "@/lib/format";
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
  Select,
  Toolbar,
  Textarea,
} from "@/components/ui";
import { UploadButton } from "@/components/MediaPicker";

const PAGE_SIZE = 24;

interface MediaForm {
  id: string;
  altText: string;
  caption: string;
  folder: string;
  filename: string;
  url: string;
}

export function MediaPage() {
  const [page, setPage] = useState(1);
  const [folder, setFolder] = useState("");
  const [mimePrefix, setMimePrefix] = useState("");
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [uploadFolder, setUploadFolder] = useState("/images");
  const [form, setForm] = useState<MediaForm | null>(null);

  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();

  const canUpload = can("media.upload");
  const canUpdate = can("media.update");
  const canDelete = can("media.delete.any") || can("media.delete.own");

  useEffect(() => {
    setPage(1);
  }, [folder, mimePrefix, search]);

  const listQuery = useQuery<Paged<MediaItem>>({
    queryKey: ["media", { page, folder, mimePrefix, search }],
    queryFn: () =>
      apiFetch<Paged<MediaItem>>("/media", {
        query: { page, pageSize: PAGE_SIZE, folder, mimePrefix, q: search },
      }),
    placeholderData: (previous) => previous,
  });

  const items = listQuery.data?.items ?? [];
  const meta = listQuery.data?.meta ?? { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["media"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const updateMutation = useMutation({
    mutationFn: (payload: MediaForm) =>
      apiFetch<MediaItem>(`/media/${payload.id}`, {
        method: "PATCH",
        json: { altText: payload.altText, caption: payload.caption, folder: payload.folder },
      }),
    onSuccess: () => {
      toast.success("已保存媒体信息");
      setForm(null);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: boolean; usedBy: number; message: string }>(`/media/${id}`, { method: "DELETE" }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const copyUrl = async (item: MediaItem) => {
    try {
      await navigator.clipboard.writeText(new URL(item.url, window.location.origin).toString());
      toast.success("已复制完整地址");
    } catch {
      toast.error("浏览器拒绝了剪贴板访问，请手动复制");
    }
  };

  return (
    <>
      <PageHeader
        title="媒体库"
        description="文件存在 R2，元数据在 D1；相同内容的文件不会重复存储。"
        actions={
          canUpload ? (
            <div className="flex items-end gap-2">
              <Field label="上传到文件夹" className="w-44">
                <Input value={uploadFolder} onChange={(event) => setUploadFolder(event.target.value)} placeholder="/images" />
              </Field>
              <UploadButton
                folder={uploadFolder}
                label="上传文件"
                onUploaded={(result: MediaUploadResult) => {
                  refresh();
                  if (!result.deduplicated) setPage(1);
                }}
              />
            </div>
          ) : null
        }
      />

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
                placeholder="按文件名搜索"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="default">
              搜索
            </Button>
          </form>
          <Input
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            placeholder="文件夹精确匹配，如 /images/2026"
            className="w-56"
          />
          <Select
            value={mimePrefix}
            onChange={(event) => setMimePrefix(event.target.value)}
            className="w-32"
            aria-label="文件类型"
          >
            <option value="">全部类型</option>
            <option value="image/">图片</option>
            <option value="video/">视频</option>
            <option value="audio/">音频</option>
            <option value="application/pdf">PDF</option>
          </Select>
          {(folder || mimePrefix || search) && (
            <Button
              variant="ghost"
              onClick={() => {
                setFolder("");
                setMimePrefix("");
                setKeyword("");
                setSearch("");
              }}
            >
              清空筛选
            </Button>
          )}
        </Toolbar>

        <div className="relative">
          <LoadingOverlay visible={listQuery.isFetching && !listQuery.isLoading} />
          {listQuery.isLoading ? (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-40 animate-pulse rounded-sm bg-hover" />
              ))}
            </div>
          ) : items.length === 0 ? (
            listQuery.isError ? (
              <EmptyState kind="error" description={errorMessage(listQuery.error)} />
            ) : (
              <EmptyState
                kind={search || folder || mimePrefix ? "search" : "empty"}
                description={
                  search || folder || mimePrefix
                    ? "这个筛选条件下没有文件。"
                    : canUpload
                      ? "还没有上传任何文件，用右上角的「上传文件」开始。"
                      : "媒体库是空的。"
                }
              />
            )
          ) : (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => (
                <div key={item.id} className="group flex flex-col overflow-hidden rounded-sm border border-line bg-surface">
                  <div className="relative flex h-36 items-center justify-center overflow-hidden bg-sunken">
                    {item.mimeType.startsWith("image/") ? (
                      <img
                        src={item.url}
                        alt={item.altText ?? item.filename}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageOff size={22} className="text-subtle" />
                    )}
                    <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button size="sm" variant="default" icon={<Clipboard size={12} />} onClick={() => void copyUrl(item)}>
                        复制
                      </Button>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 px-2.5 py-2">
                    <p className="truncate text-sm text-fg" title={item.filename}>
                      {item.filename}
                    </p>
                    <p className="truncate text-xs text-subtle">
                      {item.folder} · {formatBytes(item.size)}
                      {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
                    </p>
                    {item.altText ? (
                      <p className="truncate text-xs text-muted" title={item.altText}>
                        替代文本：{item.altText}
                      </p>
                    ) : (
                      <p className="text-xs text-warn">缺少替代文本</p>
                    )}
                    <div className="mt-auto flex items-center gap-1 pt-1">
                      <Badge>{item.driver === "r2" ? "R2" : "外链"}</Badge>
                      <span className="ml-auto flex items-center gap-0.5">
                        {canUpdate ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="编辑信息"
                            onClick={() =>
                              setForm({
                                id: item.id,
                                filename: item.filename,
                                url: item.url,
                                altText: item.altText ?? "",
                                caption: item.caption ?? "",
                                folder: item.folder,
                              })
                            }
                          >
                            <Pencil size={13} />
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="删除"
                            className="text-danger hover:text-danger"
                            onClick={async () => {
                              const ok = await confirm({
                                title: `删除「${item.filename}」？`,
                                description: "R2 里的对象与元数据都会被删除；若被内容当作封面，那些引用会失效。",
                                confirmText: "删除",
                                tone: "danger",
                              });
                              if (ok) deleteMutation.mutate(item.id);
                            }}
                          >
                            <Trash size={13} />
                          </Button>
                        ) : null}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-subtle">{formatDateTime(item.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Pagination meta={meta} onPage={setPage} />
      </Card>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title="编辑媒体信息"
        description={form?.filename}
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>
              取消
            </Button>
            <Button variant="primary" loading={updateMutation.isPending} onClick={() => form && updateMutation.mutate(form)}>
              保存
            </Button>
          </>
        }
      >
        {form ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-sm border border-line bg-sunken p-2">
              {form.url.match(/\.(png|jpe?g|gif|webp|avif|svg)$/i) || form.url.startsWith("/media/") ? (
                <img src={form.url} alt="" className="h-16 w-24 rounded-xs object-cover" />
              ) : null}
              <span className="min-w-0 flex-1 break-all font-mono text-xs text-muted">{form.url}</span>
            </div>
            <Field label="替代文本" hint="给屏幕阅读器与 SEO 用，建议描述画面内容而不是文件名。">
              <Input value={form.altText} onChange={(event) => setForm({ ...form, altText: event.target.value })} />
            </Field>
            <Field label="说明文字">
              <Textarea rows={2} value={form.caption} onChange={(event) => setForm({ ...form, caption: event.target.value })} />
            </Field>
            <Field label="文件夹" hint="形如 /images/2026，会统一成以斜杠开头。">
              <Input
                value={form.folder}
                onChange={(event) => setForm({ ...form, folder: event.target.value })}
                className="font-mono"
              />
            </Field>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
