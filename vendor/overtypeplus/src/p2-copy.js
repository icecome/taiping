/**
 * p2-copy.js - P2 input conversion: paste HTML -> Markdown (zero-dependency).
 *
 * Two parts:
 * 1. htmlToMarkdown(html): converts an HTML string to Markdown using a fresh
 *    DOM, walking block and inline elements in source order.
 * 2. installPasteHTML(editor): listens for paste with text/html and inserts the
 *    converted Markdown at the caret (only when options.pasteHTML is enabled).
 */

/** Recursively convert a DOM node's content to Markdown text. */
function nodeToMd(node, out) {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.textContent;
    // Collapse runs of whitespace to a single space, keeping it inline-friendly
    out.push(t.replace(/\s+/g, ' '));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node;
  const tag = el.tagName.toLowerCase();
  // Skip hidden elements
  if (el.hidden) return;

  switch (tag) {
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
      const level = Number(tag[1]);
      out.push(`\n\n${'#'.repeat(level)} `);
      nodeToMdChildren(el, out);
      out.push('\n');
      break;
    }
    case 'p':
      out.push('\n\n');
      nodeToMdChildren(el, out);
      out.push('\n');
      break;
    case 'br':
      out.push('  \n');
      break;
    case 'hr':
      out.push('\n\n---\n');
      break;
    case 'strong': case 'b':
      out.push('**');
      nodeToMdChildren(el, out);
      out.push('**');
      break;
    case 'em': case 'i':
      out.push('*');
      nodeToMdChildren(el, out);
      out.push('*');
      break;
    case 's': case 'del': case 'strike':
      out.push('~~');
      nodeToMdChildren(el, out);
      out.push('~~');
      break;
    case 'code':
      out.push('`');
      nodeToMdChildren(el, out);
      out.push('`');
      break;
    case 'a': {
      const href = el.getAttribute('href') || '';
      out.push('[');
      nodeToMdChildren(el, out);
      out.push(`](${href})`);
      break;
    }
    case 'img': {
      const src = el.getAttribute('src') || '';
      const alt = el.getAttribute('alt') || '';
      out.push(`![${alt}](${src})`);
      break;
    }
    case 'ul':
    case 'ol': {
      out.push('\n\n');
      listToMd(el, tag === 'ol', out);
      out.push('\n');
      break;
    }
    case 'blockquote': {
      out.push('\n\n');
      const inner = [];
      nodeToMdChildren(el, inner);
      const text = inner.join('').replace(/^\s+|\s+$/g, '');
      text.split('\n').forEach((line) => out.push(`> ${line}\n`));
      break;
    }
    case 'pre': {
      out.push('\n\n```\n');
      // Inside pre, use raw text (do not recurse inline render)
      out.push(el.textContent.replace(/^\n+|\n+$/g, ''));
      out.push('\n```\n');
      break;
    }
    case 'table': {
      out.push('\n\n');
      tableToMd(el, out);
      out.push('\n');
      break;
    }
    default:
      nodeToMdChildren(el, out);
  }
}

function nodeToMdChildren(el, out) {
  for (const child of el.childNodes) nodeToMd(child, out);
}

/** Convert a <ul>/<ol> to Markdown preserving nesting. */
function listToMd(listEl, ordered, out, depth = 0) {
  const items = Array.from(listEl.children).filter((c) => c.tagName === 'LI');
  items.forEach((li, i) => {
    const indent = '  '.repeat(depth);
    const prefix = ordered ? `${i + 1}. ` : '- ';
    out.push(`${indent}${prefix}`);
    // Inline content first, then nested lists
    const inline = [];
    let nested = null;
    for (const child of li.childNodes) {
      if (child.nodeType === 1 && /^(UL|OL)$/.test(child.tagName)) { nested = child; continue; }
      nodeToMd(child, inline);
    }
    out.push(inline.join('').trim());
    out.push('\n');
    if (nested) listToMd(nested, nested.tagName === 'OL', out, depth + 1);
  });
}

/** Convert a <table> to a GFM pipe table (best-effort). */
function tableToMd(tableEl, out) {
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  if (!rows.length) return;
  const parseRow = (tr) => Array.from(tr.children).map((c) => c.textContent.replace(/\s+/g, ' ').trim());
  const header = parseRow(rows[0]);
  out.push('| ' + header.join(' | ') + ' |\n');
  out.push('| ' + header.map(() => '---').join(' | ') + ' |\n');
  rows.slice(1).forEach((tr) => {
    const cells = parseRow(tr);
    out.push('| ' + cells.join(' | ') + ' |\n');
  });
}

/**
 * Convert an HTML string to Markdown.
 * @param {string} html
 * @returns {string}
 */
export function htmlToMarkdown(html) {
  if (typeof document === 'undefined') return html;
  if (!html || typeof html !== 'string') return '';
  const container = document.createElement('div');
  container.innerHTML = html;
  const out = [];
  for (const child of Array.from(container.childNodes)) nodeToMd(child, out);
  return out.join('')
    // tidy: collapse >2 consecutive blank lines
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

/**
 * Install paste-to-markdown on an editor's textarea.
 * Listens for text/html pastes and inserts converted Markdown at the caret.
 * @param {object} editor - OverType instance
 */
export function installPasteHTML(editor) {
  const ta = editor.textarea;
  if (!ta) return () => {};
  const handler = (e) => {
    const data = e.clipboardData;
    if (!data) return;
    const html = data.getData('text/html');
    if (!html) return; // plain-text paste: let default behavior proceed
    e.preventDefault();
    const md = htmlToMarkdown(html);
    editor.insertAtCursor(md);
  };
  ta.addEventListener('paste', handler);
  return () => ta.removeEventListener('paste', handler);
}