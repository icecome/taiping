// 明暗切换 + 搜索打开的唯一入口（侧栏按钮 + Cmd/Ctrl+K）
;(function () {
  const root = document.documentElement
  const key = 'taiping-theme'
  try {
    const saved = localStorage.getItem(key)
    if (saved === 'dark' || saved === 'light') {
      root.setAttribute('data-theme', saved)
    }
  } catch (e) {}

  function openSearch() {
    const modal = document.getElementById('search-modal')
    const input = document.getElementById('search-input')
    if (!modal || !input) return
    modal.hidden = false
    input.focus()
  }

  document.querySelectorAll('.theme-toggle:not(.search-toggle)').forEach((btn) => {
    btn.addEventListener('click', () => {
      const current = root.getAttribute('data-theme')
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      const isDark = current ? current === 'dark' : prefersDark
      const next = isDark ? 'light' : 'dark'
      root.setAttribute('data-theme', next)
      try {
        localStorage.setItem(key, next)
      } catch (e) {}
      btn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false')
    })
  })

  document.querySelectorAll('.search-toggle').forEach((btn) => {
    btn.addEventListener('click', openSearch)
  })

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      openSearch()
    }
  })
})()
