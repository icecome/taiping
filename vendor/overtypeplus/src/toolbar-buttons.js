/**
 * Toolbar button definitions for OverType editor
 * Export built-in buttons that can be used in custom toolbar configurations
 *
 * P3: 扩展至 36+ 项，拆分为「常显 bar」defaultToolbarButtons 与
 *     「更多 panel」moreToolbarButtons（按 group 分组）。
 *     新增格式动作以零依赖的内联文本处理实现。
 */

import * as icons from './icons.js';
import * as markdownActions from 'markdown-actions';

// ===== 内联格式化工具（选区包裹 / 行级改写，零依赖） =====

/** 用 open/close 包裹选区，若已包裹则移除（toggle 语义） */
function toggleWrap(ta, open, close = open) {
  const s = ta.selectionStart || 0;
  const e = ta.selectionEnd || 0;
  const val = ta.value;
  const sel = val.slice(s, e);
  if (val.startsWith(open, s) && val.endsWith(close, e)) {
    const inner = val.slice(s + open.length, e - close.length);
    ta.setSelectionRange(0, 0);
    ta.value = val.slice(0, s) + inner + val.slice(e);
    ta.setSelectionRange(s, s + inner.length);
  } else {
    ta.setSelectionRange(0, 0);
    ta.value = val.slice(0, s) + open + sel + close + val.slice(e);
    ta.setSelectionRange(s + open.length, s + open.length + sel.length);
  }
}

/** 对命中行统一加 prefix；selection 留原位 */
function prefixBlock(ta, prefix) {
  const lines = ta.value.split('\n');
  const s = ta.selectionStart || 0;
  let lineIndex = 0;
  let acc = 0;
  while (acc + lines[lineIndex].length < s && lineIndex < lines.length - 1) {
    acc += lines[lineIndex].length + 1;
    lineIndex++;
  }
  lines[lineIndex] = prefix + lines[lineIndex];
  ta.value = lines.join('\n');
  ta.setSelectionRange(s + prefix.length, s + prefix.length);
}

/** 在当前光标/行插入多行文本块到选中处 */
function insertBlock(ta, text) {
  const s = ta.selectionStart || 0;
  const e = ta.selectionEnd || s;
  ta.setSelectionRange(0, 0);
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
  ta.setSelectionRange(s, s + text.length);
}

/** 澄清当前行为普通 Markdown 文本（去除语法标记） */
function clearFormatOnSelection(ta) {
  const s = ta.selectionStart || 0;
  const e = ta.selectionEnd || 0;
  if (s === e) return false;
  const sel = ta.value.slice(s, e);
  const cleaned = sel
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^>\s*/gm, '');
  ta.value = ta.value.slice(0, s) + cleaned + ta.value.slice(e);
  ta.setSelectionRange(s, s + cleaned.length);
  return true;
}

/** 规整全文：收敛多余空行、标题前补空行（轻量） */
function formatDocumentContent(text) {
  return text
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/(^|\n)#{1,6} [^\n]+/g, (m, pre) => (pre === '\n' ? '\n' + m.trim() : m.trim()))
    .trim() + '\n';
}

// ===== 逻辑可复用的 action 包装 =====
const dispatch = ({ editor, ta }) => {
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  if (editor.toolbar) editor.toolbar.updateButtonStates();
};

/** 供快捷键/程序调用：带光标的样式动作统一入口 */
const makeAction = (fn) => (ctx) => {
  const { editor } = ctx;
  const ta = editor.textarea;
  const ran = fn(ta);
  if (ran !== false) dispatch(ctx);
};

function insertTableAt(ta) {
  const t = '| 表头A | 表头B |\n| --- | --- |\n| 内容A | 内容B |\n';
  insertBlock(ta, t);
}
function codeBlockAt(ta) {
  const s = ta.selectionStart || 0;
  const e = ta.selectionEnd || s;
  const sel = ta.value.slice(s, e) || '代码';
  insertBlock(ta, '```\n' + sel + '\n```');
}
function imageAt(ta) {
  insertBlock(ta, '![](图片URL)');
}
function blockAt(ta, prefix) {
  prefixBlock(ta, prefix);
}

const md = ({ editor }, fn) => {
  fn(editor.textarea);
  editor.textarea.dispatchEvent(new Event('input', { bubbles: true }));
};

