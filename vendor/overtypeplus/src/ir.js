/**
 * IRRenderer - Instant-render (block-level WYSIWYG) mode for OverType
 *
 * Strategy:
 * - The document is split into blocks (heading / paragraph / list / quote / code / empty)
 * - The block containing the caret keeps showing raw markdown source and reuses the
 *   overlay alignment technique (transparent textarea over styled preview, block-scoped)
 * - All other blocks are rendered as rich text (syntax markers hidden, proportional font)
 * - The textarea value always holds the source of the ACTIVE block only; the full
 *   document source is kept in `this.value` and rebuilt on every committed change
 */
import { MarkdownParser } from './parser.js';

const FENCE_RE = /^```/;
const HEADING_RE = /^#{1,3}\s/;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/;
const LIST_RE = /^(\s*)([-*+]|\d+\.)\s/;
const QUOTE_RE = /^>/;

function isSpecialStart(line) {
  return HEADING_RE.test(line) || HR_RE.test(line) ||
    LIST_RE.test(line) || QUOTE_RE.test(line) || FENCE_RE.test(line);
}

/**
 * Split markdown source into consecutive blocks.
 * Each block: { text, type, start } (start = char offset in full text, blocks joined by '\n')
 * @param {string} text
 * @returns {Array}
 */
export function splitBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  const n = lines.length;
  let i = 0;

  while (i < n) {
    const line = lines[i];

    if (FENCE_RE.test(line)) {
      // Code block: from opening fence to closing fence (or EOF)
      let j = i + 1;
      while (j < n && !FENCE_RE.test(lines[j])) j++;
      if (j < n) j++;
      blocks.push({ lines: lines.slice(i, j), type: 'code' });
      i = j;
    } else if (line.trim() === '') {
      // Empty block: one per blank line (keeps "\n\n" boundaries addressable)
      blocks.push({ lines: [line], type: 'empty' });
      i++;
    } else if (HEADING_RE.test(line)) {
      blocks.push({ lines: [line], type: 'heading' });
      i++;
    } else if (HR_RE.test(line)) {
      blocks.push({ lines: [line], type: 'hr' });
      i++;
    } else if (LIST_RE.test(line)) {
      // List block: consecutive list lines plus indented continuation lines
      let j = i + 1;
      while (j < n && lines[j].trim() !== '' &&
        (LIST_RE.test(lines[j]) || !isSpecialStart(lines[j]))) j++;
      blocks.push({ lines: lines.slice(i, j), type: 'list' });
      i = j;
    } else if (QUOTE_RE.test(line)) {
      let j = i + 1;
      while (j < n && QUOTE_RE.test(lines[j])) j++;
      blocks.push({ lines: lines.slice(i, j), type: 'quote' });
      i = j;
    } else {
      // Paragraph: consecutive plain lines until blank/special line
      let j = i + 1;
      while (j < n && lines[j].trim() !== '' && !isSpecialStart(lines[j])) j++;
      blocks.push({ lines: lines.slice(i, j), type: 'paragraph' });
      i = j;
    }
  }

  if (blocks.length === 0) {
    blocks.push({ lines: [''], type: 'paragraph' });
  }

  // Materialize text/start
  let acc = 0;
  for (const b of blocks) {
    b.text = b.lines.join('\n');
    b.start = acc;
    acc += b.text.length + 1;
  }
  return blocks;
}

/**
 * Build a character-level alignment between the rendered block DOM and its source text.
 * The parser preserves character order, so walking text nodes in document order yields
 * the same character sequence as the source (modulo HTML entities and blank-line nbsp).
 * Returns { chars: [{ch, visible, src}], textNodeStarts: Map<Node, number> } where
 * `src` is the source index of each DOM char (-1 when no source counterpart) and
 * `visible` is false for chars inside .syntax-marker spans.
 * @param {string} sourceText
 * @param {Element} renderedEl
 */
function buildRenderMap(sourceText, renderedEl) {
  const chars = [];
  const textNodeStarts = new Map();

  (function walk(node, inMarker) {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        textNodeStarts.set(child, chars.length);
        for (const ch of child.textContent) {
          chars.push({ ch, visible: !inMarker, src: -1 });
        }
      } else if (child.nodeType === 1) {
        const isMarker = inMarker ||
          (child.classList && child.classList.contains('syntax-marker'));
        walk(child, isMarker);
      }
    }
  })(renderedEl, false);

  // Align DOM char stream with source char stream (tolerant two-pointer).
  // Skipped when sourceText is null (caller only needs textNodeStarts).
  if (sourceText == null) return { chars, textNodeStarts };
  const src = sourceText;
  let s = 0;
  let d = 0;
  const len = chars.length;
  while (d < len && s < src.length) {
    const dc = chars[d].ch;
    const sc = src[s];
    const eq = dc === sc ||
      (dc === '\u00A0' && sc === ' ') || (dc === ' ' && sc === '\u00A0');
    if (eq) {
      chars[d].src = s;
      d++; s++;
      continue;
    }
    // DOM has extra chars (e.g. blank-line nbsp): skip up to 3 DOM chars
    let k = d + 1;
    let skipped = 0;
    while (k < len && skipped < 3) {
      const kc = chars[k].ch;
      if (kc === sc || (kc === '\u00A0' && sc === ' ')) break;
      k++; skipped++;
    }
    if (skipped < 3 && k < len) {
      d = k;
      chars[d].src = s;
      d++; s++;
    } else {
      // No DOM match: advance source pointer and retry current DOM char
      s++;
    }
  }
  return { chars, textNodeStarts };
}

/**
 * IRRenderer class. One instance per OverType editor, created lazily on
 * showInstantRenderMode() and reused across mode switches.
 */
export class IRRenderer {
  constructor(editor) {
    this.editor = editor;
    this.value = '';
    this.blocks = [];
    this.activeIndex = -1;
    this.container = null;
    this._activeOverlay = null;
    this._boundMouseDown = this._onMouseDown.bind(this);
    this._boundClick = this._onClick.bind(this);
  }

  get isMode() {
    return this.editor.container &&
      this.editor.container.dataset.mode === 'ir' &&
      this.container;
  }

  /** Enter IR mode: build block container, move textarea into the initial active block */
  activate() {
    if (this.isMode) return;
    this.value = this.editor.textarea.value;
    this.blocks = splitBlocks(this.value);
    this.activeIndex = -1;

    const wrapper = this.editor.wrapper;
    this.container = document.createElement('div');
    this.container.className = 'overtype-ir-container';
    this.container.addEventListener('mousedown', this._boundMouseDown);
    this.container.addEventListener('click', this._boundClick);
    wrapper.appendChild(this.container);

    this.renderDiff();
    // Start editing in the last block, caret at end
    this.activateBlock(this.blocks.length - 1, null);
  }

  /** Leave IR mode: commit value and restore textarea/preview to their normal places */
  deactivate() {
    if (!this.container) return;
    this.commitActive();
    const wrapper = this.editor.wrapper;
    const editor = this.editor;
    // Restore DOM order: textarea, preview, placeholder
    wrapper.insertBefore(editor.textarea, editor.preview);
    editor.textarea.value = this.value;
    this.container.removeEventListener('mousedown', this._boundMouseDown);
    this.container.removeEventListener('click', this._boundClick);
    this.container.remove();
    this.container = null;
    this._activeOverlay = null;
    this.activeIndex = -1;
  }

  /** Commit the active block textarea content back into the full document value */
  commitActive() {
    if (this.activeIndex < 0 || !this.blocks[this.activeIndex]) return;
    const b = this.blocks[this.activeIndex];
    const t = this.editor.textarea.value;
    if (t !== b.text) {
      b.text = t;
      b.lines = t.split('\n');
      this._recomputeStarts();
      this.value = this._blocksToText();
    }
  }

  getValue() {
    this.commitActive();
    return this.value;
  }

  setValue(text) {
    this.value = text;
    this.blocks = splitBlocks(text);
    this.activeIndex = -1;
    this.renderDiff();
    // Programmatic set: relocate caret without stealing focus
    this.activateBlock(this.blocks.length - 1, null, false);
    this._updatePlaceholder();
  }

  handleInput(event) {
    // During IME composition only refresh the overlay preview - never touch
    // textarea.value or block boundaries, or composition gets broken
    if (event && (event.isComposing || event.inputType === 'insertCompositionText')) {
      this.updateActiveOverlay();
      return;
    }

    const ta = this.editor.textarea;
    const newText = ta.value;
    const oldBlock = this.blocks[this.activeIndex];

    // Fast path: plain typing inside the active block that cannot change
    // block boundaries (no blank line / special-start line introduced, first
    // line shape unchanged). Skip the full re-split; the invariant
    // "blocks joined == document" still holds since only this block changed.
    if (oldBlock && oldBlock.type !== 'empty') {
      const newLines = newText.split('\n');
      let structural = false;
      for (let k = 1; k < newLines.length; k++) {
        const l = newLines[k];
        if (l.trim() === '' || isSpecialStart(l)) { structural = true; break; }
      }
      const firstSpecial = isSpecialStart(newLines[0] || '');
      const oldFirstSpecial = isSpecialStart(oldBlock.lines[0] || '');
      if (structural || firstSpecial !== oldFirstSpecial) {
        // fall through to slow path
      } else {
        oldBlock.text = newText;
        oldBlock.lines = newLines;
        this._recomputeStarts();
        this.value = this._blocksToText();
        this.renderDiff();
        this._updatePlaceholder();
        return;
      }
    }

    const oldIdx = this.activeIndex;
    const oldStart = oldIdx >= 0 ? this.blocks[oldIdx].start : 0;
    const sel = ta.selectionStart;

    this.commitActive();
    this.blocks = splitBlocks(this.value);

    // Approximate full-document caret offset (valid for edits at/behind the caret)
    const caretFull = oldStart + sel;

    // Locate the block containing the caret
    let idx = this.blocks.length - 1;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      if (caretFull >= b.start && caretFull <= b.start + b.text.length) {
        idx = i;
        break;
      }
    }

    if (idx === oldIdx && this.blocks[idx] &&
        this.blocks[idx].text === this.editor.textarea.value) {
      // Block boundaries unchanged - just refresh overlay and diff siblings
      this.updateActiveOverlay();
      this.renderDiff();
      return;
    }

    // Block boundaries changed (Enter split, paste, merge...) - relocate active block
    this.activeIndex = -1;
    this.renderDiff();
    this.activateBlock(idx, caretFull - (this.blocks[idx] ? this.blocks[idx].start : 0));
    this._updatePlaceholder();
  }

  /**
   * IR-specific key handling: block-level Enter, Backspace merge, cross-block arrows.
   * Returns true when the event is fully handled.
   */
  handleKeydown(event) {
    const ta = this.editor.textarea;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const collapsed = s === e;
    // Current line list check (cheaper and safer than full list context)
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    const inList = LIST_RE.test(value.slice(lineStart));

    // Enter: create a new block ("\n\n"). Lists and code blocks keep native "\n".
    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      const activeType = this.blocks[this.activeIndex]?.type;
      if (inList || activeType === 'code') return false;
      event.preventDefault();
      this.editor.insertAtCursor('\n\n');
      return true;
    }

    if (!collapsed) return false;

    if (event.key === 'Backspace' && s === 0 && this.activeIndex > 0) {
      event.preventDefault();
      this.mergeWithPrevious();
      return true;
    }
    if (event.key === 'ArrowLeft' && s === 0 && this.activeIndex > 0) {
      event.preventDefault();
      const prev = this.activeIndex - 1;
      this.activateBlock(prev, this.blocks[prev].text.length);
      return true;
    }
    if (event.key === 'ArrowRight' && s === value.length &&
        this.activeIndex < this.blocks.length - 1) {
      event.preventDefault();
      this.activateBlock(this.activeIndex + 1, 0);
      return true;
    }
    if (event.key === 'ArrowUp' && !value.slice(0, s).includes('\n') && this.activeIndex > 0) {
      event.preventDefault();
      const prev = this.activeIndex - 1;
      this.activateBlock(prev, this.blocks[prev].text.length);
      return true;
    }
    if (event.key === 'ArrowDown' && !value.slice(s).includes('\n') &&
        this.activeIndex < this.blocks.length - 1) {
      event.preventDefault();
      this.activateBlock(this.activeIndex + 1, 0);
      return true;
    }
    return false;
  }

  /** Merge the active block into the previous one (removes the block boundary newline) */
  mergeWithPrevious() {
    this.commitActive();
    const a = this.activeIndex;
    if (a <= 0) return;
    const prev = this.blocks[a - 1];
    const cur = this.blocks[a];
    const caret = prev.text.length;
    const merged = { text: prev.text + cur.text, type: prev.type, start: prev.start };
    merged.lines = merged.text.split('\n');
    this.blocks.splice(a - 1, 2, merged);
    this.value = this._blocksToText();
    this.activeIndex = -1;
    this.renderDiff();
    this.activateBlock(a - 1, caret);
    this._updatePlaceholder();
  }

  /**
   * Activate a block: render its source in the textarea overlay and focus it.
   * @param {number} idx - block index
   * @param {number|null} domOffset - click offset in the rendered DOM (visible text), or null for end-of-block
   * @param {boolean} [focus=true] - focus the textarea and scroll it into view; false for programmatic calls
   */
  activateBlock(idx, domOffset, focus = true) {
    if (idx < 0 || idx >= this.blocks.length) return;
    this.commitActive();
    const b = this.blocks[idx];

    let srcCaret = null;
    if (domOffset != null && this.container && this.container.children[idx]) {
      srcCaret = this._mapDomOffsetToSource(b.text, this.container.children[idx], domOffset);
    }
    if (srcCaret == null || srcCaret < 0) srcCaret = b.text.length;
    srcCaret = Math.min(srcCaret, b.text.length);

    // Sync the textarea BEFORE switching activeIndex: renderDiff triggers
    // _updatePlaceholder -> getValue -> commitActive, which would otherwise
    // commit the previous block's textarea content into the new block.
    const ta = this.editor.textarea;
    ta.value = b.text;

    this.activeIndex = idx;
    this.renderDiff();

    if (focus) {
      ta.focus();
    }
    ta.setSelectionRange(srcCaret, srcCaret);

    if (focus) {
      const el = this.container.children[idx];
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
    this._updatePlaceholder();
  }

  /** Refresh the overlay preview of the active block (source-style rendering) */
  updateActiveOverlay() {
    if (!this._activeOverlay || this.activeIndex < 0) return;
    const html = MarkdownParser.parse(
      this.editor.textarea.value, -1, false,
      this.editor.options.codeHighlighter, false
    );
    this._activeOverlay.innerHTML = html;
    this._applyCodeBackgrounds(this._activeOverlay);
  }

  /** Full diff render of all blocks against the current DOM */
  renderDiff() {
    if (!this.container) return;

    // Keep active block in sync with textarea (deferred caret block changes)
    const children = Array.from(this.container.children);

    // Remove extra blocks
    while (children.length > this.blocks.length) {
      const c = children.pop();
      if (c && c !== this.editor.textarea) c.remove();
    }

    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const isActive = i === this.activeIndex;
      let el = children[i];
      const elActive = el && el.classList.contains('active');

      // The active block's element already holds the focused textarea;
      // rebuilding would detach it and drop focus/caret. Refresh in place.
      if (isActive && elActive) {
        el.dataset.blockIndex = String(i);
        el.dataset.hash = b.text;
        this.updateActiveOverlay();
        continue;
      }

      const unchanged = el && el.dataset.hash === b.text && elActive === isActive;

      if (unchanged) {
        el.dataset.blockIndex = String(i);
        continue;
      }

      const newEl = this._createBlockEl(b, isActive, i);
      if (el) {
        this.container.replaceChild(newEl, el);
      } else {
        this.container.appendChild(newEl);
      }
      children[i] = newEl;
    }
    this._updatePlaceholder();
  }

  /** Render entry point used by editor.updatePreview() in IR mode */
  render() {
    if (!this.container) return;
    // If textarea is focused, keep the active block following the caret
    if (document.activeElement === this.editor.textarea && this.activeIndex >= 0) {
      const b = this.blocks[this.activeIndex];
      if (b && b.text === this.editor.textarea.value) {
        this.updateActiveOverlay();
        this.renderDiff();
        return;
      }
    }
    this.renderDiff();
  }

  // ===== internals =====

  _createBlockEl(block, isActive, index) {
    const el = document.createElement('div');
    el.className = 'overtype-ir-block' + (isActive ? ' active' : '');
    el.dataset.blockIndex = String(index);
    el.dataset.hash = block.text;
    el.dataset.type = block.type;

    if (isActive) {
      const preview = document.createElement('div');
      preview.className = 'overtype-ir-block-preview overtype-preview';
      preview.setAttribute('aria-hidden', 'true');
      el.appendChild(preview);
      el.appendChild(this.editor.textarea);
      this._activeOverlay = preview;
      this.updateActiveOverlay();
    } else {
      el.innerHTML = MarkdownParser.parse(
        block.text, -1, false, this.editor.options.codeHighlighter, true
      );
      this._applyCodeBackgrounds(el);
    }
    return el;
  }

  _applyCodeBackgrounds(scope) {
    // Mirrors OverType._applyCodeBlockBackgrounds but scoped to a block element
    const fences = scope.querySelectorAll('.code-fence');
    for (let i = 0; i < fences.length - 1; i += 2) {
      const openFence = fences[i];
      const closeFence = fences[i + 1];
      const openParent = openFence.parentElement;
      const closeParent = closeFence.parentElement;
      if (!openParent || !closeParent) continue;
      openFence.style.display = 'block';
      closeFence.style.display = 'block';
      openParent.classList.add('code-block-line');
      closeParent.classList.add('code-block-line');
    }
  }

  _onMouseDown(event) {
    if (event.button !== 0) return;
    const blockEl = event.target.closest('.overtype-ir-block');
    if (!blockEl || blockEl.classList.contains('active')) return;
    // Allow Cmd/Ctrl+Click on links in rendered blocks
    if ((event.metaKey || event.ctrlKey) && event.target.closest('a')) return;
    event.preventDefault();
    const idx = Number(blockEl.dataset.blockIndex);
    if (Number.isNaN(idx)) return;
    const domOffset = this._getCaretDomOffset(event, blockEl);
    this.activateBlock(idx, domOffset);
  }

  /** Handle plain clicks on links inside rendered blocks.
   *  Mouse clicks are normally preceded by mousedown (which activates the
   *  block first), but keyboard-triggered clicks (Enter on a focused link)
   *  arrive without mousedown - so the guard below is NOT unreachable. */
  _onClick(event) {
    const blockEl = event.target.closest('.overtype-ir-block');
    if (!blockEl || blockEl.classList.contains('active')) return;
    if ((event.metaKey || event.ctrlKey) && event.target.closest('a')) return;
    if (event.target.closest('a')) event.preventDefault();
  }

  /** Get the clicked caret offset within the block's DOM char stream */
  _getCaretDomOffset(event, blockEl) {
    let node = null;
    let nodeOffset = 0;
    if (typeof document.caretRangeFromPoint === 'function') {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (range) { node = range.startContainer; nodeOffset = range.startOffset; }
    } else if (typeof document.caretPositionFromPoint === 'function') {
      const pos = document.caretPositionFromPoint(event.clientX, event.clientY);
      if (pos) { node = pos.offsetNode; nodeOffset = pos.offset; }
    }
    if (!node) return null;

    // Only text-node offsets are needed here; null skips source alignment
    const { textNodeStarts } = buildRenderMap(null, blockEl);
    // buildRenderMap walks all text nodes; find the start of the clicked node
    if (node.nodeType === 3) {
      const start = textNodeStarts.get(node);
      return start == null ? null : start + nodeOffset;
    }
    // Element node: place caret at the start of the following text
    const starts = Array.from(textNodeStarts.values());
    return starts.length ? Math.min(...starts) : null;
  }

  /** Map a DOM char offset to a source caret offset using the render map */
  _mapDomOffsetToSource(sourceText, blockEl, domOffset) {
    const { chars } = buildRenderMap(sourceText, blockEl);
    let g = Math.min(domOffset, chars.length);
    // Walk back to the nearest visible char with a source mapping
    while (g >= 0) {
      const c = chars[g];
      if (c && c.visible && c.src >= 0) {
        // Caret sits right after the clicked visible character
        return c.src + 1;
      }
      if (c && !c.visible && g > 0) {
        // Clicked inside a marker: snap before the marker
        let k = g;
        while (k >= 0 && !chars[k].visible) k--;
        if (k >= 0 && chars[k].src >= 0) return chars[k].src + 1;
        return 0;
      }
      g--;
    }
    return 0;
  }

  _recomputeStarts() {
    let acc = 0;
    for (const b of this.blocks) {
      b.start = acc;
      acc += b.text.length + 1;
    }
  }

  _blocksToText() {
    return this.blocks.map(b => b.text).join('\n');
  }

  _updatePlaceholder() {
    const p = this.editor.placeholderEl;
    if (p) p.style.display = this.getValue() ? 'none' : '';
  }
}
