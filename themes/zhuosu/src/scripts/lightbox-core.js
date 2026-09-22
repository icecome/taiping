/**
 * 共享灯箱核心
 *
 * 统一图片预览灯箱，支持键盘 / 手势 / 缩放 / 动画 / 无障碍焦点陷井。
 * 由 lightbox-gallery.js 通过 window.SharedLightbox 调用。
 *
 * 可访问性：
 * - overlay 标记 role="dialog" + aria-modal="true"
 * - 打开时记录触发元素，关闭后恢复焦点
 * - Tab / Shift+Tab 焦点陷井，防止焦点逃出遮罩
 *
 * 工具栏（底部）：上一张 / 下一张 / 放大 / 缩小 / 还原 / 另存为 / 关闭
 */
(function () {
  'use strict';

  // ==================== 内联 SVG 图标 ====================

  var SVG_ICONS = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    zoomIn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>',
    zoomOut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
    spinner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-1Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>'
  };

  var ICON_HTML = {
    loader: '<div class="lb-loader">' + SVG_ICONS.spinner + '</div>',
    prev: '<button type="button" class="lb-btn lb-prev" aria-label="上一张" title="上一张 (←)">' + SVG_ICONS.prev + '</button>',
    next: '<button type="button" class="lb-btn lb-next" aria-label="下一张" title="下一张 (→)">' + SVG_ICONS.next + '</button>',
    zoomIn: '<button type="button" class="lb-btn lb-zoom-in" aria-label="放大" title="放大 (+)">' + SVG_ICONS.zoomIn + '</button>',
    zoomOut: '<button type="button" class="lb-btn lb-zoom-out" aria-label="缩小" title="缩小 (-)">' + SVG_ICONS.zoomOut + '</button>',
    save: '<button type="button" class="lb-btn lb-save" aria-label="另存为" title="另存为">' + SVG_ICONS.save + '</button>',
    close: '<button type="button" class="lb-btn lb-close" aria-label="关闭" title="关闭 (Esc)">' + SVG_ICONS.close + '</button>'
  };

  // ==================== Lightbox 核心 ====================

  var Lightbox = {
    overlay: null,
    container: null,
    image: null,
    counter: null,
    caption: null,
    closeBtn: null,
    prevBtn: null,
    nextBtn: null,
    zoomInBtn: null,
    zoomOutBtn: null,
    saveBtn: null,

    currentIndex: 0,
    images: [],
    currentScale: 1,
    MAX_SCALE: 6,
    isOpen: false,
    isLoading: false,

    lastFocused: null,

    dragStartX: 0,
    dragStartY: 0,
    translateX: 0,
    translateY: 0,

    init: function() {
      this.createOverlay();
      this.bindEvents();
      this.bindPinchZoom();
    },

    createOverlay: function() {
      var self = this;

      this.overlay = document.createElement('div');
      this.overlay.className = 'lb-overlay';
      this.overlay.setAttribute('role', 'dialog');
      this.overlay.setAttribute('aria-label', '图片预览');
      this.overlay.setAttribute('aria-modal', 'true');
      this.overlay.innerHTML =
        ICON_HTML.loader +
        '<div class="lb-image-wrap">' +
          '<img class="lb-image" draggable="false" />' +
        '</div>' +
        '<div class="lb-counter"></div>' +
        '<div class="lb-caption"></div>' +
        '<div class="lb-toolbar">' +
          ICON_HTML.prev +
          ICON_HTML.next +
          '<span class="lb-toolbar-sep lb-sep-nav" aria-hidden="true"></span>' +
          ICON_HTML.zoomIn +
          ICON_HTML.zoomOut +
          '<span class="lb-toolbar-sep" aria-hidden="true"></span>' +
          ICON_HTML.save +
          ICON_HTML.close +
        '</div>';

      document.body.appendChild(this.overlay);

      this.container = this.overlay.querySelector('.lb-image-wrap');
      this.image = this.overlay.querySelector('.lb-image');
      this.counter = this.overlay.querySelector('.lb-counter');
      this.caption = this.overlay.querySelector('.lb-caption');
      this.prevBtn = this.overlay.querySelector('.lb-prev');
      this.nextBtn = this.overlay.querySelector('.lb-next');
      this.zoomInBtn = this.overlay.querySelector('.lb-zoom-in');
      this.zoomOutBtn = this.overlay.querySelector('.lb-zoom-out');
      this.saveBtn = this.overlay.querySelector('.lb-save');
      this.closeBtn = this.overlay.querySelector('.lb-close');
      this.navSep = this.overlay.querySelector('.lb-sep-nav');

      this.image.addEventListener('load', function() {
        self.overlay.classList.remove('lb-loading');
        self.isLoading = false;
        self.resetPosition();
      });

      this.image.addEventListener('error', function() {
        self.overlay.classList.remove('lb-loading');
        self.isLoading = false;
        self.image.style.display = 'none';
        var currentSrc = self.image.src;
        var errorMsg = self.overlay.querySelector('.lb-error');
        if (!errorMsg) {
          errorMsg = document.createElement('div');
          errorMsg.className = 'lb-error';
          errorMsg.innerHTML = SVG_ICONS.warning + '<p>图片加载失败</p><button type="button" class="lb-retry">重试</button>';
          self.overlay.appendChild(errorMsg);
        }
        errorMsg.querySelector('.lb-retry').onclick = function() {
          errorMsg.remove();
          self.image.style.display = 'block';
          self.image.src = currentSrc;
        };
      });
    },

    bindEvents: function() {
      var self = this;

      this.closeBtn.addEventListener('click', function() { self.close(); });
      this.overlay.addEventListener('click', function(e) {
        if (e.target === self.overlay || e.target === self.container) {
          self.close();
        }
      });

      this.prevBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        self.prev();
      });
      this.nextBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        self.next();
      });
      this.zoomInBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        self.zoomIn();
      });
      this.zoomOutBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        self.zoomOut();
      });
      this.saveBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        self.saveImage();
      });

      // 工具栏按钮（含分隔符）阻止冒泡，避免误关
      var toolbar = this.overlay.querySelector('.lb-toolbar');
      if (toolbar) {
        toolbar.addEventListener('click', function(e) { e.stopPropagation(); });
      }

      document.addEventListener('keydown', function(e) {
        if (!self.isOpen) return;
        switch (e.key) {
          case 'Escape': self.close(); break;
          case 'ArrowLeft': self.prev(); break;
          case 'ArrowRight': self.next(); break;
          case '+': case '=': self.zoomIn(); break;
          case '-': case '_': self.zoomOut(); break;
          case 'Tab': self.trapFocus(e); break;
        }
      });

      this.bindDragEvents();
    },

    trapFocus: function(e) {
      var focusables = this.overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusables.length === 0) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },

    bindDragEvents: function() {
      var self = this;
      var startX = 0, startY = 0;
      var isDragging = false;

      this.image.addEventListener('mousedown', function(e) {
        if (self.currentScale <= 1 || e.button !== 0) return;
        isDragging = true;
        startX = e.clientX - self.translateX;
        startY = e.clientY - self.translateY;
        self.image.style.cursor = 'grabbing';
        e.preventDefault();
      });

      document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        self.translateX = e.clientX - startX;
        self.translateY = e.clientY - startY;
        self.applyTransform();
      });

      document.addEventListener('mouseup', function() {
        if (isDragging) {
          isDragging = false;
          self.image.style.cursor = self.currentScale > 1 ? 'grab' : '';
        }
      });

      var pointerStartX = 0, pointerStartTime = 0;
      var isPointerDown = false;

      this.overlay.addEventListener('pointerdown', function(e) {
        if (e.pointerType === 'mouse') return;
        if (e.target !== self.image && self.currentScale <= 1) return;

        pointerStartX = e.clientX;
        pointerStartTime = Date.now();
        isPointerDown = true;
      }.bind(this));

      this.overlay.addEventListener('pointerup', function(e) {
        if (!isPointerDown) return;
        if (self.currentScale > 1) {
          isPointerDown = false;
          return;
        }

        var pointerEndX = e.clientX;
        var diff = pointerStartX - pointerEndX;
        var elapsed = Date.now() - pointerStartTime;

        if (Math.abs(diff) > 80 && elapsed < 500) {
          if (diff > 0) self.next();
          else self.prev();
        } else if (Math.abs(diff) > 120) {
          if (diff > 0) self.next();
          else self.prev();
        }
        isPointerDown = false;
      }.bind(this));
    },

    open: function(images, index) {
      // 使在途的 close 清理定时器失效，防止快速 关闭→重开 时误清新会话
      this._closeToken = (this._closeToken || 0) + 1;

      this.images = images;
      this.currentIndex = Math.max(0, Math.min(index, images.length - 1));
      this.currentScale = 1;
      this.translateX = 0;
      this.translateY = 0;

      this.updateImage();
      this.updateUI();

      this.lastFocused = document.activeElement;
      this.overlay.classList.add('lb-active');
      document.body.style.overflow = 'hidden';
      this.isOpen = true;

      var single = this.images.length <= 1;
      this.prevBtn.style.display = single ? 'none' : '';
      this.nextBtn.style.display = single ? 'none' : '';
      if (this.navSep) this.navSep.style.display = single ? 'none' : '';

      var self = this;
      setTimeout(function() {
        if (self.isOpen && self.closeBtn) self.closeBtn.focus();
      }, 0);
    },

    close: function() {
      this.overlay.classList.remove('lb-active');
      this.overlay.classList.add('lb-closing');
      document.body.style.overflow = '';
      this.isOpen = false;

      if (this.lastFocused && this.lastFocused.focus) {
        this.lastFocused.focus();
      }
      this.lastFocused = null;

      var self = this;
      var token = (this._closeToken || 0) + 1;
      this._closeToken = token;
      setTimeout(function() {
        if (token !== self._closeToken || self.isOpen) return;
        self.overlay.classList.remove('lb-closing');
        self.image.style.display = 'none';
        self.images = [];
        self.currentScale = 1;
        self.applyTransform();
      }, 300);
    },

    prev: function() {
      if (this.images.length <= 1) return;
      this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
      this.currentScale = 1;
      this.updateImage();
      this.updateUI();
    },

    next: function() {
      if (this.images.length <= 1) return;
      this.currentIndex = (this.currentIndex + 1) % this.images.length;
      this.currentScale = 1;
      this.updateImage();
      this.updateUI();
    },

    zoomIn: function() {
      this.setScale(this.currentScale * 1.5);
    },

    zoomOut: function() {
      this.setScale(this.currentScale / 1.5);
    },

    setScale: function(scale) {
      if (this.isLoading) return;
      scale = Math.max(1, Math.min(scale, this.MAX_SCALE));
      this.currentScale = scale;

      if (scale <= 1) {
        this.translateX = 0;
        this.translateY = 0;
      }
      this.applyTransform();
      this.container.classList.toggle('lb-zoomed', scale > 1);
    },

    updateImage: function() {
      var imgData = this.images[this.currentIndex];
      if (!imgData) return;

      this.isLoading = true;
      this.overlay.classList.add('lb-loading');
      this.image.style.display = 'block';
      this.image.src = imgData.src;
      this.image.alt = imgData.alt || '';

      this.resetPosition();
    },

    resetPosition: function() {
      this.translateX = 0;
      this.translateY = 0;
      this.applyTransform();
    },

    applyTransform: function() {
      if (this.currentScale > 1) {
        this.image.style.transform = 'scale(' + this.currentScale + ') translate(' + (this.translateX / this.currentScale) + 'px, ' + (this.translateY / this.currentScale) + 'px)';
        this.image.style.cursor = 'grab';
      } else {
        this.image.style.transform = '';
        this.image.style.cursor = '';
      }
    },

    saveImage: function() {
      var src = this.image.src;
      if (!src) return;
      var name = src.split('/').pop().split('?')[0] || 'image';
      name = name.replace(/[^\w.\-]/g, '_') || 'image';

      var triggerDownload = function(url, filename) {
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
      };

      // 尝试以 Blob 下载（图片同源或允许 CORS 时可用），否则退化为新标签打开
      if (src.indexOf('data:') === 0) {
        triggerDownload(src, name);
        return;
      }
      fetch(src).then(function(r) {
        if (!r.ok) throw new Error('bad status');
        return r.blob();
      }).then(function(blob) {
        var url = URL.createObjectURL(blob);
        triggerDownload(url, name);
        setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
      }).catch(function() {
        // 跨域且未授权 CORS：浏览器会忽略 download，退化为新标签预览
        triggerDownload(src, name);
      });
    },

    updateUI: function() {
      if (this.images.length > 1) {
        this.counter.textContent = (this.currentIndex + 1) + ' / ' + this.images.length;
      } else {
        this.counter.textContent = '';
      }

      var alt = this.images[this.currentIndex] ? this.images[this.currentIndex].alt : '';
      this.caption.textContent = alt || '';
    },

    destroy: function() {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      document.body.style.overflow = '';
      this.isOpen = false;
      this.lastFocused = null;
    },

    bindPinchZoom: function() {
      var self = this;
      var initialDistance = 0;
      var baseScale = 1;

      function getTouchDistance(touches) {
        var dx = touches[0].clientX - touches[1].clientX;
        var dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
      }

      this.overlay.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) {
          initialDistance = getTouchDistance(e.touches);
          baseScale = self.currentScale;
        }
      }, { passive: true });

      this.overlay.addEventListener('touchmove', function(e) {
        if (e.touches.length !== 2) return;
        e.preventDefault();
        var distance = getTouchDistance(e.touches);
        if (initialDistance === 0) return;
        var scale = baseScale * (distance / initialDistance);
        scale = Math.max(1, Math.min(scale, self.MAX_SCALE));
        self.setScale(scale);
      }, { passive: false });

      this.overlay.addEventListener('touchend', function(e) {
        if (e.touches.length < 2) initialDistance = 0;
      });
    }
  };

  Lightbox.init();

  window.SharedLightbox = Lightbox;
})();
