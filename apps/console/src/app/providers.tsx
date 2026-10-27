/**
 * 三个全局上下文：轻量提示（toast）、确认对话框、亮暗主题。
 *
 * 都不引第三方库：后台只需要"操作成功/失败说一句"和"危险操作问一次"，
 * 引入 UI 库会为了这两件事把整套设计语言一起带进来。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, useDialogFocus } from "@/components/ui";

/* ---------------------------------------------------------------- Toast */

export type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

export interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TOAST_DURATION = 4200;
const ERROR_TOAST_DURATION = 9000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
    };
  }, []);

  const push = useCallback((tone: ToastTone, message: string) => {
    seq.current += 1;
    const id = seq.current;
    setItems((previous) => [...previous, { id, tone, message }]);
    // 错误信息给更长的停留时间：用户往往需要照着它去改输入，4 秒读完不够。
    const duration = tone === "error" ? ERROR_TOAST_DURATION : TOAST_DURATION;
    const timer = window.setTimeout(() => {
      setItems((previous) => previous.filter((item) => item.id !== id));
      // 已触发过的计时器不需要留着，否则长会话里这个数组只增不减。
      timers.current = timers.current.filter((handle) => handle !== timer);
    }, duration);
    timers.current.push(timer);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message: string) => push("success", message),
      error: (message: string) => push("error", message),
      info: (message: string) => push("info", message),
    }),
    [push],
  );

  const dismiss = (id: number) => setItems((previous) => previous.filter((item) => item.id !== id));

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* 常驻容器承担 live region：动态插入的元素自带 role 时，部分读屏不会播报。
          错误的条目额外带 role="alert"（assertive），成功与提示走礼貌播报。 */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-[min(22rem,calc(100vw-2.5rem))] flex-col gap-2"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === "error" ? "alert" : undefined}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-sm border bg-surface px-3 py-2.5 text-sm shadow-sm",
              item.tone === "success" && "border-ok/40",
              item.tone === "error" && "border-danger/40",
              item.tone === "info" && "border-line",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 shrink-0",
                item.tone === "success" && "text-ok",
                item.tone === "error" && "text-danger",
                item.tone === "info" && "text-info",
              )}
            >
              {item.tone === "success" ? (
                <CircleCheck size={16} strokeWidth={2} />
              ) : item.tone === "error" ? (
                <CircleAlert size={16} strokeWidth={2} />
              ) : (
                <Info size={16} strokeWidth={2} />
              )}
            </span>
            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-fg">{item.message}</p>
            <button
              type="button"
              aria-label="关闭提示"
              onClick={() => dismiss(item.id)}
              className="shrink-0 rounded-xs p-0.5 text-subtle transition-colors hover:text-fg"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast 必须在 ToastProvider 内使用");
  return context;
}

/* ---------------------------------------------------------------- 确认对话框 */

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "default" | "danger";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface ConfirmState {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setState({ options, resolve });
      }),
    [],
  );

  const settle = (value: boolean) => {
    if (!state) return;
    state.resolve(value);
    setState(null);
  };

  useEffect(() => {
    if (!state) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        state.resolve(false);
        setState(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  // 焦点进入对话内、Tab 循环、关闭后回到触发按钮；同时锁背景滚动。
  useDialogFocus(Boolean(state), panelRef);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center overscroll-contain p-4">
          <div
            className="absolute inset-0 bg-black/35"
            role="presentation"
            onClick={() => settle(false)}
          />
          <div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={state.options.description ? descriptionId : undefined}
            className="relative w-full max-w-sm rounded-sm border border-line bg-surface p-5 shadow-lg"
          >
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {state.options.title}
            </h2>
            {state.options.description ? (
              <p id={descriptionId} className="mt-2 whitespace-pre-wrap text-sm text-muted">
                {state.options.description}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => settle(false)}>
                {state.options.cancelText ?? "取消"}
              </Button>
              <Button
                variant={state.options.tone === "danger" ? "danger" : "primary"}
                onClick={() => settle(true)}
              >
                {state.options.confirmText ?? "确认"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm 必须在 ConfirmProvider 内使用");
  return context;
}

/* ---------------------------------------------------------------- 主题模式 */

export type ThemeMode = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "taiping.console.theme";

interface ThemeModeContextValue {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* 隐私模式下 localStorage 可能不可用，回落 system */
  }
  return "system";
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [systemDark, setSystemDark] = useState<boolean>(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolved: "light" | "dark" = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* 写不进去也不影响本次会话的显示 */
    }
  }, []);

  const value = useMemo<ThemeModeContextValue>(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeModeContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) throw new Error("useThemeMode 必须在 ThemeModeProvider 内使用");
  return context;
}
