;(function () {
  const modal = document.getElementById('search-modal')
  const input = document.getElementById('search-input')
  const results = document.getElementById('search-results')
  if (!modal || !input || !results) return

  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.hidden = true
  })

  let timer = 0
  input.addEventListener('input', () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(async () => {
      const q = input.value.trim()
      if (!q) {
        results.innerHTML = ''
        return
      }
      try {
        const res = await fetch('/api/search?q=' + encodeURIComponent(q))
        const json = await res.json()
        if (!json.ok) {
          results.innerHTML = '<li>搜索失败</li>'
          return
        }
        const items = json.data.items || []
        if (!items.length) {
          results.innerHTML = '<li>没有匹配结果</li>'
          return
        }
        results.innerHTML = items
          .map(
            (item) =>
              '<li><a href="' +
              escapeAttr(item.url) +
              '">' +
              escapeHtml(item.title) +
              '</a><div>' +
              escapeHtml(item.excerpt || '') +
              '</div></li>',
          )
          .join('')
      } catch (error) {
        results.innerHTML = '<li>搜索请求失败</li>'
        console.error(error)
      }
    }, 250)
  })

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function escapeAttr(text) {
    return escapeHtml(text).replace(/'/g, '&#39;')
  }
})()
