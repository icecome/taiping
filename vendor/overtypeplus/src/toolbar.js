/**
 * Toolbar component for OverType editor
 * Provides markdown formatting buttons with support for custom buttons
 */

import * as markdownActions from 'markdown-actions';
import { computePosition, autoUpdate, flip, offset, shift } from '@floating-ui/dom';
import { LANG_ZH, setLang as i18nSetLang, t } from './i18n.js';
import { moreToolbarButtons } from './toolbar-buttons.js';

const GROUP_ORDER = ['格式', '块', '插入', '杂项', '__none__'];

// 中文分组名 → i18n 字典键
const GROUP_KEY = {
  '格式': 'format',
  '块': 'block',
  '插入': 'insert',
  '杂项': 'misc'
};

export class Toolbar {
  constructor(editor, options = {}) {
    this.editor = editor;
    this.container = null;
    this.buttons = {};
    this.currentItemIndex = 0;
    this.handleDocumentClick = null;
    this.activeDropdown = null;
    this.activeDropdownButton = null;
    this.morePanel = null;
    this.moreCleanup = null;
    this.moreButtons = {};

    // Get toolbar buttons array
    this.toolbarButtons = options.toolbarButtons || [];

    // i18n: 实例级语种，缺省回退中文
    this.lang = this.editor.options?.lang || options.lang || LANG_ZH;
  }

  /**
   * Create and render toolbar
   */
  create() {
    this.container = document.createElement('div');
    this.container.className = 'overtype-toolbar';
    this.container.id = this.getInstanceElementId('toolbar');
    this.container.setAttribute('role', 'toolbar');
    this.container.setAttribute('aria-label', t('toolbar_label', this.lang));
    this.container.setAttribute('aria-controls', this.editor.textarea.id);

    // Create buttons from toolbarButtons array
    this.toolbarButtons.forEach(buttonConfig => {
      if (buttonConfig.name === 'separator') {
        const separator = this.createSeparator();
        this.container.appendChild(separator);
      } else {
        const button = this.createButton(buttonConfig);
        this.buttons[buttonConfig.name] = button;
        this.container.appendChild(button);
      }
    });

    this.setupRovingTabIndex();
    this.updateButtonStates();

    // Insert toolbar before the wrapper (as sibling, not child)
    this.editor.container.insertBefore(this.container, this.editor.wrapper);
  }

  /**
   * Build a stable id from the owning OverType instance
   */
  getInstanceElementId(name) {
    return `overtype-${this.editor.instanceId}-${name}`;
  }

  /**
   * Configure toolbar focus management per the ARIA toolbar pattern
   */
  setupRovingTabIndex() {
    const toolbarItems = this.getToolbarItems();

    if (toolbarItems.length === 0) {
      return;
    }

    this.currentItemIndex = this.getValidItemIndex(this.currentItemIndex);
    this.updateTabIndexes();

    this.container.addEventListener('keydown', (e) => {
      this.onToolbarKeydown(e);
    });

    this.container.addEventListener('focusin', (e) => {
      this.onToolbarFocusin(e);
    });
  }

  /**
   * Get toolbar buttons in DOM order for keyboard navigation
   */
  getToolbarItems() {
    if (!this.container) {
      return [];
    }

    return Array.from(this.container.querySelectorAll('.overtype-toolbar-button'));
  }

  /**
   * Handle keyboard navigation within the toolbar
   */
  onToolbarKeydown(e) {
    const toolbarItems = this.getToolbarItems();

    if (!toolbarItems.includes(e.target)) {
      return;
    }

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        this.focusItem(this.currentItemIndex + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.focusItem(this.currentItemIndex - 1);
        break;
      case 'Home':
        e.preventDefault();
        this.focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        this.focusItem(toolbarItems.length - 1);
        break;
    }
  }

