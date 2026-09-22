// Type definitions for OverType
// Project: https://github.com/panphora/overtype
// Definitions generated from themes.js and styles.js
// DO NOT EDIT MANUALLY - Run 'npm run generate:types' to regenerate

export interface PreviewColors {
    bg?: string;
    blockquote?: string;
    code?: string;
    codeBg?: string;
    em?: string;
    h1?: string;
    h2?: string;
    h3?: string;
    hr?: string;
    link?: string;
    strong?: string;
    text?: string;
}

export interface Theme {
  name: string;
  colors: {
    accent?: string;
    bgPrimary?: string;
    bgSecondary?: string;
    blockquote?: string;
    border?: string;
    code?: string;
    codeBg?: string;
    cursor?: string;
    del?: string;
    em?: string;
    h1?: string;
    h2?: string;
    h3?: string;
    hoverBg?: string;
    hr?: string;
    link?: string;
    listMarker?: string;
    placeholder?: string;
    primary?: string;
    rawLine?: string;
    selection?: string;
    strong?: string;
    syntax?: string;
    syntaxMarker?: string;
    text?: string;
    textPrimary?: string;
    textSecondary?: string;
    toolbarActive?: string;
    toolbarBg?: string;
    toolbarBorder?: string;
    toolbarHover?: string;
    toolbarIcon?: string;
  };
  previewColors?: PreviewColors;
}

export interface Stats {
  words: number;
  chars: number;
  lines: number;
  line: number;
  column: number;
}

/**
 * Toolbar button definition
 */
export interface ToolbarButton {
  /** Unique button identifier */
  name: string;

  /** SVG icon markup (optional for separator) */
  icon?: string;

  /** Button tooltip text (optional for separator) */
  title?: string;

  /** Button action callback (optional for separator) */
  action?: (context: {
    editor: OverType;
    getValue: () => string;
    setValue: (value: string) => void;
    event: MouseEvent;
  }) => void | Promise<void>;

  /** Canonical action identifier used by shortcuts and performAction */
  actionId?: string;

  /** Return true when this button should be announced as pressed */
  isActive?: (context: {
    editor: OverType;
    activeFormats: string[];
  }) => boolean;

  /** 「更多」面板内的分组（仅对 more:true 生效） */
  group?: '格式' | '块' | '插入' | '杂项';

  /** 归入「更多」面板（默认 false：常显） */
  more?: boolean;
}

export interface MobileOptions {
  fontSize?: string;
  padding?: string;
  lineHeight?: string | number;
}

export interface Options {
  // Typography
  fontSize?: string;
  lineHeight?: string | number;
  fontFamily?: string;
  padding?: string;

  // Mobile responsive
  mobile?: MobileOptions;

  // Native textarea attributes (v1.1.2+)
  textareaProps?: Record<string, any>;

  // Behavior
  autofocus?: boolean;
  autoResize?: boolean;      // v1.1.2+ Auto-expand height with content
  minHeight?: string;         // v1.1.2+ Minimum height for autoResize mode
  maxHeight?: string | null;  // v1.1.2+ Maximum height for autoResize mode
  placeholder?: string;
  value?: string;

  // Features
  showActiveLineRaw?: boolean;
  showStats?: boolean;
  toolbar?: boolean;
  toolbarButtons?: ToolbarButton[];  // Custom toolbar button configuration
  lang?: 'zh' | 'en';                // P3: 工具栏/提示语种（默认 'zh'）
  smartLists?: boolean;       // v1.2.3+ Smart list continuation
  spellcheck?: boolean;       // Browser spellcheck (default: false)
  statsFormatter?: (stats: Stats) => string;
  codeHighlighter?: ((code: string, language: string) => string) | null;  // Per-instance code highlighter
  transformLinkUrl?: ((url: string) => string) | null;  // Transform URLs shown/opened in the link tooltip
  medium?: 'input' | 'window';   // Editor presentation
  professional?: any;            // { math, mermaid, graphviz } on-demand rendering
  pasteHTML?: boolean;           // P2: convert pasted HTML to Markdown

  // Theme (deprecated in favor of global theme)
  theme?: string | Theme;
  colors?: Partial<Theme['colors']>;
  previewColors?: PreviewColors;

  // File upload
  fileUpload?: {
    enabled: boolean;
    maxSize?: number;
    mimeTypes?: string[];
    batch?: boolean;
    onInsertFile: (file: File | File[]) => Promise<string | string[]>;
    onRemoveFile?: (info: { url: string; filename: string; file: File }) => void;
  };

  // Callbacks
  onChange?: (value: string, instance: OverTypeInstance) => void;
  onKeydown?: (event: KeyboardEvent, instance: OverTypeInstance) => void;
  onFocus?: (event: FocusEvent, instance: OverTypeInstance) => void;
  onBlur?: (event: FocusEvent, instance: OverTypeInstance) => void;
}

// Interface for constructor that returns array
export interface OverTypeConstructor {
  new(target: string | Element | NodeList | Element[], options?: Options): OverTypeInstance[];
  // Static members
  instances: any;
  stylesInjected: boolean;
  globalListenersInitialized: boolean;
  instanceCount: number;
  currentTheme: Theme;
  themes: {
    solar: Theme;
    cave: Theme;
  };
  MarkdownParser: any;
  ShortcutsManager: any;
  init(target: string | Element | NodeList | Element[], options?: Options): OverTypeInstance[];
  initFromData(target: string | Element | NodeList | Element[], defaults?: Options): OverTypeInstance[];
  getInstance(target: string | Element | NodeList | Element[]): OverTypeInstance | null;
  destroyAll(): void;
  injectStyles(force?: boolean): void;
  setTheme(theme: string | Theme, customColors?: Partial<Theme['colors']>): void;
  setCodeHighlighter(highlighter: ((code: string, language: string) => string) | null): void;
  initGlobalListeners(): void;
  getTheme(name: string): Theme;
}

