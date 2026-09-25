/**
 * 留言板：OverType 编辑器 + 本项目 /api/comments
 */
(function () {
  'use strict'

  var CF = window.TaipingCommentForm
  if (!CF) return

  var form = document.querySelector('.guestbook-form[data-target-type="guestbook"]')
  if (!form) return

  var editorId = 'gb-editor'
  var editorInstance = null
  var isSubmitting = false

  function tryInitEditor() {
    var container = document.getElementById(editorId)
    if (!container || editorInstance) return !!editorInstance
    editorInstance = CF.initEditor(container, {
      placeholder:
        '支持 Markdown 语法，例如：\n**加粗文本**\n*斜体文本*\n`行内代码`\n[链接文字](https://www.example.com)\n# 一级标题\n## 二级标题\n- 无序列表项\n1. 有序列表项\n> 引用一段话',
      minHeight: 200,
      maxHeight: 360,
    })
    return !!editorInstance
  }

  function syncTheme() {
    if (editorInstance && typeof editorInstance.setTheme === 'function') {
      try {
        editorInstance.setTheme(CF.isDark() ? 'cave' : 'solar')
      } catch (e) {}
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault()
    if (isSubmitting) return
    var fd = new FormData(form)
    var nickname = String(fd.get('nickname') || '').trim()
    var content = CF.getContent(editorInstance, '#' + editorId + ' textarea')
    if (!nickname) {
      CF.setStatus(form, '请填写昵称')
      return
    }
    if (!content) {
      CF.setStatus(form, '请填写留言内容')
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
    CF.setStatus(form, '提交中…')
    CF.submitComment(payload, {
      onSuccess: function (json) {
        CF.setStatus(form, json.data && json.data.message ? json.data.message : '已提交，待审核')
        form.reset()
        if (editorInstance && editorInstance.setValue) {
          try {
            editorInstance.setValue('')
          } catch (e) {}
        }
      },
      onError: function (msg) {
        CF.setStatus(form, msg)
      },
    }).finally(function () {
      isSubmitting = false
      if (btn) btn.disabled = false
    })
  })

  CF.ensureEditor(tryInitEditor)

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
