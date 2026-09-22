/**
 * P3 i18n: 中文为底的最小字典。
 * 提供 t(key, lang) 查表；缺省回退 zh。新语言只需补 en 等 lang 的子集。
 */
export const LANG_ZH = 'zh';

const dict = {
  zh: {
    // 工具栏提示（title / aria-label）
    bold: '加粗 (Ctrl+B)',
    italic: '斜体 (Ctrl+I)',
    strike: '删除线',
    underline: '下划线',
    code: '行内代码',
    link: '插入链接',
    image: '插入图片',
    upload: '上传文件',
    h1: '一级标题',
    h2: '二级标题',
    h3: '三级标题',
    h4: '四级标题',
    h5: '五级标题',
    h6: '六级标题',
    bulletList: '无序列表',
    orderedList: '有序列表',
    taskList: '任务列表',
    quote: '引用',
    codeBlock: '代码块',
    table: '插入表格',
    hr: '分隔线',
    undo: '撤销',
    redo: '重做',
    superscript: '上标',
    subscript: '下标',
    highlight: '高亮',
    clearFormat: '清除格式',
    footnote: '脚注',
    toc: '目录',
    math: '数学公式',
    mermaid: 'Mermaid 图表',
    graphviz: 'Graphviz 图',
    plantuml: 'PlantUML 图',
    indent: '增加缩进',
    outdent: '减少缩进',
    alignLeft: '左对齐',
    alignCenter: '居中',
    alignRight: '右对齐',
    formatDoc: '格式化文档',
    viewMode: '视图模式',
    more: '更多操作',
    // 视图模式菜单
    normal: '普通编辑',
    ir: '即时渲染',
    // 分组标题
    group_format: '格式',
    group_block: '块',
    group_insert: '插入',
    group_misc: '杂项',
    toolbar_label: '格式工具栏'
  },
  en: {
    bold: 'Bold (Ctrl+B)',
    italic: 'Italic (Ctrl+I)',
    strike: 'Strikethrough',
    underline: 'Underline',
    code: 'Inline code',
    link: 'Insert link',
    image: 'Insert image',
    upload: 'Upload file',
    bulletList: 'Bullet list',
    orderedList: 'Ordered list',
    taskList: 'Task list',
    quote: 'Blockquote',
    codeBlock: 'Code block',
    table: 'Insert table',
    hr: 'Horizontal rule',
    viewMode: 'View mode',
    more: 'More actions',
    normal: 'Normal',
    ir: 'Instant render',
    group_format: 'Formatting',
    group_block: 'Block',
    group_insert: 'Insert',
    group_misc: 'Misc',
    toolbar_label: 'Formatting toolbar'
  }
};

/**
 * Evaluates the copy for the given lang, falling back to zh if missing.
 */
let currentLang = LANG_ZH;

export function t(key, lang = currentLang) {
  const scope = dict[lang] || dict[LANG_ZH];
  if (scope && Object.prototype.hasOwnProperty.call(scope, key)) {
    return scope[key];
  }
  const zh = dict[LANG_ZH];
  return zh && Object.prototype.hasOwnProperty.call(zh, key) ? zh[key] : key;
}

/**
 * Set the module-level default language (only recognized langs take effect).
 * @returns {string} the effective lang after switch.
 */
export function setLang(lang) {
  if (dict[lang]) {
    currentLang = lang;
  }
  return currentLang;
}

/** 当前支持的语种列表（zh 为底，en 为部分子集） */
export const supportedLangs = Object.keys(dict);