// 长说说折叠：仅当正文超过 5 行时收起并显示「展开」，点击切换折叠状态。
// 中短文本（≤ 5 行）保持完整显示，不出现按钮。兼容 Pjax 局部刷新。
(function () {
  'use strict';

  var CLAMP_LINES = 5;

  function scan() {
    document.querySelectorAll('.moment-text').forEach(function (wrap) {
      var body = wrap.querySelector('.post-content');
      if (!body) return;

      // 先解除任何折叠状态，测量真实的自然高度
      wrap.classList.remove('is-collapsed');
      var toggle = wrap.querySelector('.moment-text-toggle');
      if (toggle) toggle.hidden = true;

      var cs = window.getComputedStyle(body);
      var lineHeight = parseFloat(cs.lineHeight);
      if (!lineHeight || isNaN(lineHeight)) return;

      var maxHeight = lineHeight * CLAMP_LINES;
      if (body.scrollHeight > maxHeight) {
        wrap.classList.add('is-collapsed');
        if (toggle) toggle.hidden = false;
      }
    });
  }

  function onClick(e) {
    var btn = e.target.closest('.moment-text-toggle');
    if (!btn) return;
    var wrap = btn.closest('.moment-text');
    if (!wrap) return;
    e.preventDefault();
    wrap.classList.toggle('is-collapsed');
  }

  document.addEventListener('click', onClick);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  // Pjax 局部刷新后重新扫描（main.js 会派发该事件）
  document.addEventListener('zs:pjax:loaded', scan);
})();
