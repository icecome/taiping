/**
 * p1-render.js - Professional rendering (P1): KaTeX math, Mermaid diagrams,
 * Graphviz (dot). Heavy renderers are CDN-loaded on demand via deps.js.
 *
 * Integrated through the editor's onRender hook, which fires in normal and
 * preview modes only (IR mode short-circuits in updatePreview), so IR's
 * alignment mechanism is never touched.
 *
 * Block-language detection operates on the parser's fenced-code output:
 *   <pre class="code-block"><code class="language-mermaid">...</code></pre>
 */

import { loadKaTeX, loadMermaid, loadViz } from './deps.js';

// $$...$$ block math, $$ inline math (skip bare-number currency like "$5")
const BLOCK_MATH_RE = /\$\$([\s\S]+?)\$\$/g;
const INLINE_MATH_RE = /\$([^$\n]+?)\$/g;

/** Render professional blocks inside a preview DOM (fire-and-forget). */
export function renderProfessional(preview, config = {}) {
  if (!preview) return;
  const cfg = config.professional || config;
  if (cfg.math) renderMath(preview);
  if (cfg.mermaid) renderMermaid(preview, cfg);
  if (cfg.graphviz) renderGraphviz(preview);
}

// ===== KaTeX math =====

// Sync helpers exported for offline unit tests (katex injected directly).
export function renderBlockMath(el, katex) {
  // Only act when the entire element content is a single $$...$$ expression.
  const t = el.textContent || '';
  const m = BLOCK_MATH_RE.exec(t);
  const ok = m && BLOCK_MATH_RE.lastIndex >= t.trimEnd().length;
  BLOCK_MATH_RE.lastIndex = 0;
  if (!ok) return;
  try {
    el.innerHTML = katex.renderToString(m[1], { displayMode: true, throwOnError: false });
  } catch { /* keep raw source */ }
}

function replaceInlineInText(textNode, katex) {
  const parts = [];
  let last = 0;
  const text = textNode.nodeValue;
  INLINE_MATH_RE.lastIndex = 0;
  let m;
  while ((m = INLINE_MATH_RE.exec(text)) !== null) {
    const expr = m[1].trim();
    // Skip currency-like "$5" with no letters
    if (!/[A-Za-z\\{}_^]/.test(expr)) continue;
    if (m.index > last) parts.push(document.createTextNode(text.slice(last, m.index)));
    try {
      const span = document.createElement('span');
      span.innerHTML = katex.renderToString(expr, { throwOnError: false });
      parts.push(span);
    } catch {
      parts.push(document.createTextNode(m[0]));
    }
    last = m.index + m[0].length;
  }
  if (parts.length === 0) return;
  if (last < text.length) parts.push(document.createTextNode(text.slice(last)));
  const frag = document.createDocumentFragment();
  parts.forEach((p) => frag.appendChild(p));
  textNode.parentNode.replaceChild(frag, textNode);
}

async function renderMath(preview) {
  try {
    await loadKaTeX();
  } catch { return; }
  const katex = globalThis.katex;
  if (!katex) return;

  // Block math: scan block-level elements, replace entire text with display math.
  preview.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6').forEach((el) => {
    if (el.querySelector('code, .code-block, pre')) return;
    if (el.childElementCount > 0) walkInlineText(el, katex);
    else renderBlockMath(el, katex);
  });

  // Inline math inside text-bearing leaf blocks.
  walkInlineText(preview, katex);
}

function walkInlineText(root, katex) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (!node.nodeValue || node.nodeValue.indexOf('$') === -1) return;
    if (node.parentElement && node.parentElement.closest('code, pre')) return;
    replaceInlineInText(node, katex);
  });
}

// ===== Mermaid =====

async function renderMermaid(preview, cfg) {
  const blocks = Array.from(preview.querySelectorAll('pre.code-block code.language-mermaid'));
  if (blocks.length === 0) return;
  try {
    await loadMermaid();
  } catch { return; }
  const mermaid = globalThis.mermaid;
  if (!mermaid) return;

  let init = false;
  for (const code of blocks) {
    const pre = code.closest('pre.code-block');
    if (!pre) continue;
    const source = (code.textContent || '').trim();
    if (!source) continue;

    const holder = document.createElement('div');
    holder.className = 'ow-mermaid';
    holder.textContent = source;
    pre.replaceWith(holder);

    if (!init) {
      mermaid.initialize({ startOnLoad: false, theme: (cfg.mermaidTheme || 'default') });
      init = true;
    }
    try {
      const { svg } = await mermaid.render('mmd' + Math.random().toString(36).slice(2, 8), source);
      holder.innerHTML = svg;
    } catch { /* keep raw source fallback */ }
  }
}

// ===== Graphviz (dot) =====

async function renderGraphviz(preview) {
  const blocks = Array.from(preview.querySelectorAll(
    'pre.code-block code.language-graphviz, pre.code-block code.language-dot'
  ));
  if (blocks.length === 0) return;
  try {
    await loadViz();
  } catch { return; }
  const Viz = globalThis.Viz || globalThis.viz;
  if (!Viz) return;

  for (const code of blocks) {
    const pre = code.closest('pre.code-block');
    if (!pre) continue;
    const source = (code.textContent || '').trim();
    if (!source) continue;
    const holder = document.createElement('div');
    holder.className = 'ow-graphviz';
    pre.replaceWith(holder);
    try {
      const result = Viz(source);
      holder.innerHTML = typeof result === 'string' ? result : (result?.svg || '');
    } catch { /* keep raw source fallback */ }
  }
}