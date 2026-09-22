/**
 * p2-export.js - P2 output export (zero-dependency):
 *   - exportHTML(editor): standalone HTML document (full-fidelity)
 *   - exportWeChat(editor): flattened/inline-styled HTML for rich-text editors
 *   - exportZhihu(editor): Zhihu-compatible HTML (cookie of common tags)
 *   - exportPDF(editor): open a print dialog for browser-save-as-PDF
 *
 * All build on the core's getRenderedHTML({ cleanHTML: true }) so exports are
 * free of syntax markers and OverType-only classes.
 */

/** Shared minimal CSS so exported HTML renders reasonably in any viewer. */
const EXPORT_CSS = `
  body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.7;color:#1f2328;max-width:760px;margin:24px auto;padding:0 16px;}
  h1,h2,h3{line-height:1.3;margin:1.2em 0 .5em;}
  pre{background:#f6f8fa;padding:12px 14px;border-radius:6px;overflow:auto;font-size:14px;}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f6f8fa;border-radius:4px;padding:1px 5px;}
  pre code{background:none;padding:0;}
  blockquote{border-left:3px solid #d0d7de;margin:0;padding-left:14px;color:#57606a;}
  table{border-collapse:collapse;width:100%;}
  th,td{border:1px solid #d0d7de;padding:6px 10px;}
  img{max-width:100%;}
  hr{border:0;border-top:1px solid #d0d7de;margin:2em 0;}
`.trim();

/** Inline the CSS + body, returning a full standalone HTML string. */
function standaloneHTML(title, body) {
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    `<title>${escapeHtml(title)}</title>`,
    `<style>${EXPORT_CSS}</style>`,
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>'
  ].join('\n');
}

/** Minimal HTML escaping for attribute/text insertion. */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Return the clean rendered body HTML from an editor. */
function cleanBody(editor) {
  return editor.getRenderedHTML({ cleanHTML: true }) || '';
}

/** Full standalone HTML export (self-contained, inlined CSS). */
export function exportHTML(editor, title) {
  const t = title || '导出文档';
  return standaloneHTML(t, cleanBody(editor));
}

/**
 * WeChat / rich-editor friendly export. WeChat strips <head>/<style>; we inline
 * critical styles onto elements and keep the bare body markup.
 */
export function exportWeChat(editor) {
  const body = cleanBody(editor);
  const container = document.createElement('div');
  container.innerHTML = body;

  // Inline font/line-height on a wrapping block (WeChat keeps these).
  container.querySelectorAll('*').forEach((el) => {
    const s = el.style;
    if (el.tagName === 'PRE') {
      s.backgroundColor = '#f6f8fa';
      s.padding = '12px 14px';
      s.borderRadius = '6px';
      s.fontSize = '14px';
      s.lineHeight = '1.5';
      s.fontFamily = 'Menlo, Consolas, monospace';
    } else if (el.tagName === 'CODE') {
      s.backgroundColor = '#f6f8fa';
      s.borderRadius = '4px';
      s.padding = '1px 5px';
      s.fontFamily = 'Menlo, Consolas, monospace';
    } else if (el.tagName === 'BLOCKQUOTE') {
      s.borderLeft = '3px solid #d0d7de';
      s.padding = '0 0 0 12px';
      s.margin = '0';
      s.color = '#57606a';
    } else if (/^H[1-6]$/.test(el.tagName)) {
      s.fontWeight = 'bold';
      s.margin = '1em 0 .5em';
      s.lineHeight = '1.4';
    }
  });
  return container.innerHTML;
}

/** Zhihu-compatible export (Superscript/subscript-ish set handling + standard tags). */
export function exportZhihu(editor) {
  const body = cleanBody(editor)
    // Convert markdown-style strikethrough the core already renders as <del>? keep as <del>
    .replace(/<del(?:\s|>)/g, '<del$1');
  const container = document.createElement('div');
  container.innerHTML = body;

  // Zhihu publishes content best with simple structural tags; inline basic styles.
  container.querySelectorAll('pre').forEach((el) => {
    el.style.backgroundColor = 'transparent';
    el.style.padding = '0';
    el.style.fontFamily = 'Menlo, Consolas, monospace';
  });
  container.querySelectorAll('a').forEach((a) => a.setAttribute('rel', 'nofollow noopener'));
  return container.innerHTML;
}

/**
 * Export as PDF by opening the print dialog with a focused print-only body.
 * The browser's "Save as PDF" then captures a styled document.
 */
export function exportPDF(editor, title) {
  const t = title || '导出文档';
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    // popup blocked -> fallback: print this document directly
    window.print();
    return;
  }
  win.document.write('');
  win.document.write('<html lang="zh-CN"><head><meta charset="utf-8">');
  win.document.write(`<title>${escapeHtml(t)}</title>`);
  win.document.write(`<style>${EXPORT_CSS} @page{margin:2cm;} body{max-width:none;}</style>`);
  win.document.write('</head><body>');
  win.document.write(cleanBody(editor));
  win.document.write('</body></html>');
  win.document.close();
  win.focus();
  win.print();
}