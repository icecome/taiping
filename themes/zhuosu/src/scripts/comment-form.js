/**
 * 评论表单共享工具：主题检测 / OverType 初始化 / 取值 / 状态 / 提交
 * 供 moment.js 与 guestbook.js 复用
 */
(function () {
  'use strict'

  function isDark() {
    var theme = document.documentElement.getAttribute('data-theme')
    return (
      theme === 'dark' ||
      (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    )
  }

  function initEditor(container, options) {
    if (!container) return null
    var OT = window.OverType ? window.OverType.default || window.OverType : null
    if (!OT) return null
    try {
      var inst = new OT(
        container,
        Object.assign(
          {
            theme: isDark() ? 'cave' : 'solar',
            toolbar: true,
            autoResize: true,
            smartLists: true,
          },
          options || {},
        ),
      )
      return Array.isArray(inst) ? inst[0] : inst
    } catch (e) {
      return null
    }
  }

  function ensureEditor(factory) {
    if (factory()) return
    var tries = 0
    var timer = setInterval(function () {
      tries++
      if (factory() || tries >= 50) clearInterval(timer)
    }, 200)
  }

  function getContent(editorInstance, fallbackSelector) {
    if (editorInstance) {
      try {
        var v = editorInstance.getValue()
        if (v && v.trim()) return v.trim()
      } catch (e) {}
    }
    var t = document.querySelector(fallbackSelector)
    return t && t.value ? t.value.trim() : ''
  }

  function setStatus(root, msg) {
    var el = root ? root.querySelector('.form-message') : null
    if (!el) return
    el.hidden = !msg
    el.textContent = msg
  }

  function submitComment(payload, callbacks) {
    return fetch('/api/comments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json()
      })
      .then(function (json) {
        if (json && json.ok) {
          if (callbacks && callbacks.onSuccess) callbacks.onSuccess(json)
        } else {
          if (callbacks && callbacks.onError) {
            callbacks.onError((json && json.error && json.error.message) || '提交失败')
          }
        }
      })
      .catch(function () {
        if (callbacks && callbacks.onError) callbacks.onError('网络异常，请稍后重试')
      })
  }

  window.TaipingCommentForm = {
    isDark: isDark,
    initEditor: initEditor,
    ensureEditor: ensureEditor,
    getContent: getContent,
    setStatus: setStatus,
    submitComment: submitComment,
  }
})()
