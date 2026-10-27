/**
 * 媒体选择与封面上传。
 *
 * 封面在数据模型里是 `coverMediaId`（外键），所以"填一个 URL"也要先经过
 * `POST /api/media/from-url` 登记成媒体记录，再取它的 id —— 否则封面就会变成
 * 一个只存在于这张表单里的裸字符串，内容列表拿不到 coverUrl。
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ImageOff, Link2, Search, Trash, Upload } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api";
import type { MediaItem, MediaUploadResult, Paged } from "@/lib/types";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useToast } from "@/app/providers";
import { Button, EmptyState, Field, Input, LoadingBlock, Modal, Pagination, Spinner } from "@/components/ui";

const PAGE_SIZE = 18;

/* ---------------------------------------------------------------- 选择器 */

export function MediaLibraryModal({
  open,
  onClose,
  onPick,
  defaultFolder = "",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (item: MediaItem) => void;
  defaultFolder?: string;
}) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState(defaultFolder);
  const [externalUrl, setExternalUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    setPage(1);
  }, [open, search, folder]);

  const mediaQuery = useQuery<Paged<MediaItem>>({
    queryKey: ["media", "picker", { page, search, folder }],
    queryFn: () =>
      apiFetch<Paged<MediaItem>>("/media", {
        query: { page, pageSize: PAGE_SIZE, q: search, folder },
      }),
    enabled: open,
    staleTime: 15_000,
  });

  const registerExternal = useMutation({
    mutationFn: (url: string) =>
      apiFetch<MediaItem>("/media/from-url", {
        method: "POST",
        json: { url, filename: url.split("/").pop()?.split("?")[0] || "external" },
      }),
  });

  const items = mediaQuery.data?.items ?? [];
  const meta = mediaQuery.data?.meta ?? { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="从媒体库选择"
      description="只能选到已上传或被登记过的文件。"
      width="xl"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setSearch(query.trim());
              }}
              placeholder="按文件名搜索，回车确认"
              className="pl-8"
            />
          </div>
          <Input
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            placeholder="文件夹，如 /images/2026"
            className="w-48"
          />
          <Button variant="default" onClick={() => setSearch(query.trim())} icon={<Search size={14} />}>
            搜索
          </Button>
        </div>

        {mediaQuery.isLoading ? (
          <LoadingBlock label="加载媒体" />
        ) : mediaQuery.isError ? (
          <EmptyState kind="error" description={errorMessage(mediaQuery.error)} />
        ) : items.length === 0 ? (
          <EmptyState kind={search || folder ? "search" : "empty"} />
        ) : (
          <div className="grid max-h-[52vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onPick(item);
                  onClose();
                }}
                className="group flex flex-col overflow-hidden rounded-sm border border-line text-left transition-colors hover:border-accent"
              >
                <span className="flex h-24 items-center justify-center overflow-hidden bg-sunken">
                  {item.mimeType.startsWith("image/") ? (
                    <img src={item.url} alt={item.altText ?? item.filename} className="h-full w-full object-cover" />
                  ) : (
                    <ImageOff size={20} className="text-subtle" />
                  )}
                </span>
                <span className="min-w-0 px-2 py-1.5">
                  <span className="block truncate text-xs text-fg">{item.filename}</span>
                  <span className="block truncate text-xs text-subtle">
                    {item.folder} · {formatBytes(item.size)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <Pagination meta={meta} onPage={setPage} className="border-t-0 px-0" />

        <div className="rounded-sm border border-line bg-sunken p-3">
          <Field label="或登记一个外部链接" hint="只写元数据、不下载文件，登记后可作为封面使用。">
            <div className="flex gap-2">
              <Input
                value={externalUrl}
                onChange={(event) => setExternalUrl(event.target.value)}
                placeholder="https://cdn.example.com/cover.png"
              />
              <Button
                variant="default"
                icon={<Link2 size={14} />}
                loading={registerExternal.isPending}
                disabled={!externalUrl.trim()}
                onClick={() => {
                  registerExternal.mutate(externalUrl.trim(), {
                    onSuccess: (item) => {
                      onPick(item);
                      onClose();
                    },
                  });
                }}
              >
                登记并使用
              </Button>
            </div>
          </Field>
          {registerExternal.isError ? (
            <p className="mt-2 text-xs text-danger">{errorMessage(registerExternal.error)}</p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- 封面字段 */

export function CoverPicker({
  value,
  currentUrl,
  onChange,
  disabled,
}: {
  /** 当前封面媒体 id。 */
  value: string | null;
  /** 已保存内容的封面 URL（仅详情接口返回）。 */
  currentUrl?: string | null;
  onChange: (next: { id: string | null; url: string | null }) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const toast = useToast();

  const registerManual = useMutation({
    mutationFn: (url: string) =>
      apiFetch<MediaItem>("/media/from-url", {
        method: "POST",
        json: { url, filename: url.split("/").pop()?.split("?")[0] || "external" },
      }),
  });

  // 只有详情接口会给出 coverUrl；刚选完还没保存时只能用 id 占位，不做假预览。
  const preview = useMemo(() => currentUrl ?? null, [currentUrl]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3">
        <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-sunken">
          {preview ? (
            <img src={preview} alt="封面预览" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-subtle">未设置</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={disabled} onClick={() => setOpen(true)}>
              从媒体库选择
            </Button>
            {value || currentUrl ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                icon={<Trash size={13} />}
                onClick={() => onChange({ id: null, url: null })}
              >
                清除封面
              </Button>
            ) : null}
          </div>
          <p className="truncate text-xs text-subtle">
            {value ? `媒体 ID：${value}` : "未绑定媒体记录"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={manualUrl}
          disabled={disabled}
          placeholder="或填图片地址，自动登记进媒体库"
          onChange={(event) => setManualUrl(event.target.value)}
        />
        <Button
          size="sm"
          variant="default"
          loading={registerManual.isPending}
          disabled={disabled || !manualUrl.trim()}
          onClick={() => {
            registerManual.mutate(manualUrl.trim(), {
              onSuccess: (item) => {
                onChange({ id: item.id, url: item.url });
                setManualUrl("");
                toast.success("已登记并设为封面");
              },
              onError: (error) => toast.error(errorMessage(error)),
            });
          }}
        >
          使用
        </Button>
      </div>

      <MediaLibraryModal
        open={open}
        onClose={() => setOpen(false)}
        onPick={(item) => onChange({ id: item.id, url: item.url })}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- 上传按钮 */

export function UploadButton({
  folder = "/",
  onUploaded,
  label = "上传文件",
  accept,
}: {
  folder?: string;
  onUploaded: (item: MediaUploadResult) => void;
  label?: string;
  accept?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const toast = useToast();

  return (
    <label className={cn("inline-flex", uploading && "opacity-70")}>
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const form = new FormData();
          form.set("file", file);
          form.set("folder", folder);
          setUploading(true);
          setFileName(file.name);
          try {
            const result = await apiFetch<MediaUploadResult>("/media/upload", { method: "POST", form });
            onUploaded(result);
            toast.success(result.deduplicated ? "内容相同的文件已存在，复用了已有记录" : "上传成功");
          } catch (error) {
            toast.error(errorMessage(error));
          } finally {
            setUploading(false);
            setFileName("");
          }
        }}
      />
      <span className="inline-flex h-8.5 cursor-pointer items-center gap-1.5 rounded-sm border border-accent bg-accent px-3 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover">
        {uploading ? <Spinner size={14} /> : <Upload size={14} />}
        {uploading ? `上传中：${fileName}` : label}
      </span>
    </label>
  );
}
