/**
 * zhuosu 代码块工具栏 — Apple 交通灯终端样式
 * 功能：交通灯（红黄绿）+ 语言标识 + 复制代码
 * 兼容 Pjax：DOMContentLoaded 与 zs:pjax:loaded 均触发初始化
 */
(function () {
  'use strict';

  var CodeToolbar = {
    config: {
      copyText: { default: '复制', success: '已复制!', error: '复制失败' },
      iconCopy: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
      iconSuccess: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
    },

    init: function () {
      this.addToolbarToCodeBlocks();
    },

    addToolbarToCodeBlocks: function () {
      var self = this;
      // .highlight 语法高亮容器，pre > code 纯代码块（不在 .highlight 内）
      var codeBlocks = document.querySelectorAll('.highlight, pre > code');

      codeBlocks.forEach(function (block) {
        if (block.closest('.code-toolbar-wrapper')) return;
        // 位于 .highlight 内部的 code 由 .highlight 容器统一处理，跳过
        if (block.tagName === 'CODE' && block.closest('.highlight')) return;

        self.createToolbar(block);
      });
    },

    createToolbar: function (codeBlock) {
      var wrapper = document.createElement('div');
      wrapper.className = 'code-toolbar-wrapper';

      // 包裹原始代码块
      var parent = codeBlock.parentNode;
      if (parent && !parent.classList.contains('highlight')) {
        if (codeBlock.tagName === 'CODE' && parent.tagName === 'PRE') {
          parent.parentNode.insertBefore(wrapper, parent);
          wrapper.appendChild(parent);
        } else {
          parent.insertBefore(wrapper, codeBlock);
          wrapper.appendChild(codeBlock);
        }
      } else {
        parent.insertBefore(wrapper, codeBlock);
        wrapper.appendChild(codeBlock);
      }

      // 创建工具栏
      var toolbar = document.createElement('div');
      toolbar.className = 'code-toolbar';

      // 交通灯（macOS 风格红黄绿圆点）
      var trafficLights = document.createElement('div');
      trafficLights.className = 'code-traffic-lights';
      trafficLights.setAttribute('aria-hidden', 'true');
      ['red', 'yellow', 'green'].forEach(function (color) {
        var light = document.createElement('span');
        light.className = 'code-traffic-light ' + color;
        trafficLights.appendChild(light);
      });
      toolbar.appendChild(trafficLights);

      // 语言标识（左侧）
      var langLabel = this.detectLanguage(codeBlock);
      if (langLabel) {
        var langSpan = document.createElement('span');
        langSpan.className = 'code-lang';
        langSpan.textContent = langLabel;
        toolbar.appendChild(langSpan);
      }

      // 复制按钮（右侧）
      var copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'code-copy-btn';
      copyBtn.setAttribute('aria-label', this.config.copyText.default);
      copyBtn.title = this.config.copyText.default;

      var copyIcon = document.createElement('span');
      copyIcon.className = 'code-copy-icon';
      copyIcon.innerHTML = this.config.iconCopy;
      copyBtn.appendChild(copyIcon);

      var copyText = document.createElement('span');
      copyText.className = 'code-copy-text';
      copyBtn.appendChild(copyText);

      toolbar.appendChild(copyBtn);

      // 将工具栏插入到 wrapper 最前面
      wrapper.insertBefore(toolbar, wrapper.firstChild);

      // 绑定复制事件
      this.bindCopyEvent(copyBtn, codeBlock);

      // 添加行号
      this.addLineNumbers(codeBlock);
    },

    addLineNumbers: function (codeBlock) {
      var codeEl = codeBlock.tagName === 'CODE' ? codeBlock : codeBlock.querySelector('code');
      if (!codeEl) return;
      // Chroma 自带行号（lntable）或已添加过则跳过
      if (codeEl.querySelector('.lntable') || codeEl.querySelector('.code-line')) return;

      var lines = [];
      var children = codeEl.children;
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (child.tagName === 'SPAN' && child.style && child.style.display === 'flex') {
          lines.push(child);
        }
      }
      if (!lines.length) return;

      lines.forEach(function (line, idx) {
        line.classList.add('code-line');
        var num = document.createElement('span');
        num.className = 'code-line-num';
        num.textContent = idx + 1;
        line.insertBefore(num, line.firstChild);
      });
    },

    detectLanguage: function (codeBlock) {
      var el = codeBlock;
      // .highlight 容器时向下找 code 元素
      if (el.tagName !== 'CODE') {
        el = codeBlock.querySelector('code');
      }
      if (!el) return null;

      var classList = (el.className || '').split(/\s+/);
      for (var i = 0; i < classList.length; i++) {
        var m = classList[i].match(/^(?:language|lang)-(\w+)$/);
        if (m) return this.formatLangName(m[1]);
      }
      return null;
    },

    formatLangName: function (lang) {
      var map = {
        'js': 'JavaScript', 'javascript': 'JavaScript',
        'ts': 'TypeScript', 'typescript': 'TypeScript',
        'py': 'Python', 'python': 'Python',
        'java': 'Java', 'cpp': 'C++', 'c': 'C',
        'go': 'Go', 'rust': 'Rust', 'rs': 'Rust',
        'rb': 'Ruby', 'ruby': 'Ruby',
        'php': 'PHP', 'swift': 'Swift',
        'kotlin': 'Kotlin', 'kt': 'Kotlin',
        'scala': 'Scala', 'sh': 'Shell', 'bash': 'Bash',
        'sql': 'SQL', 'html': 'HTML', 'css': 'CSS',
        'scss': 'SCSS', 'less': 'Less',
        'json': 'JSON', 'xml': 'XML', 'yaml': 'YAML', 'yml': 'YAML',
        'markdown': 'Markdown', 'md': 'Markdown',
        'plaintext': 'Text', 'text': 'Text', 'plain': 'Text',
        'dockerfile': 'Docker', 'docker': 'Docker',
        'vue': 'Vue', 'react': 'React', 'jsx': 'JSX',
        'tsx': 'TSX', 'svelte': 'Svelte'
      };
      return map[lang.toLowerCase()] || lang.toUpperCase();
    },

    bindCopyEvent: function (btn, codeBlock) {
      var self = this;
      btn.addEventListener('click', function () {
        var codeText = self.extractCodeText(codeBlock);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(codeText).then(function () {
            self.showCopySuccess(btn);
          }).catch(function () {
            self.fallbackCopy(codeText, btn);
          });
        } else {
          self.fallbackCopy(codeText, btn);
        }
      });
    },

    extractCodeText: function (codeBlock) {
      var codeEl = codeBlock.tagName === 'CODE' ? codeBlock : codeBlock.querySelector('code');
      if (!codeEl) return codeBlock.textContent.trim();
      // 移除行号与自定义行号元素
      var clone = codeEl.cloneNode(true);
      var lineNumbers = clone.querySelectorAll('.line-numbers-rows, .lntable .lntd:first-child, [data-line], .code-line-num');
      lineNumbers.forEach(function (el) { el.remove(); });
      return clone.textContent.trim();
    },

    showCopySuccess: function (btn) {
      var self = this;
      var icon = btn.querySelector('.code-copy-icon');
      var text = btn.querySelector('.code-copy-text');
      if (icon) icon.innerHTML = self.config.iconSuccess;
      if (text) text.textContent = self.config.copyText.success;
      btn.setAttribute('aria-label', self.config.copyText.success);
      btn.classList.add('copied');

      setTimeout(function () {
        if (icon) icon.innerHTML = self.config.iconCopy;
        if (text) text.textContent = '';
        btn.setAttribute('aria-label', self.config.copyText.default);
        btn.classList.remove('copied');
      }, 2000);
    },

    fallbackCopy: function (text, btn) {
      var self = this;
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        self.showCopySuccess(btn);
      } catch (err) {
        btn.setAttribute('aria-label', self.config.copyText.error);
      }
      document.body.removeChild(textarea);
    }
  };

  function init() {
    CodeToolbar.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // Pjax 导航后重新初始化
  document.addEventListener('zs:pjax:loaded', init);
})();