  /**
   * Remember the focused toolbar item as the toolbar tab stop
   */
  onToolbarFocusin(e) {
    const focusedItemIndex = this.getToolbarItems().indexOf(e.target);

    if (focusedItemIndex === -1) {
      return;
    }

    this.currentItemIndex = focusedItemIndex;
    this.updateTabIndexes();
  }

  /**
   * Move focus to a toolbar item and make it the only tab stop
   */
  focusItem(index) {
    const toolbarItems = this.getToolbarItems();

    if (toolbarItems.length === 0) {
      return;
    }

    this.currentItemIndex = this.getValidItemIndex(index, toolbarItems);
    this.updateTabIndexes();
    toolbarItems[this.currentItemIndex].focus();
  }

  /**
   * Normalize toolbar item indexes with wrapping
   */
  getValidItemIndex(index, toolbarItems = this.getToolbarItems()) {
    const itemCount = toolbarItems.length;

    if (itemCount === 0) {
      return 0;
    }

    if (index < 0) {
      return itemCount - 1;
    }

    if (index >= itemCount) {
      return 0;
    }

    return index;
  }

  /**
   * Keep exactly one toolbar item in the page tab sequence
   */
  updateTabIndexes() {
    this.getToolbarItems().forEach((item, index) => {
      item.tabIndex = index === this.currentItemIndex ? 0 : -1;
    });
  }

  /**
   * Create a toolbar separator
   */
  createSeparator() {
    const separator = document.createElement('div');
    separator.className = 'overtype-toolbar-separator';
    separator.setAttribute('role', 'separator');
    return separator;
  }

  /**
   * Create a toolbar button
   */
  createButton(buttonConfig) {
    const button = document.createElement('button');
    button.className = 'overtype-toolbar-button';
    button.type = 'button';
    button.setAttribute('data-button', buttonConfig.name);
    const label = t(buttonConfig.title || buttonConfig.name, this.lang);
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = this.sanitizeSVG(buttonConfig.icon || '');

    // Special handling for viewMode dropdown
    if (buttonConfig.name === 'viewMode') {
      button.classList.add('has-dropdown');
      button.dataset.dropdown = 'true';
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-expanded', 'false');

      button._clickHandler = (e) => {
        e.preventDefault();
        this.toggleViewModeDropdown(button);
      };

      button._keydownHandler = (e) => {
        if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
          return;
        }

        e.preventDefault();
        const placement = e.key === 'ArrowUp' ? 'last' : 'current';
        this.openViewModeDropdown(button, placement);
      };

      button.addEventListener('click', button._clickHandler);
      button.addEventListener('keydown', button._keydownHandler);

      return button;
    }

    // Special handling for the "more" panel trigger button
    if (buttonConfig.name === 'more') {
      button.classList.add('has-dropdown');
      button.dataset.dropdown = 'true';
      button.setAttribute('aria-haspopup', 'true');
      button.setAttribute('aria-expanded', 'false');

      button._clickHandler = (e) => {
        e.preventDefault();
        this.toggleMorePanel(button);
      };

      button._keydownHandler = (e) => {
        if (!['ArrowDown', 'Enter', ' '].includes(e.key)) {
          return;
        }
        e.preventDefault();
        this.openMorePanel(button, 'current');
      };

      button.addEventListener('click', button._clickHandler);
      button.addEventListener('keydown', button._keydownHandler);

      return button;
    }

    // Standard button click handler - delegate to performAction
    button._clickHandler = (e) => {
      e.preventDefault();
      const actionId = buttonConfig.actionId || buttonConfig.name;
      this.editor.performAction(actionId, e);
    };

