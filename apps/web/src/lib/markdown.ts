import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: false,
})

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderMarkdown(source: string): string {
  return marked.parse(source || '', { async: false })
}

export function renderCommentHtml(source: string): string {
  // 评论仅保留极简换行转义，降低 XSS 面
  return escapeHtml(source || '').replace(/\n/g, '<br>')
}

export function makeExcerpt(source: string, length = 120): string {
  const plain = (source || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[#>*_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length <= length ? plain : `${plain.slice(0, length)}…`
}
