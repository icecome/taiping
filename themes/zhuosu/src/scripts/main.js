document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    const modal = document.getElementById('search-modal')
    const input = document.getElementById('search-input')
    if (!modal || !input) return
    modal.hidden = false
    input.focus()
  }
})

document.querySelectorAll('.moment-text').forEach((block) => {
  const content = block.querySelector('.post-content')
  const toggle = block.querySelector('.moment-text-toggle')
  if (!content || !toggle) return
  const lineHeight = parseFloat(getComputedStyle(content).lineHeight) || 28
  if (content.scrollHeight > lineHeight * 5) {
    toggle.hidden = false
  }
  toggle.addEventListener('click', () => {
    block.classList.toggle('is-collapsed')
  })
})
