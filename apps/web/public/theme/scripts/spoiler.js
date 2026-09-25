/* 隐藏文本组件 - 自动将 !!内容!! 转换为黑色色块遮盖 */
(function() {
  'use strict';

  function processSpoiler() {
    var pattern = /!!([\s\S]+?)!!/g;
    var walker = document.createTreeWalker(
      document.querySelector('.post-content') || document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    var textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (var i = 0; i < textNodes.length; i++) {
      var node = textNodes[i];
      if (pattern.test(node.textContent)) {
        pattern.lastIndex = 0;
        var span = document.createElement('span');
        span.innerHTML = node.textContent.replace(pattern, '<span class="spoiler-text">$1</span>');
        node.parentNode.replaceChild(span, node);
      }
    }
  }

  document.addEventListener('DOMContentLoaded', processSpoiler);
  document.addEventListener('zs:pjax:loaded', processSpoiler);
  document.addEventListener('bloath:pjax:loaded', processSpoiler);
})();
