/**
 * OvertypeWindow - Full editing-window shell (VDitor-like) that wraps the
 * existing OverType overlay-alignment core without touching its layout.
 *
 * Layout:
 *   .overtype-window
 *     .ow-titlebar     (document title input + collapse toggle)
 *     .ow-toolbar      (reuses the core Toolbar, restyled for full width)
 *     .ow-body
 *       .ow-outline    (headings outline side panel, collapsible)
 *       .ow-editor     (mounts the core OverType instance)
 *       .ow-resizer    (draggable gutter between outline and editor)
 *     .ow-statusbar    (word/line count + current mode)
 *
 * The core instance is created against `.ow-editor`; all public OverType
 * methods are forwarded to it so callers interact with one uniform API.
 */
import { OverType } from './overtype.js';
import { p0Outline } from './p0-outline.js';
import { p0StatusBar } from './p0-statusbar.js';
import { p0Cache } from './p0-cache.js';
import { p0Copy } from './p0-copy.js';

export class OvertypeWindow {
  /**
   * @param {string|Element} el - target element (single)
   * @param {Object} options - OverType options; `medium` is consumed here
   */
  constructor(el, options = {}) {
    this.element = typeof el === 'string' ? document.querySelector(el) : el;
    if (!this.element) throw new Error('OvertypeWindow: target element not found');

    this.options = { ...options };
    this.core = null;
    this.outline = null;
    this.statusbar = null;
    this.cache = null;
    this.copy = null;

    // Options forwarded to the core (strip window-shell keys)
    const { medium, title, outlineLabel, autosave, codeCopy, ...coreOptions } = this.options;
    this.titleOption = title;
    this.outlineLabel = outlineLabel || '大纲';
    this.autosave = autosave || false;
    this.codeCopy = codeCopy || false;

    this._buildDOM();

    // Optional P0 features
    if (this.codeCopy) this.copy = p0Copy();
    if (this.autosave) {
      this.cache = p0Cache(
        { getValue: () => this.core.getValue(), setValue: (v) => this.core.setValue(v) },
        { key: autosave?.key, interval: autosave?.interval, restore: autosave?.restore }
      );
    }

    // Hook core callbacks to keep outline/statusbar fresh while keeping user hooks
    const userOnChange = coreOptions.onChange || null;
    const userOnRender = coreOptions.onRender || null;
    coreOptions.onChange = (val, inst) => {
      if (this.outline) this.outline.update(inst);
      if (this.statusbar) this.statusbar.update(inst);
      if (this.cache) this.cache.onEdit();
      if (userOnChange) userOnChange(val, inst);
    };
    coreOptions.onRender = (previewEl, mode, inst) => {
      if (this.outline) this.outline.update(inst);
      if (this.copy) this.copy.attach(inst.preview);
      if (userOnRender) userOnRender(previewEl, mode, inst);
    };

    this.core = new OverType(this.editorEl, coreOptions)[0];
    this._wireResizer();

    // Initial render of chrome once the core is ready
    requestAnimationFrame(() => {
      this._refreshOutline();
      if (this.statusbar) this.statusbar.update(this.core);
    });
  }

  /** Public: flush the autosave draft immediately */
  saveDraft() { if (this.cache) this.cache.save(); return this; }
  /** Public: clear the autosave draft */
  clearDraft() { if (this.cache) this.cache.clear(); return this; }