export interface RenderOptions {
  cleanHTML?: boolean;
}

/** P3: 只读语法树节点（editor.getSyntaxTree() 返回值） */
export interface SyntaxTreeNode {
  type: string;
  text?: string;
  level?: number;
  lang?: string;
  ordered?: boolean;
  items?: (SyntaxTreeNode | { text?: string; checked?: boolean; task?: boolean; inline?: object[] })[];
  header?: string[];
  rows?: string[][];
  inline?: object[];
  line?: number;
  children?: SyntaxTreeNode[];
}

export interface OverTypeInstance {
  // Public properties
  container: HTMLElement;
  wrapper: HTMLElement;
  textarea: HTMLTextAreaElement;
  preview: HTMLElement;
  statsBar?: HTMLElement;
  toolbar?: any; // Toolbar instance
  shortcuts?: any; // ShortcutsManager instance
  linkTooltip?: any; // LinkTooltip instance
  options: Options;
  initialized: boolean;
  instanceId: number;
  element: Element;

  // Public methods
  getValue(): string;
  setValue(value: string): void;
  getSyntaxTree(): SyntaxTreeNode;   // P3: 只读语法树
  setLang(lang: string): void;       // P3: 运行时切换工具栏语种
  getStats(): Stats;
  renderInto(el: HTMLElement, options?: object): void;   // E3: 样式预览栏渲染
  getContainer(): HTMLElement;
  focus(): void;
  blur(): void;
  destroy(): void;
  isInitialized(): boolean;
  reinit(options: Options): void;
  showStats(show: boolean): void;
  setTheme(theme: string | Theme): this;
  setCodeHighlighter(highlighter: ((code: string, language: string) => string) | null): void;
  updatePreview(): void;
  performAction(actionId: string, event?: Event | null): Promise<boolean>;
  showToolbar(): void;
  hideToolbar(): void;
  insertAtCursor(text: string): void;
  indentSelection(): void;
  outdentSelection(): void;

  // HTML output methods
  getRenderedHTML(options?: RenderOptions): string;
  getCleanHTML(): string;
  getPreviewHTML(): string;

  // P2 导出
  exportHTML(title?: string): string;
  exportWeChat(): string;
  exportZhihu(): string;
  exportPDF(title?: string): void;

  // View mode methods
  showNormalEditMode(): this;
  showPlainTextarea(): this;
  showPreviewMode(): this;
  showInstantRenderMode(): this;
}

// Declare the constructor as a constant with proper typing
declare const OverType: OverTypeConstructor;

// Export the instance type under a different name for clarity
export type OverType = OverTypeInstance;

// Module exports - default export is the constructor
export default OverType;

/** Re-exported markdown-actions. Useful for custom toolbar implementations */
export const markdownActions: {
  toggleBold(textarea: HTMLTextAreaElement): void;
  toggleItalic(textarea: HTMLTextAreaElement): void;
  toggleCode(textarea: HTMLTextAreaElement): void;
  insertLink(textarea: HTMLTextAreaElement, options?: { url?: string; text?: string }): void;
  toggleBulletList(textarea: HTMLTextAreaElement): void;
  toggleNumberedList(textarea: HTMLTextAreaElement): void;
  toggleQuote(textarea: HTMLTextAreaElement): void;
  toggleTaskList(textarea: HTMLTextAreaElement): void;
  insertHeader(textarea: HTMLTextAreaElement, level?: number, toggle?: boolean): void;
  toggleH1(textarea: HTMLTextAreaElement): void;
  toggleH2(textarea: HTMLTextAreaElement): void;
  toggleH3(textarea: HTMLTextAreaElement): void;
  getActiveFormats(textarea: HTMLTextAreaElement): string[];
  hasFormat(textarea: HTMLTextAreaElement, format: string): boolean;
  expandSelection(textarea: HTMLTextAreaElement, options?: object): void;
  applyCustomFormat(textarea: HTMLTextAreaElement, format: object): void;
};

/**
 * Pre-defined toolbar buttons
 */
export const toolbarButtons: {
  bold: ToolbarButton;
  italic: ToolbarButton;
  strike: ToolbarButton;
  underline: ToolbarButton;
  code: ToolbarButton;
  link: ToolbarButton;
  image: ToolbarButton;
  upload: ToolbarButton;
  h1: ToolbarButton;
  h2: ToolbarButton;
  h3: ToolbarButton;
  h4: ToolbarButton;
  h5: ToolbarButton;
  h6: ToolbarButton;
  bulletList: ToolbarButton;
  orderedList: ToolbarButton;
  taskList: ToolbarButton;
  quote: ToolbarButton;
  codeBlock: ToolbarButton;
  table: ToolbarButton;
  hr: ToolbarButton;
  separator: ToolbarButton;
  viewMode: ToolbarButton;
  more: ToolbarButton;
  [key: string]: ToolbarButton;
};

/**
 * Default toolbar button layout with separators
 */
export const defaultToolbarButtons: ToolbarButton[];
