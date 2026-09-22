/**
 * 说说行内留言：点击「留言」懒构建表单（OverType），默认不残留展示框
 * 提交到本项目 POST /api/comments
 */
(function () {
  'use strict'

  var CF = window.TaipingCommentForm
  if (!CF) return

  var form = null
  var anchorItem = null
  var editorInstance = null
  var isSubmitting = false

  function tryInitEditor() {
    var container = form ? form.querySelector('#mc-editor') : null
    if (!container || editorInstance) return !!editorInstance
    editorInstance = CF.initEditor(container, {
      placeholder: '支持 Markdown 语法',
      minHeight: 120,
      maxHeight: 280,
    })
    return !!editorInstance
  }

  function buildForm() {
    editorInstance = null
    form = document.createElement('form')
    form.className = 'guestbook-form moment-comment-form'
    form.autocomplete = 'off'
    form.innerHTML =
      '<div class="guestbook-row">' +
      '<div class="guestbook-field guestbook-field--third">' +
      '<label class="guestbook-label">昵称（必填） *</label>' +
      '<input class="guestbook-input" name="nickname" type="text" maxlength="40" placeholder="你的昵称" required>' +
      '</div>' +
      '<div class="guestbook-field guestbook-field--third">' +
      '<label class="guestbook-label">邮箱（选填）</label>' +
      '<input class="guestbook-input" name="email" type="email" placeholder="用于接收留言答复">' +
      '</div>' +
      '<div class="guestbook-field guestbook-field--third">' +
      '<label class="guestbook-label">站点地址（选填）</label>' +
      '<input class="guestbook-input" name="website" type="text" inputmode="url" placeholder="https://blog.example.com">' +
      '</div>' +
      '</div>' +
      '<div class="guestbook-field">' +
      '<label class="guestbook-label">内容（必填） *</label>' +
      '<div id="mc-editor" class="guestbook-editor"></div>' +
      '</div>' +
      '<div class="guestbook-submit-row">' +
      '<button class="guestbook-submit" type="submit">提交留言</button>' +
      '<span class="guestbook-status form-message" role="status" hidden></span>' +
      '</div>'
    form.addEventListener('submit', function (e) {
      e.preventDefault()
      submit()
    })
    CF.ensureEditor(tryInitEditor)
  }

  function toggleForm(item, momentId) {
    if (!form) buildForm()
    if (anchorItem === item && form.parentNode === item) {
      form.remove()
      anchorItem = null
      return
    }
    item.appendChild(form)
    anchorItem = item
    form.dataset.targetId = momentId
    CF.setStatus(form, '')
    try {
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    } catch (e) {
      form.scrollIntoView()
    }
    var nick = form.querySelector('[name="nickname"]')
    if (nick) nick.focus()
  }

  function submit() {
    if (!form || isSubmitting) return
    var fd = new FormData(form)
    var nickname = String(fd.get('nickname') || '').trim()
    var content = CF.getContent(editorInstance, '#mc-editor textarea')
    if (!nickname) {
      CF.setStatus(form, '请填写昵称')
      return
    }
    if (!content) {
      CF.setStatus(form, '请填写留言内容')
      return
    }
    var payload = {
      targetType: 'moment',
      targetId: form.dataset.targetId || '',
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
  }

  document.querySelectorAll('.moment-comment-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-id')
      var card = btn.closest('.article-item--moment')
      if (!id || !card) return
      toggleForm(card, id)
    })
  })
})()