  /** Build the shell DOM (titlebar + body(outline|editor|resizer) + statusbar) */
  _buildDOM() {
    this.element.innerHTML = '';
    this.windowEl = document.createElement('div');
    this.windowEl.className = 'overtype-window';

    // Title bar
    this.titlebarEl = document.createElement('div');
    this.titlebarEl.className = 'ow-titlebar';
    this.titleInput = document.createElement('input');
    this.titleInput.className = 'ow-title-input';
    this.titleInput.type = 'text';
    this.titleInput.placeholder = '未命名文档';
    this.titleInput.value = this.titleOption ?? '';
    this.titleInput.setAttribute('aria-label', '文档标题');
    this.collapseBtn = document.createElement('button');
    this.collapseBtn.className = 'ow-collapse';
    this.collapseBtn.type = 'button';
    this.collapseBtn.setAttribute('aria-label', '收起/展开大纲');
    this.titlebarEl.appendChild(this.titleInput);
    this.titlebarEl.appendChild(this.collapseBtn);

    // Body
    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'ow-body';

    this.outlineEl = document.createElement('aside');
    this.outlineEl.className = 'ow-outline';

    this.editorEl = document.createElement('div');
    this.editorEl.className = 'ow-editor';

    this.resizerEl = document.createElement('div');
    this.resizerEl.className = 'ow-resizer';
    this.resizerEl.setAttribute('role', 'separator');
    this.resizerEl.setAttribute('aria-orientation', 'vertical');

    this.bodyEl.appendChild(this.outlineEl);
    this.bodyEl.appendChild(this.resizerEl);
    this.bodyEl.appendChild(this.editorEl);

    // Status bar
    this.statusbarEl = document.createElement('div');
    this.statusbarEl.className = 'ow-statusbar';

    this.windowEl.appendChild(this.titlebarEl);
    this.windowEl.appendChild(this.bodyEl);
    this.windowEl.appendChild(this.statusbarEl);
    this.element.appendChild(this.windowEl);

    // p0 modules
    this.outline = p0Outline(this.outlineEl, this.outlineLabel);
    this.statusbar = p0StatusBar(this.statusbarEl);
  }

  /** Wire the draggable outline/editor gutter */
  _wireResizer() {
    let dragging = false;
    this._onResizerDown = (e) => {
      dragging = true;
      this.outlineEl.style.flexBasis = this.outlineEl.getBoundingClientRect().width + 'px';
      document.body.classList.add('ow-resizing');
      e.preventDefault();
    };
    this._onResizerMove = (e) => {
      if (!dragging) return;
      const rect = this.bodyEl.getBoundingClientRect();
      let w = e.clientX - rect.left;
      const min = 140, max = rect.width - 200;
      w = Math.max(min, Math.min(max, w));
      this.outlineEl.style.flexBasis = w + 'px';
      this.outlineEl.style.flexGrow = '0';
    };
    this._onResizerUp = () => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('ow-resizing');
    };
    this.resizerEl.addEventListener('mousedown', this._onResizerDown);
    document.addEventListener('mousemove', this._onResizerMove);
    document.addEventListener('mouseup', this._onResizerUp);

    // Collapse toggle hides/shows the outline+resizer
    this.collapseBtn.addEventListener('click', () => {
      this.bodyEl.classList.toggle('ow-outline-collapsed');
    });
  }

  /** Refresh the outline from the current core preview DOM */
  _refreshOutline() {
    if (!this.outline || !this.core) return;
    this.outline.update(this.core);
  }

  // ===== Forwarded public API =====
  getValue() { return this.core.getValue(); }
  setValue(v) { this.core.setValue(v); this._refreshOutline(); return this; }
  get() { return this.getValue(); }
  set(v) { return this.setValue(v); }
  showNormalEditMode() { this.core.showNormalEditMode(); return this; }
  showPlainTextarea() { this.core.showPlainTextarea(); return this; }
  showPreviewMode() { this.core.showPreviewMode(); return this; }
  showInstantRenderMode() { this.core.showInstantRenderMode(); return this; }
  reinit(options = {}) { this.core.reinit(options); return this; }
  on(cb) { this.core.onChange = (v, inst) => cb(v, inst); return this; }

  // P2: forward render/export APIs to the core
  getRenderedHTML(options) { return this.core.getRenderedHTML(options); }
  getCleanHTML() { return this.core.getCleanHTML(); }
  exportHTML(title) { return this.core.exportHTML(title ?? this.titleInput.value); }
  exportWeChat() { return this.core.exportWeChat(); }
  exportZhihu() { return this.core.exportZhihu(); }
  exportPDF(title) { return this.core.exportPDF(title ?? this.titleInput.value); }

  get container() { return this.core.container; }
  get textarea() { return this.core.textarea; }

  /** Textarea focus is handled by core; expose for convenience */
  focus() { this.core.textarea.focus(); return this; }

  destroy() {
    this.resizerEl.removeEventListener('mousedown', this._onResizerDown);
    document.removeEventListener('mousemove', this._onResizerMove);
    document.removeEventListener('mouseup', this._onResizerUp);
    if (this.cache) this.cache.clear();
    if (this.core) this.core.destroy();
    if (this.windowEl && this.windowEl.parentNode) {
      this.windowEl.parentNode.removeChild(this.windowEl);
    }
    this.element.textContent = '';
  }
}