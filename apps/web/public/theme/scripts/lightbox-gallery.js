/**
 * 共享灯箱画廊
 *
 * 两大场景：
 * 1. 文章内容区：自动检测连续图片，横排排列为画廊
 * 2. 说说宫格：点击宫格图片打开 Lightbox 预览
 *
 * 依赖 window.SharedLightbox（由 lightbox-core.js 提供）。
 */
(function () {
  'use strict';

  if (!window.SharedLightbox) {
    return;
  }
  var Lightbox = window.SharedLightbox;

  // ==================== 文章内容：连续图片检测 & 横排画廊 ====================

  var ArticleGallery = {
    processed: false,
    galleries: new Map(),
    globalHandlerBound: false,

    init: function() {
      var postContents = document.querySelectorAll('.post-content');
      var self = this;
      if (postContents.length) {
        postContents.forEach(function(el) {
          self.processImages(el);
        });
      }
      this.bindGalleryLinks();
      this.bindGlobalClickHandler();
    },

    bindGlobalClickHandler: function() {
      if (this.globalHandlerBound) return;
      this.globalHandlerBound = true;

      var self = this;
      document.addEventListener('click', function(e) {
        // === 文章画廊链接（包括孤立单图） ===
        var galleryLink = e.target.closest('.article-gallery-link');
        if (galleryLink) {
          e.preventDefault();
          e.stopPropagation();

          // 检测是否在 Moments 宫格内
          var picGrid = galleryLink.closest('.pic-grid');
          if (picGrid) {
            var links = picGrid.querySelectorAll('.article-gallery-link');
            var imgs = [];
            var clickedIndex = 0;
            links.forEach(function(link, i) {
              imgs.push({
                src: link.getAttribute('data-src') || link.href,
                alt: link.getAttribute('data-alt') || ''
              });
              if (link === galleryLink) clickedIndex = i;
            });
            Lightbox.open(imgs, clickedIndex);
            return;
          }

          var gallery = galleryLink.closest('.article-gallery');
          if (gallery && self.galleries.has(gallery)) {
            var images = self.galleries.get(gallery);
            var linksInGallery = gallery.querySelectorAll('.article-gallery-link');
            var clickedIndex = 0;
            for (var i = 0; i < linksInGallery.length; i++) {
              if (linksInGallery[i] === galleryLink) { clickedIndex = i; break; }
            }
            Lightbox.open(images, clickedIndex);
          } else {
            // 孤立单图
            Lightbox.open([{
              src: galleryLink.getAttribute('data-src') || galleryLink.href,
              alt: galleryLink.getAttribute('data-alt') || ''
            }], 0);
          }
          return;
        }

        // === 文章内普通图片（不在画廊中） ===
        var postImg = e.target.closest('.post-content img, .article-item img');
        if (postImg && !e.target.closest('.article-gallery-link')) {
          if (postImg.closest('.article-gallery')) return;
          if (postImg.closest('.article-single-figure')) return;
          e.preventDefault();
          Lightbox.open([{
            src: postImg.src || postImg.getAttribute('data-src') || '',
            alt: postImg.alt || ''
          }], 0);
          return;
        }

        // === 说说宫格 ===
        var singleContainer = e.target.closest('.single-pic-container');
        if (singleContainer) {
          e.preventDefault();
          var img = singleContainer.querySelector('img');
          if (img) {
            Lightbox.open([{ src: img.src, alt: img.alt || '' }], 0);
          }
          return;
        }

        var gridContainer = e.target.closest('.pic-grid-container');
        if (gridContainer) {
          e.preventDefault();
          var gridImages = [];
          var gridClicked = 0;
          var imgElements = gridContainer.querySelectorAll('.grid-item img, .single-pic img');
          imgElements.forEach(function(image, idx) {
            gridImages.push({ src: image.src, alt: image.alt || '' });
            if (image === e.target || image.contains(e.target)) {
              gridClicked = idx;
            }
          });
          if (gridImages.length > 0) {
            Lightbox.open(gridImages, gridClicked);
          }
        }

        // === 兜底：内容区任意图片（含被 <a> 包裹的封面图 / 卡片图）===
        // 防止点击图片时浏览器原生导航到图片 URL（表现为“无按钮、只能返回”）
        var anyImg = e.target.closest('img');
        if (anyImg && !anyImg.closest('.lb-overlay')) {
          // 图片已在指向「非图片资源」的 <a> 内时，保留浏览器原生跳转（如卡片图链接到文章）
          var wrapLink = anyImg.closest('a');
          if (wrapLink) {
            var wrapHref = wrapLink.getAttribute('href') || '';
            var isImageLink = /\.(jpe?g|png|webp|gif|svg|bmp|avif)(\?|#|$)/i.test(wrapHref);
            if (!isImageLink) return;
          }
          e.preventDefault();
          var anySrc = anyImg.currentSrc || anyImg.src || anyImg.getAttribute('data-src') || '';
          if (anySrc) {
            Lightbox.open([{ src: anySrc, alt: anyImg.alt || '' }], 0);
          }
          return;
        }
      });
    },

    processImages: function(container) {
      var self = this;
      var paragraphs = container.querySelectorAll('p');
      var imageParagraphs = [];

      paragraphs.forEach(function(p) {
        var imgs = p.querySelectorAll('img');
        if (imgs.length === 0) return;

        if (self.isPureImageParagraph(p)) {
          imageParagraphs.push({ p: p, imgs: Array.from(imgs) });
        }
      });

      if (imageParagraphs.length === 0) return;

      var pendingSingleFigures = [];

      imageParagraphs.forEach(function(item) {
        if (item.imgs.length >= 2) {
          self.replaceParagraphWithGallery(item.p, item.imgs);
        } else {
          var figure = self.createSingleFigure(item.p, item.imgs[0]);
          if (figure) {
            pendingSingleFigures.push({ figure: figure, p: item.p });
          }
        }
      });

      if (pendingSingleFigures.length > 0) {
        self.mergeAdjacentSingles(pendingSingleFigures);
      }

      this.processed = true;
    },

    isPureImageParagraph: function(p) {
      var textContent = '';
      for (var i = 0; i < p.childNodes.length; i++) {
        var node = p.childNodes[i];
        if (node.nodeType === Node.TEXT_NODE) {
          var trimmed = node.textContent.trim();
          if (trimmed) textContent += trimmed;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName !== 'IMG' && node.tagName !== 'A' && node.tagName !== 'BR') {
            textContent += 'x';
          }
        }
      }
      return textContent.length === 0;
    },

    setGalleryColumns: function(container, count) {
      if (count <= 3) {
        container.dataset.columns = String(count);
      } else if (count <= 4) {
        container.dataset.columns = '4';
      } else {
        container.dataset.columns = '3';
      }
    },

    replaceParagraphWithGallery: function(p, imgs) {
      var self = this;

      var galleryContainer = document.createElement('div');
      galleryContainer.className = 'article-gallery';
      self.setGalleryColumns(galleryContainer, imgs.length);

      imgs.forEach(function(img) {
        var figure = document.createElement('figure');
        figure.className = 'article-gallery-item';

        var src = img.src || img.getAttribute('data-src') || '';
        var alt = img.alt || '';

        var link = document.createElement('a');
        link.href = src;
        link.className = 'article-gallery-link';
        link.setAttribute('data-src', src);
        link.setAttribute('data-alt', alt);

        var clonedImg = img.cloneNode(true);
        clonedImg.removeAttribute('loading');
        clonedImg.removeAttribute('width');
        clonedImg.removeAttribute('height');
        clonedImg.style.cssText = '';
        link.appendChild(clonedImg);
        figure.appendChild(link);
        galleryContainer.appendChild(figure);
      });

      p.parentNode.replaceChild(galleryContainer, p);
    },

    createSingleFigure: function(p, img) {
      var figure = document.createElement('figure');
      figure.className = 'article-single-figure';

      var src = img.src || img.getAttribute('data-src') || '';
      var alt = img.alt || '';

      var link = document.createElement('a');
      link.href = src;
      link.className = 'article-gallery-link';
      link.setAttribute('data-src', src);
      link.setAttribute('data-alt', alt);

      var clonedImg = img.cloneNode(true);
      clonedImg.removeAttribute('loading');
      clonedImg.removeAttribute('width');
      clonedImg.removeAttribute('height');
      clonedImg.style.cssText = '';
      link.appendChild(clonedImg);
      figure.appendChild(link);

      return figure;
    },

    mergeAdjacentSingles: function(pendingSingles) {
      if (pendingSingles.length === 0) return;

      pendingSingles.sort(function(a, b) {
        var pos = a.p.compareDocumentPosition(b.p);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });

      var groups = [];
      var currentGroup = [pendingSingles[0]];

      for (var i = 1; i < pendingSingles.length; i++) {
        var prev = pendingSingles[i - 1];
        var curr = pendingSingles[i];

        if (this.areAdjacentParagraphs(prev.p, curr.p)) {
          currentGroup.push(curr);
        } else {
          groups.push(currentGroup);
          currentGroup = [curr];
        }
      }
      groups.push(currentGroup);

      var self = this;
      groups.forEach(function(group) {
        if (group.length >= 2) {
          self.createMergedGallery(group);
        } else if (group.length === 1) {
          var item = group[0];
          item.p.parentNode.replaceChild(item.figure, item.p);
        }
      });
    },

    areAdjacentParagraphs: function(p1, p2) {
      var brCount = 0;
      var node = p1.nextElementSibling;
      while (node && node !== p2) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'BR') {
            brCount++;
            if (brCount > 2) return false;
          } else if (node.tagName !== 'HR' &&
              !node.classList.contains('article-gallery')) {
            return false;
          }
        } else if (node.nodeType === Node.TEXT_NODE) {
          if (node.textContent.trim().length > 0) {
            return false;
          }
        }
        node = node.nextElementSibling;
      }
      return node === p2;
    },

    createMergedGallery: function(group) {
      var self = this;
      var galleryContainer = document.createElement('div');
      galleryContainer.className = 'article-gallery';
      self.setGalleryColumns(galleryContainer, group.length);

      group.forEach(function(item) {
        item.figure.classList.add('article-gallery-item');
        galleryContainer.appendChild(item.figure);
        if (item.p.parentNode) {
          item.p.parentNode.removeChild(item.p);
        }
      });

      var firstP = group[0].p;
      if (firstP.parentNode) {
        firstP.parentNode.insertBefore(galleryContainer, firstP);
        firstP.parentNode.removeChild(firstP);
      }
    },

    bindGalleryLinks: function() {
      var galleryLinks = document.querySelectorAll('.post-content .article-gallery-link');
      if (galleryLinks.length === 0) return;

      this.galleries.clear();

      galleryLinks.forEach(function(link) {
        var gallery = link.closest('.article-gallery');
        if (!gallery) return;
        if (!this.galleries.has(gallery)) {
          this.galleries.set(gallery, []);
        }
        this.galleries.get(gallery).push({
          src: link.getAttribute('data-src') || link.href,
          alt: link.getAttribute('data-alt') || ''
        });
      }.bind(this));
    },

    refresh: function() {
      var postContent = document.querySelector('.post-content');
      if (!postContent) return;
      this.processed = false;
      this.processImages(postContent);
      this.bindGalleryLinks();
      this.processed = true;
    }
  };

  // ==================== 说说宫格初始化 ====================

  var MomentsGallery = {
    init: function() {
      var grids = document.querySelectorAll('.pic-grid[data-columns]');
      grids.forEach(function(grid) {
        grid.style.gridTemplateColumns = 'repeat(' + grid.getAttribute('data-columns') + ', 1fr)';
      });
    }
  };

  // ==================== 初始化 ====================

  function initGallery() {
    ArticleGallery.init();
    MomentsGallery.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGallery);
  } else {
    initGallery();
  }

  // Pjax / 主题切换重新初始化
  window.refreshArticleGallery = function () {
    ArticleGallery.refresh();
    MomentsGallery.init();
  };
  document.addEventListener('zs:pjax:loaded', window.refreshArticleGallery);
  document.addEventListener('bloath:pjax:loaded', window.refreshArticleGallery);

})();