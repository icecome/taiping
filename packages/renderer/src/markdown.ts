import MarkdownIt from 'markdown-it'
import sanitizeHtml from 'sanitize-html'
import { excerptOf } from '@taiping/shared-utils/string'
import { readingTimeLabel } from '@taiping/shared-utils/reading-time'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
})

export function renderMarkdown(source: string): string {
  if (!source) return ''
  return md.render(source)
}

export function sanitizeRenderedHtml(html: string): string {
  if (!html) return ''
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'h1',
      'h2',
      'figure',
      'figcaption',
      'details',
      'summary',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'name', 'target', 'rel', 'class'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'class'],
      code: ['class'],
      span: ['class'],
      div: ['class'],
      details: ['open'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  })
}

export function renderMarkdownSafe(source: string): string {
  return sanitizeRenderedHtml(renderMarkdown(source))
}

export function deriveExcerpt(contentMd: string, maxLength = 160): string {
  return excerptOf(contentMd, maxLength)
}

export function deriveReadingTime(contentMd: string): string {
  return readingTimeLabel(contentMd)
}

export function extractHeadings(html: string): Array<{ level: number; text: string; id: string }> {
  const headings: Array<{ level: number; text: string; id: string }> = []
  const re = /<h([1-3])[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/gi
  let match = re.exec(html)
  while (match) {
    const level = Number(match[1])
    const id = match[2] ?? ''
    const text = (match[3] ?? '').replace(/<[^>]+>/g, '').trim()
    if (id && text) headings.push({ level, text, id })
    match = re.exec(html)
  }
  return headings
}