// ===== 内置按钮（含新增） =====
export const toolbarButtons = {
  // --- 样式 ---
  bold: {
    name: 'bold', actionId: 'toggleBold', icon: icons.boldIcon, title: 'bold',
    isActive: ({ activeFormats }) => activeFormats.includes('bold'),
    action: (c) => md(c, markdownActions.toggleBold)
  },
  italic: {
    name: 'italic', actionId: 'toggleItalic', icon: icons.italicIcon, title: 'italic',
    isActive: ({ activeFormats }) => activeFormats.includes('italic'),
    action: (c) => md(c, markdownActions.toggleItalic)
  },
  strike: {
    name: 'strike', actionId: 'toggleStrike', icon: icons.strikeIcon, title: 'strike',
    isActive: ({ activeFormats }) => activeFormats.includes('strikethrough'),
    action: makeAction(ta => toggleWrap(ta, '~~'))
  },
  underline: {
    name: 'underline', actionId: 'toggleUnderline', icon: icons.underlineIcon, title: 'underline',
    isActive: () => false,
    action: makeAction(ta => toggleWrap(ta, '<u>', '</u>'))
  },
  code: {
    name: 'code', actionId: 'toggleCode', icon: icons.codeIcon, title: 'code',
    isActive: ({ activeFormats }) => activeFormats.includes('code'),
    action: ({ editor }) => markdownActions.toggleCode(editor.textarea), provider: 'md'
  },
  superscript: {
    name: 'superscript', actionId: 'toggleSuperscript', icon: icons.superscriptIcon, title: 'superscript',
    group: '格式', more: true,
    action: makeAction(ta => toggleWrap(ta, '<sup>', '</sup>'))
  },
  subscript: {
    name: 'subscript', actionId: 'toggleSubscript', icon: icons.subscriptIcon, title: 'subscript',
    group: '格式', more: true,
    action: makeAction(ta => toggleWrap(ta, '<sub>', '</sub>'))
  },
  highlight: {
    name: 'highlight', actionId: 'toggleHighlight', icon: icons.highlightIcon, title: 'highlight',
    group: '格式', more: true,
    action: makeAction(ta => toggleWrap(ta, '=='))
  },
  clearFormat: {
    name: 'clearFormat', actionId: 'clearFormat', icon: icons.clearFormatIcon, title: 'clearFormat',
    group: '格式', more: true,
    action: makeAction(ta => clearFormatOnSelection(ta))
  },

  // --- 引用/行内 ---
  link: {
    name: 'link', actionId: 'insertLink', icon: icons.linkIcon, title: 'link',
    action: ({ editor }) => markdownActions.insertLink(editor.textarea), provider: 'md'
  },
  image: {
    name: 'image', actionId: 'insertImage', icon: icons.imageIcon, title: 'image',
    action: makeAction(imageAt)
  },

  // --- 标题 ---
  h1: {
    name: 'h1', actionId: 'toggleH1', icon: icons.h1Icon, title: 'h1',
    isActive: ({ activeFormats }) => activeFormats.includes('header'),
    action: ({ editor }) => markdownActions.toggleH1(editor.textarea), provider: 'md'
  },
  h2: {
    name: 'h2', actionId: 'toggleH2', icon: icons.h2Icon, title: 'h2',
    isActive: ({ activeFormats }) => activeFormats.includes('header-2'),
    action: ({ editor }) => markdownActions.toggleH2(editor.textarea), provider: 'md'
  },
  h3: {
    name: 'h3', actionId: 'toggleH3', icon: icons.h3Icon, title: 'h3',
    isActive: ({ activeFormats }) => activeFormats.includes('header-3'),
    action: ({ editor }) => markdownActions.toggleH3(editor.textarea), provider: 'md'
  },
  h4: {
    name: 'h4', actionId: 'toggleH4', icon: icons.h4Icon, title: 'h4',
    group: '块', more: true,
    isActive: ({ activeFormats }) => activeFormats.includes('header-4'),
    action: makeAction(ta => prefixBlock(ta, '#### '))
  },
  h5: {
    name: 'h5', actionId: 'toggleH5', icon: icons.h5Icon, title: 'h5',
    group: '块', more: true,
    isActive: ({ activeFormats }) => activeFormats.includes('header-5'),
    action: makeAction(ta => prefixBlock(ta, '##### '))
  },
  h6: {
    name: 'h6', actionId: 'toggleH6', icon: icons.h6Icon, title: 'h6',
    group: '块', more: true,
    isActive: ({ activeFormats }) => activeFormats.includes('header-6'),
    action: makeAction(ta => prefixBlock(ta, '###### '))
  },

  // --- 列表 ---
  bulletList: {
    name: 'bulletList', actionId: 'toggleBulletList', icon: icons.bulletListIcon, title: 'bulletList',
    isActive: ({ activeFormats }) => activeFormats.includes('bullet-list'),
    action: ({ editor }) => markdownActions.toggleBulletList(editor.textarea), provider: 'md'
  },
  orderedList: {
    name: 'orderedList', actionId: 'toggleNumberedList', icon: icons.orderedListIcon, title: 'orderedList',
    isActive: ({ activeFormats }) => activeFormats.includes('numbered-list'),
    action: ({ editor }) => markdownActions.toggleNumberedList(editor.textarea), provider: 'md'
  },
  taskList: {
    name: 'taskList', actionId: 'toggleTaskList', icon: icons.taskListIcon, title: 'taskList',
    isActive: ({ activeFormats }) => activeFormats.includes('task-list'),
    action: ({ editor }) => { if (markdownActions.toggleTaskList) markdownActions.toggleTaskList(editor.textarea); }, provider: 'md'
  },

  // --- 块 ---
  quote: {
    name: 'quote', actionId: 'toggleQuote', icon: icons.quoteIcon, title: 'quote',
    isActive: ({ activeFormats }) => activeFormats.includes('quote'),
    action: ({ editor }) => markdownActions.toggleQuote(editor.textarea), provider: 'md'
  },
  codeBlock: {
    name: 'codeBlock', actionId: 'insertCodeBlock', icon: icons.codeBlockIcon, title: 'codeBlock',
    action: makeAction(codeBlockAt)
  },
  table: {
    name: 'table', actionId: 'insertTable', icon: icons.tableIcon, title: 'table',
    action: makeAction(insertTableAt)
  },
  hr: {
    name: 'hr', actionId: 'insertHR', icon: icons.hrIcon, title: 'hr',
    action: makeAction(ta => insertBlock(ta, '\n---\n'))
  },

  // --- 插入（更多面板） ---
  footnote: {
    name: 'footnote', actionId: 'insertFootnote', icon: icons.footnoteIcon, title: 'footnote',
    group: '插入', more: true,
    action: makeAction(ta => insertBlock(ta, '[^1] 脚注内容'))
  },
  toc: {
    name: 'toc', actionId: 'insertTOC', icon: icons.tocIcon, title: 'toc',
    group: '插入', more: true,
    action: makeAction(ta => insertBlock(ta, '[TOC]'))
  },
  math: {
    name: 'math', actionId: 'insertMath', icon: icons.mathIcon, title: 'math',
    group: '插入', more: true,
    action: makeAction(ta => toggleWrap(ta, '$$', '$$'))
  },
  mermaid: {
    name: 'mermaid', actionId: 'insertMermaid', icon: icons.mermaidIcon, title: 'mermaid',
    group: '插入', more: true,
    action: makeAction(ta => insertBlock(ta, '```mermaid\ngraph TD\n  A-->B\n```'))
  },
  graphviz: {
    name: 'graphviz', actionId: 'insertGraphviz', icon: icons.graphvizIcon, title: 'graphviz',
    group: '插入', more: true,
    action: makeAction(ta => insertBlock(ta, '```dot\ndigraph G {\n  A -> B;\n}\n```'))
  },
  plantuml: {
    name: 'plantuml', actionId: 'insertPlantuml', icon: icons.plantumlIcon, title: 'plantuml',
    group: '插入', more: true,
    action: makeAction(ta => insertBlock(ta, '```plantuml\n@startuml\nAlice -> Bob: hi\n@enduml\n```'))
  },

  // --- 杂项 ---
  indent: {
    name: 'indent', actionId: 'indentText', icon: icons.indentIcon, title: 'indent',
    group: '杂项', more: true,
    action: makeAction(ta => prefixBlock(ta, '  '))
  },
  outdent: {
    name: 'outdent', actionId: 'outdentText', icon: icons.outdentIcon, title: 'outdent',
    group: '杂项', more: true,
    action: makeAction(ta => {
      const lines = ta.value.split('\n');
      const start = ta.selectionStart || 0;
      let li = 0, acc = 0;
      while (acc + lines[li].length < start && li < lines.length - 1) { acc += lines[li].length + 1; li++; }
      lines[li] = lines[li].replace(/^ {2}/, '');
      ta.value = lines.join('\n');
      ta.setSelectionRange(Math.max(0, start - 2), Math.max(0, start - 2));
      return true;
    })
  },
  alignLeft: {
    name: 'alignLeft', actionId: 'alignLeft', icon: icons.alignLeftIcon, title: 'alignLeft',
    group: '杂项', more: true,
    isActive: ({ activeFormats }) => activeFormats.includes('align-left'),
    action: makeAction(ta => toggleWrap(ta, '<div align="left">', '</div>'))
  },
  alignCenter: {
    name: 'alignCenter', actionId: 'alignCenter', icon: icons.alignCenterIcon, title: 'alignCenter',
    group: '杂项', more: true,
    isActive: ({ activeFormats }) => activeFormats.includes('align-center'),
    action: makeAction(ta => toggleWrap(ta, '<div align="center">', '</div>'))
  },
  alignRight: {
    name: 'alignRight', actionId: 'alignRight', icon: icons.alignRightIcon, title: 'alignRight',
    group: '杂项', more: true,
    isActive: ({ activeFormats }) => activeFormats.includes('align-right'),
    action: makeAction(ta => toggleWrap(ta, '<div align="right">', '</div>'))
  },
  formatDoc: {
    name: 'formatDoc', actionId: 'formatDocument', icon: icons.formatDocIcon, title: 'formatDoc',
    group: '杂项', more: true,
    action: ({ editor, getValue, setValue }) => {
      setValue(formatDocumentContent(getValue()));
      editor.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  },

  separator: { name: 'separator', group: '__none__' },

  // --- 上传/视图（特殊，内部处理） ---
  upload: {
    name: 'upload', actionId: 'uploadFile', icon: icons.uploadIcon, title: 'upload',
    action: ({ editor }) => {
      if (!editor.options.fileUpload?.enabled) return;
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      if (editor.options.fileUpload.mimeTypes?.length > 0) {
        input.accept = editor.options.fileUpload.mimeTypes.join(',');
      }
      input.onchange = () => {
        if (!input.files?.length) return;
        const dt = new DataTransfer();
        for (const f of input.files) dt.items.add(f);
        editor._handleDataTransfer(dt);
      };
      input.click();
    }
  },
  viewMode: {
    name: 'viewMode', icon: icons.eyeIcon, title: 'viewMode'
    // 内部 Special dropdown
  },
  more: {
    name: 'more', icon: icons.moreIcon, title: 'more'
    // 内部 Special:「更多」面板触发器
  }
};

/**
 * 默认常显工具栏（bar）。
 * 保持向后兼容：原有按钮语义不变，额外新增样式/块级项。
 */
export const defaultToolbarButtons = [
  toolbarButtons.bold,
  toolbarButtons.italic,
  toolbarButtons.strike,
  toolbarButtons.underline,
  toolbarButtons.code,
  toolbarButtons.separator,
  toolbarButtons.link,
  toolbarButtons.image,
  toolbarButtons.upload,
  toolbarButtons.separator,
  toolbarButtons.h1,
  toolbarButtons.h2,
  toolbarButtons.h3,
  toolbarButtons.separator,
  toolbarButtons.bulletList,
  toolbarButtons.orderedList,
  toolbarButtons.taskList,
  toolbarButtons.separator,
  toolbarButtons.quote,
  toolbarButtons.codeBlock,
  toolbarButtons.table,
  toolbarButtons.hr,
  toolbarButtons.separator,
  toolbarButtons.more,
  toolbarButtons.viewMode
];

/**
 * 「更多」面板扩展项（P3）：按 group 分组展示。
 */
export const moreToolbarButtons = Object.values(toolbarButtons)
  .filter(b => b && b.more);

export { formatDocumentContent as formatDocument };