    button.addEventListener('click', button._clickHandler);
    return button;
  }

  /**
   * Handle button action programmatically
   * Accepts either an actionId string or a buttonConfig object (backwards compatible)
   * @param {string|Object} actionIdOrConfig - Action identifier string or button config object
   * @returns {Promise<boolean>} Whether the action was executed
   */
  async handleAction(actionIdOrConfig) {
    // Old style: buttonConfig object with .action function - execute directly
    if (actionIdOrConfig && typeof actionIdOrConfig === 'object' && typeof actionIdOrConfig.action === 'function') {
      this.editor.textarea.focus();
      try {
        await actionIdOrConfig.action({
          editor: this.editor,
          getValue: () => this.editor.getValue(),
          setValue: (value) => this.editor.setValue(value),
          event: null
        });
        return true;
      } catch (error) {
        console.error(`Action "${actionIdOrConfig.name}" error:`, error);
        this.editor.wrapper.dispatchEvent(new CustomEvent('button-error', {
          detail: { buttonName: actionIdOrConfig.name, error }
        }));
        return false;
      }
    }

    // New style: string actionId - delegate to performAction
    if (typeof actionIdOrConfig === 'string') {
      return this.editor.performAction(actionIdOrConfig, null);
    }

    return false;
  }

  /**
   * Sanitize SVG to prevent XSS
   */
  sanitizeSVG(svg) {
    if (typeof svg !== 'string') return '';

    // Remove script tags and on* event handlers
    const cleaned = svg
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\son\w+\s*=\s*[^\s>]*/gi, '');

    return cleaned;
  }

  /**
   * Toggle view mode dropdown (internal implementation)
   * Not exposed to users - viewMode button behavior is fixed
   */
  toggleViewModeDropdown(button) {
    if (this.activeDropdown) {
      this.closeViewModeDropdown(button);
      return;
    }

    this.openViewModeDropdown(button);
  }

  /**
   * Open the view mode dropdown
   */
  openViewModeDropdown(button, focusPlacement = null) {
    this.closeViewModeDropdown(button);

    button.classList.add('dropdown-active');

    const dropdown = this.createViewModeDropdown(button);

    // Position dropdown relative to button
    const rect = button.getBoundingClientRect();
    dropdown.style.position = 'absolute';
    dropdown.style.top = `${rect.bottom + 5}px`;
    dropdown.style.left = `${rect.left}px`;

    document.body.appendChild(dropdown);
    this.activeDropdown = dropdown;
    this.activeDropdownButton = button;
    button.setAttribute('aria-controls', dropdown.id);
    button.setAttribute('aria-expanded', 'true');

    // Click outside to close
    this.handleDocumentClick = (e) => {
      if (!dropdown.contains(e.target) && !button.contains(e.target)) {
        this.closeViewModeDropdown(button);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', this.handleDocumentClick);
    }, 0);

    if (focusPlacement) {
      this.focusViewModeMenuItem(dropdown, focusPlacement);
    }
  }

  /**
   * Close the view mode dropdown
   */
  closeViewModeDropdown(button = this.activeDropdownButton, returnFocus = false) {
    if (this.activeDropdown) {
      this.activeDropdown.remove();
      this.activeDropdown = null;
    }

    if (button) {
      button.classList.remove('dropdown-active');
      button.setAttribute('aria-expanded', 'false');
    }

    if (this.handleDocumentClick) {
      document.removeEventListener('click', this.handleDocumentClick);
      this.handleDocumentClick = null;
    }

    this.activeDropdownButton = null;

    if (returnFocus && button) {
      button.focus();
    }
  }

  /**
   * Create view mode dropdown menu (internal implementation)
   */
  createViewModeDropdown(button) {
    const dropdown = document.createElement('div');
    dropdown.className = 'overtype-dropdown-menu';
    dropdown.id = this.getInstanceElementId('toolbar-view-mode-menu');
    dropdown.setAttribute('role', 'menu');
    dropdown.setAttribute('aria-label', t('viewMode', this.lang));

    dropdown.addEventListener('keydown', (e) => {
      this.onViewModeMenuKeydown(e, button);
    });

    const items = [
      { id: 'normal', label: t('normal', this.lang), icon: '✓' },
      { id: 'ir', label: t('ir', this.lang), icon: '✓' }
    ];

    const currentMode = this.editor.container.dataset.mode || 'normal';

    items.forEach(item => {
      const menuItem = document.createElement('button');
      menuItem.className = 'overtype-dropdown-item';
      menuItem.type = 'button';
      menuItem.tabIndex = -1;
      menuItem.setAttribute('role', 'menuitemradio');
      menuItem.setAttribute('aria-checked', String(item.id === currentMode));
      menuItem.textContent = item.label;

      if (item.id === currentMode) {
        menuItem.classList.add('active');
        const checkmark = document.createElement('span');
        checkmark.className = 'overtype-dropdown-icon';
        checkmark.setAttribute('aria-hidden', 'true');
        checkmark.textContent = item.icon;
        menuItem.prepend(checkmark);
      }

      menuItem.addEventListener('click', (e) => {
        e.preventDefault();

        // Handle view mode changes
        switch(item.id) {
          case 'ir':
            this.editor.showInstantRenderMode();
            break;
          case 'normal':
          default:
            this.editor.showNormalEditMode();
            break;
        }

        this.closeViewModeDropdown(button, true);
      });

      dropdown.appendChild(menuItem);
    });

    return dropdown;
  }

  /**
   * Handle keyboard navigation inside the view mode menu
   */
  onViewModeMenuKeydown(e, button) {
    const menuItems = this.getViewModeMenuItems();
    const currentIndex = menuItems.indexOf(e.target);

    if (currentIndex === -1) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.focusViewModeMenuItem(this.activeDropdown, currentIndex + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.focusViewModeMenuItem(this.activeDropdown, currentIndex - 1);
        break;
      case 'Home':
        e.preventDefault();
        this.focusViewModeMenuItem(this.activeDropdown, 'first');
        break;
      case 'End':
        e.preventDefault();
        this.focusViewModeMenuItem(this.activeDropdown, 'last');
        break;
      case 'Escape':
        e.preventDefault();
        this.closeViewModeDropdown(button, true);
        break;
    }
  }

  /**
   * Focus a view mode menu item by index or placement
   */
  focusViewModeMenuItem(dropdown, placement) {
    const menuItems = this.getViewModeMenuItems(dropdown);

    if (menuItems.length === 0) {
      return;
    }

    let index = placement;

    if (placement === 'first') {
      index = 0;
    } else if (placement === 'last') {
      index = menuItems.length - 1;
    } else if (placement === 'current') {
      index = menuItems.findIndex(item => item.getAttribute('aria-checked') === 'true');
    }

    if (index < 0) {
      index = menuItems.length - 1;
    }

    if (index >= menuItems.length) {
      index = 0;
    }

    menuItems[index].focus();
  }

  /**
   * Get the current view mode menu items
   */
  getViewModeMenuItems(dropdown = this.activeDropdown) {
    if (!dropdown) {
      return [];
    }

    return Array.from(dropdown.querySelectorAll('[role="menuitemradio"]'));
  }

  /* ===== 「更多」面板（P3）：收纳按 group 分组的扩展项 ===== */

  /**
   * Toggle the "more" panel open/closed
   */
  toggleMorePanel(button) {
    if (this.morePanel) {
      this.closeMorePanel(button);
      return;
    }
    this.openMorePanel(button);
  }

  /**
   * Open the "more" panel, positioned against the trigger button via floating-ui
   */
  openMorePanel(button, focusPlacement = null) {
    this.closeMorePanel(button);

    const panel = this.createMorePanel();

    // Position panel relative to the button
    button.classList.add('dropdown-active');
    panel.style.position = 'absolute';
    this.moreCleanup = autoUpdate(button, panel, () => {
      computePosition(button, panel, {
        placement: 'bottom-end',
        middleware: [offset(5), flip(), shift({ padding: 5 })]
      }).then(({ x, y }) => {
        Object.assign(panel.style, { left: `${x}px`, top: `${y}px` });
      });
    });

    document.body.appendChild(panel);
    this.morePanel = panel;
    this.activeDropdownButton = button;
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', panel.id);

    // Click outside to close
    this.handleDocumentClick = (e) => {
      if (!panel.contains(e.target) && !button.contains(e.target)) {
        this.closeMorePanel(button);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', this.handleDocumentClick);
    }, 0);

    if (focusPlacement) {
      this.focusMoreItem(panel, focusPlacement);
    }
  }

  /**
   * Close the "more" panel
   */
  closeMorePanel(button = this.activeDropdownButton, returnFocus = false) {
    if (this.moreCleanup) {
      this.moreCleanup();
      this.moreCleanup = null;
    }

    if (this.morePanel) {
      this.morePanel.remove();
      this.morePanel = null;
      for (const name in this.moreButtons) {
        const el = this.moreButtons[name];
        if (el._clickHandler) {
          el.removeEventListener('click', el._clickHandler);
          delete el._clickHandler;
        }
      }
      this.moreButtons = {};
    }

    if (button) {
      button.classList.remove('dropdown-active');
      button.setAttribute('aria-expanded', 'false');
    }

    if (this.handleDocumentClick) {
      document.removeEventListener('click', this.handleDocumentClick);
      this.handleDocumentClick = null;
    }

    if (returnFocus && button) {
      button.focus();
    }
  }

  /**
   * Build the "more" panel, grouping extended buttons by their `group`
   */
  createMorePanel() {
    const panel = document.createElement('div');
    panel.className = 'overtype-dropdown-menu overtype-more-panel';
    panel.id = this.getInstanceElementId('toolbar-more-panel');
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', t('more', this.lang));

    panel.addEventListener('keydown', (e) => {
      this.onMorePanelKeydown(e);
    });

    // 未显式声明 group 的按钮归入首组，保持可观测
    const groups = new Map();

    moreToolbarButtons.forEach(config => {
      const groupName = config.group || '格式';
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName).push(config);
    });

    const orderedGroups = Array.from(groups.keys())
      .sort((a, b) => {
        const ia = GROUP_ORDER.indexOf(a);
        const ib = GROUP_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });

    orderedGroups.forEach(groupName => {
      const groupEl = document.createElement('div');
      groupEl.className = 'overtype-more-group';

      const title = document.createElement('div');
      title.className = 'overtype-more-group-title';
      title.setAttribute('role', 'separator');
      title.textContent = t('group_' + (GROUP_KEY[groupName] || groupName), this.lang);
      groupEl.appendChild(title);

      groups.get(groupName).forEach(config => {
        const item = this.createMoreItem(config, title);
        groupEl.appendChild(item);
      });

      panel.appendChild(groupEl);
    });

    return panel;
  }

  /**
   * Create a single item inside the more panel
   */
  createMoreItem(buttonConfig) {
    const item = document.createElement('button');
    item.className = 'overtype-toolbar-button overtype-more-item';
    item.type = 'button';
    item.tabIndex = -1;
    item.setAttribute('role', 'menuitem');
    item.setAttribute('data-button', buttonConfig.name);
    const label = t(buttonConfig.title || buttonConfig.name, this.lang);
    item.title = label;
    item.setAttribute('aria-label', label);
    item.innerHTML = this.sanitizeSVG(buttonConfig.icon || '');

    item._clickHandler = (e) => {
      e.preventDefault();
      const actionId = buttonConfig.actionId || buttonConfig.name;
      this.editor.performAction(actionId, e);
      // 执行后聚焦回触发面板并关闭
      const trigger = this.activeDropdownButton;
      this.closeMorePanel(trigger, true);
    };

    item.addEventListener('click', item._clickHandler);
    this.moreButtons[buttonConfig.name] = item;
    return item;
  }

  /**
   * Handle keyboard navigation inside the more panel
   */
  onMorePanelKeydown(e) {
    const targets = Array.from(this.morePanel.querySelectorAll('.overtype-more-item'));
    const currentIndex = targets.indexOf(e.target);

    if (currentIndex === -1) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        targets[(currentIndex + 1) % targets.length].focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        targets[(currentIndex - 1 + targets.length) % targets.length].focus();
        break;
      case 'Home':
        e.preventDefault();
        targets[0].focus();
        break;
      case 'End':
        e.preventDefault();
        targets[targets.length - 1].focus();
        break;
      case 'Escape':
        e.preventDefault();
        this.closeMorePanel(this.activeDropdownButton, true);
        break;
    }
  }

  /**
   * Focus a more-panel item by index or placement
   */
  focusMoreItem(panel, placement) {
    const targets = Array.from(panel.querySelectorAll('.overtype-more-item'));
    if (targets.length === 0) {
      return;
    }
    const index = placement === 'last' ? targets.length - 1 : 0;
    targets[index].focus();
  }

  /**
   * Update active states of toolbar buttons
   */
  updateButtonStates() {
    try {
      const activeFormats = markdownActions.getActiveFormats?.(
        this.editor.textarea,
        this.editor.textarea.selectionStart
      ) || [];

      Object.entries(this.buttons).forEach(([name, button]) => {
        if (name === 'viewMode' || name === 'more') return; // Skip dropdown buttons
        const buttonConfig = this.toolbarButtons.find(buttonConfig => buttonConfig.name === name);

        if (!buttonConfig?.isActive) {
          return;
        }

        const isActive = Boolean(buttonConfig.isActive({
          editor: this.editor,
          activeFormats
        }));

        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive.toString());
      });

      // 「更多」面板内扩展项的状态
      Object.entries(this.moreButtons).forEach(([name, item]) => {
        const config = moreToolbarButtons.find(b => b.name === name);
        if (!config?.isActive) {
          return;
        }
        const isActive = Boolean(config.isActive({
          editor: this.editor,
          activeFormats
        }));
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-pressed', isActive.toString());
      });
    } catch (error) {
      // Silently fail if markdown-actions not available
    }
  }

  show() {
    if (this.container) {
      this.container.classList.remove('overtype-toolbar-hidden');
    }
  }

  hide() {
    if (this.container) {
      this.container.classList.add('overtype-toolbar-hidden');
    }
  }

  /**
   * Destroy toolbar and cleanup
   */
  destroy() {
    if (this.container) {
      // Clean up event listeners
      if (this.activeDropdown) {
        this.closeViewModeDropdown();
      } else if (this.handleDocumentClick) {
        document.removeEventListener('click', this.handleDocumentClick);
        this.handleDocumentClick = null;
      }
      // Clean up button listeners
      Object.values(this.buttons).forEach(button => {
        if (button._clickHandler) {
          button.removeEventListener('click', button._clickHandler);
          delete button._clickHandler;
        }
        if (button._keydownHandler) {
          button.removeEventListener('keydown', button._keydownHandler);
          delete button._keydownHandler;
        }
      });

      // Clean up the more panel and its items
      this.closeMorePanel();

      // Remove container
      this.container.remove();
      this.container = null;
      this.buttons = {};
    }
  }

  /**
   * Switch the toolbar UI language and re-render localized labels.
   * @param {string} lang - 'zh' | 'en'
   */
  setLang(lang) {
    this.lang = lang || LANG_ZH;
    i18nSetLang(this.lang);

    if (!this.container) {
      return;
    }

    this.container.setAttribute('aria-label', t('toolbar_label', this.lang));

    this.toolbarButtons.forEach(config => {
      if (!config.name || config.name === 'separator') {
        return;
      }
      const el = this.buttons[config.name];
      if (!el) {
        return;
      }
      const label = t(config.title || config.name, this.lang);
      el.title = label;
      el.setAttribute('aria-label', label);
    });

    // 若「更多」面板已打开则就地重建以刷新分组标题
    if (this.morePanel) {
      const trigger = this.activeDropdownButton;
      this.closeMorePanel(trigger);
      this.openMorePanel(trigger);
    }
  }
}
