/**
 * 无组件库的 UI 原语集合。
 *
 * 原则：只包一层样式与可访问性，不加自己的状态机。按钮下拉、树、日期选择这些
 * 需要交互逻辑的地方，直接用原生控件（`<select>` / `<details>` / `<input type="date">`），
 * 因为后台的正确性比动效重要。
 */
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
  useId,
  useRef,
} from "react";
import { ChevronLeft, ChevronRight, Inbox, LoaderCircle, Lock, SearchX, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PageMeta } from "@/lib/types";

/* ---------------------------------------------------------------- 基础件 */

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={cn("animate-spin", className)} strokeWidth={2} />;
}

export function LoadingBlock({ label = "加载中" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "default" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "default",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        // whitespace-nowrap 是必须的：按钮是 flex 容器，文字会变成匿名 flex item，
        // 一旦列宽不够就会把「回收站」折成「回收 / 站」两行。任何按钮标签都不该换行。
        "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-8.5 px-3 text-sm",
        variant === "primary" && "border-accent bg-accent text-accent-fg hover:bg-accent-hover hover:border-accent-hover",
        variant === "default" && "border-control-line bg-surface text-fg hover:bg-hover",
        variant === "ghost" && "border-transparent bg-transparent text-muted hover:bg-hover hover:text-fg",
        variant === "danger" && "border-danger/50 bg-transparent text-danger hover:bg-danger-soft",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === "sm" ? 12 : 14} /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-sm border border-transparent text-muted transition-colors",
        "hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

const controlBase =
  // 控件边框用 control-line（对底色 3:1，满足 WCAG 1.4.11）；
  // hover 加深而不是变浅，因为 control-line 已经比 line-strong 深。
  "w-full rounded-sm border border-control-line bg-surface px-2.5 text-sm text-fg placeholder:text-subtle " +
  "transition-colors hover:border-muted disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlBase, "h-8.5", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlBase, "min-h-20 resize-y py-2 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlBase, "h-8.5 cursor-pointer pr-7", className)} {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-fg", className)}>
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--tb-accent)]"
        {...rest}
      />
      <span className="min-w-0">{label}</span>
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  // 整行是一个 role="switch" 的按钮：点文字也能切换，且不出现 button 套在 label 里的无效结构。
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-xs px-0.5 py-0.5 text-left text-sm text-fg transition-colors",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-hover",
      )}
    >
      <span
        className={cn(
          "relative h-4.5 w-8 shrink-0 rounded-full border transition-colors",
          checked ? "border-accent bg-accent" : "border-line-strong bg-hover",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-surface transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
      <span className="min-w-0">{label}</span>
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="flex items-baseline gap-1 text-xs font-medium text-muted">
          <span>{label}</span>
          {required ? <span className="text-danger">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {!error && hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- 展示件 */

export type BadgeTone = "neutral" | "ok" | "warn" | "danger" | "info" | "accent";

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xs border px-1.5 py-px text-xs leading-5 whitespace-nowrap",
        tone === "neutral" && "border-line bg-sunken text-muted",
        tone === "ok" && "border-ok/35 bg-ok-soft text-ok",
        tone === "warn" && "border-warn/35 bg-warn-soft text-warn",
        tone === "danger" && "border-danger/35 bg-danger-soft text-danger",
        tone === "info" && "border-info/35 bg-info-soft text-info",
        tone === "accent" && "border-accent/35 bg-accent-soft text-accent-strong",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-sm border border-line bg-surface", className)}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-line px-4 py-3", className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-b border-line px-4 py-3", className)}>{children}</div>
  );
}

/* ---------------------------------------------------------------- 空状态 */

export type EmptyKind = "empty" | "search" | "forbidden" | "error";

const EMPTY_COPY: Record<EmptyKind, { title: string; description: string }> = {
  empty: { title: "暂无数据", description: "这里还没有任何记录。" },
  search: { title: "没有搜索结果", description: "换个关键词或调整筛选条件再试试。" },
  forbidden: { title: "无权限", description: "当前账号没有访问该模块的权限，请联系站点所有者。" },
  error: { title: "加载失败", description: "数据没能取回来，稍后重试或检查服务是否在运行。" },
};

export function EmptyState({
  kind = "empty",
  title,
  description,
  action,
}: {
  kind?: EmptyKind;
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  const copy = EMPTY_COPY[kind];
  const Icon = kind === "search" ? SearchX : kind === "forbidden" ? Lock : kind === "error" ? TriangleAlert : Inbox;
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <Icon size={26} strokeWidth={1.5} className="text-subtle" />
      <p className="text-sm font-medium text-fg">{title ?? copy.title}</p>
      <p className="max-w-sm text-xs text-muted">{description ?? copy.description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- 分页 */

export function Pagination({
  meta,
  onPage,
  className,
}: {
  meta: PageMeta;
  onPage: (page: number) => void;
  className?: string;
}) {
  const { page, pageSize, total, totalPages } = meta;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="分页"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted",
        className,
      )}
    >
      <span>
        共 {total} 条{total > 0 ? `（第 ${from}–${to} 条）` : ""}
      </span>
      <div className="flex items-center gap-2">
        <span>
          第 {page} / {totalPages} 页
        </span>
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} icon={<ChevronLeft size={14} />}>
          上一页
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          下一页
          <ChevronRight size={14} />
        </Button>
      </div>
    </nav>
  );
}

/* ---------------------------------------------------------------- 表格 */

/**
 * 表格容器。
 *
 * 默认 `table-fixed`：这张表的设计是"除一个弹性列外，每列都给死宽度"，
 * 固定布局才能让那个弹性列上的 `truncate` 真正生效。
 * auto 布局下，一个不换行的长标题会把整张表撑宽 → 出现横向滚动条 → 分页行上下跳 10px。
 *
 * `minWidth` 是"低于这个宽度才允许横向滚动"的下限。桌面端内容区通常宽于它，
 * 因此桌面不会出现横向滚动条；移动端出现滚动条是预期行为（移动端滚动条是浮层，不占位）。
 */
export function TableWrap({
  children,
  className,
  minWidth = 720,
  label,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: number;
  /** 供屏幕阅读器识别这块可滚动区域，必填才有意义。 */
  label?: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn("relative overflow-x-auto overscroll-x-contain", className)}
    >
      <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  className,
  align = "left",
}: {
  children?: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={cn(
        "border-b border-line bg-sunken px-3 py-2 text-xs font-medium text-muted whitespace-nowrap",
        align === "left" && "text-left",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = "left",
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-b border-line px-3 py-2.5 align-middle text-fg",
        align === "left" && "text-left",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("transition-colors hover:bg-hover", className)}>{children}</tr>;
}

export function TableSkeleton({ rows = 6, columns }: { rows?: number; columns: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex}>
          {Array.from({ length: columns }).map((__, cellIndex) => (
            <td key={cellIndex} className="border-b border-line px-3 py-3">
              <div className="h-3 w-full max-w-40 animate-pulse rounded-xs bg-hover" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/** 数据加载时的一层半透明遮罩，保留旧内容避免列表跳动。 */
export function LoadingOverlay({ visible, label = "加载中" }: { visible: boolean; label?: string }) {
  if (!visible) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-surface/60 text-xs text-muted">
      <Spinner size={14} />
      <span>{label}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- 标签页 */

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: ReactNode; count?: number }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-line px-4">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-current={item.value === value ? "true" : undefined}
          onClick={() => onChange(item.value)}
          className={cn(
            "-mb-px border-b-2 px-2.5 py-2 text-sm transition-colors",
            item.value === value
              ? "border-accent font-medium text-fg"
              : "border-transparent text-muted hover:text-fg",
          )}
        >
          {item.label}
          {typeof item.count === "number" ? (
            <span className="ml-1.5 text-xs text-subtle">{item.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- 对话框 */

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * 对话框焦点管理：打开时把焦点移进容器、Tab 在容器内循环、关闭后把焦点还给触发元素。
 *
 * 不做背景 inert：自绘遮罩没有原生 `<dialog>` 的顶层语义，但"Tab 跑到背景控件上"
 * 是对话框最常见也最要紧的无障碍缺陷，循环焦点就足以挡住它。
 * 同时锁住 body 滚动，避免滚轮带动背景。
 */
export function useDialogFocus(open: boolean, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () =>
      Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);

    (focusables()[0] ?? container)?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) {
        event.preventDefault();
        return;
      }
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const active = document.activeElement;
      const inside = active instanceof Node && container?.contains(active);
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, containerRef]);
}

/** ---------------------------------------------------------------- 模态框 */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useDialogFocus(open, panelRef);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto overscroll-contain p-4 sm:p-8">
      <div className="fixed inset-0 bg-black/35" role="presentation" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        // 用 aria-labelledby 指向真实标题节点：title 可能是 ReactNode，
        // 那种情况下 aria-label 是 undefined，对话框就没有可访问名了。
        aria-labelledby={titleId}
        className={cn(
          "relative my-auto w-full rounded-sm border border-line bg-surface shadow-lg",
          width === "sm" && "max-w-sm",
          width === "md" && "max-w-lg",
          width === "lg" && "max-w-2xl",
          width === "xl" && "max-w-4xl",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-fg">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
          <IconButton label="关闭" onClick={onClose}>
            <X size={15} strokeWidth={2} />
          </IconButton>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
