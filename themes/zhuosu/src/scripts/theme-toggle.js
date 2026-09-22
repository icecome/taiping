;(function () {
  const root = document.documentElement
  const key = 'taiping-theme'
  const saved = localStorage.getItem(key)
  if (saved === 'dark' || saved === 'light') {
    root.setAttribute('data-theme', saved)
  }

  document.querySelectorAll('.theme-toggle:not(.search-toggle)').forEach((btn) => {
    btn.addEventListener('click', () => {
      const current = root.getAttribute('data-theme')
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      const isDark = current ? current === 'dark' : prefersDark
      const next = isDark ? 'light' : 'dark'
      root.setAttribute('data-theme', next)
      localStorage.setItem(key, next)
      btn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false')
    })
  })

  document.querySelectorAll('.search-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('search-modal')
      const input = document.getElementById('search-input')
      if (!modal || !input) return
      modal.hidden = false
      input.focus()
    })
  })
})()
