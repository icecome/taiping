/**
 * 留言板：OverType 编辑器 + 本项目 /api/comments
 */
(function () {
  'use strict'

  var form = document.querySelector('.guestbook-form[data-target-type="guestbook"]')
  var list = document.querySelector('.guestbook-section .guestbook-list')
  if (!form) return

  var editorId = 'gb-editor'
  var editorInstance = null
  var isSubmitting = false

  function isDark() {
    var theme = document.documentElement.getAttribute('data-theme')
    return (
      theme === 'dark' ||
      (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    )
  }

  function initEditor() {
    var container = document.getElementById(editorId)
    if (!container || editorInstance) return !!editorInstance
    var OT = window.OverType ? window.OverType.default || window.OverType : null
    if (!OT) return false
    try {
      var inst = new OT(container, {
        placeholder:
          '支持 Markdown 语法，例如：\n**加粗文本**\n*斜体文本*\n`行内代码`\n[链接文字](https://www.example.com)\n# 一级标题\n## 二级标题\n- 无序列表项\n1. 有序列表项\n> 引用一段话',
        theme: isDark() ? 'cave' : 'solar',
        toolbar: true,
        autoResize: true,
        minHeight: 200,
        maxHeight: 360,
        smartLists: true,
      })
      editorInstance = Array.isArray(inst) ? inst[0] : inst
      return !!editorInstance
    } catch (e) {
      return false
    }
  }

  function ensureEditor() {
    if (initEditor()) return
    var tries = 0
    var timer = setInterval(function () {
      tries++
      if (initEditor() || tries >= 50) clearInterval(timer)
    }, 200)
  }

  function syncTheme() {
    if (editorInstance && typeof editorInstance.setTheme === 'function') {
      try {
        editorInstance.setTheme(isDark() ? 'cave' : 'solar')
      } catch (e) {}
    }
  }

  function getContent() {
    if (editorInstance) {
      try {
        var v = editorInstance.getValue()
        if (v && v.trim()) return v.trim()
      } catch (e) {}
    }
    var t = document.querySelector('#' + editorId + ' textarea')
    return t && t.value ? t.value.trim() : ''
  }

  function setStatus(msg) {
    var el = form.querySelector('.form-message')
    if (!el) return
    el.hidden = !msg
    el.textContent = msg
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault()
    if (isSubmitting) return
    var fd = new FormData(form)
    var nickname = String(fd.get('nickname') || '').trim()
    var content = getContent()
    if (!nickname) {
      setStatus('请填写昵称')
      return
    }
    if (!content) {
      setStatus('请填写留言内容')
      return
    }
    var payload = {
      targetType: form.getAttribute('data-target-type') || 'guestbook',
      targetId: form.getAttribute('data-target-id') || 'guestbook',
      nickname: nickname,
      email: String(fd.get('email') || ''),
      website: String(fd.get('website') || ''),
      content: content,
    }
    isSubmitting = true
    var btn = form.querySelector('.guestbook-submit')
    if (btn) btn.disabled = true
    setStatus('提交中…')
    fetch('/api/comments', {
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
          setStatus(json.data && json.data.message ? json.data.message : '已提交，待审核')
          form.reset()
          if (editorInstance && editorInstance.setValue) {
            try {
              editorInstance.setValue('')
            } catch (e) {}
          }
        } else {
          setStatus((json && json.error && json.error.message) || '提交失败')
        }
      })
      .catch(function () {
        setStatus('网络异常，请稍后重试')
      })
      .finally(function () {
        isSubmitting = false
        if (btn) btn.disabled = false
      })
  })

  ensureEditor()

  if (!window.__gbThemeObserver) {
    window.__gbThemeObserver = true
    var obs = new MutationObserver(function () {
      syncTheme()
    })
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
  }
})()
