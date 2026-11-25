'use client'

import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

/**
 * Normalize malformed model bullets before markdown parsing.
 *
 * Models frequently emit bullets with no space after the marker (e.g.
 * `*المنصات` or `-مشروع`) or use a raw `•` glyph. `marked` only treats a marker
 * as a list item when it is followed by a space, so without this the literal
 * `*`/`-`/`•` bleeds into the rendered text. We insert the missing space and
 * rewrite `•` to a standard `-`, while leaving already-valid markers, `**bold**`,
 * thematic breaks (`---`) and indentation untouched.
 */
export function normalizeBullets(input: string): string {
  if (!input) return input
  return input
    .split('\n')
    .map((line) => {
      const bullet = line.match(/^(\s*)•\s*(.*)$/)
      if (bullet) return `${bullet[1]}- ${bullet[2]}`.trimEnd()
      const star = line.match(/^(\s*)\*(?!\s|\*)(\S.*)$/)
      if (star) return `${star[1]}* ${star[2]}`.trimEnd()
      const dash = line.match(/^(\s*)([-+])(?![-+\s])(\S.*)$/)
      if (dash) return `${dash[1]}${dash[2]} ${dash[3]}`.trimEnd()
      return line
    })
    .join('\n')
}

export function safeMarkdown(content: string): string {
  const parsed = marked.parse(normalizeBullets(content), { breaks: true, gfm: true })
  const html = DOMPurify.sanitize(typeof parsed === 'string' ? parsed : '', {
    ALLOWED_TAGS: ['p','br','strong','em','del','blockquote','pre','code','h1','h2','h3','h4','h5','h6','ul','ol','li','hr','a','table','thead','tbody','tr','th','td'],
    ALLOWED_ATTR: ['href','title'],
    ALLOW_DATA_ATTR: false,
  })
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll('a').forEach(link => {
    const href = link.getAttribute('href') ?? ''
    if (!/^(https?:\/\/|mailto:|\/[^/]|#)/i.test(href)) link.removeAttribute('href')
    if (/^https?:\/\//i.test(href)) { link.target = '_blank'; link.rel = 'noopener noreferrer' }
  })
  return template.innerHTML
}

interface MarkdownContentProps {
  content: string
  className?: string
  isUser?: boolean
}

export default function MarkdownContent({ content, className = '', isUser = false }: MarkdownContentProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const html = useMemo(() => {
    if (!mounted) return content.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

    if (!content) return ''
    try {
      return safeMarkdown(content)
    } catch {
      return DOMPurify.sanitize(content, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    }
  }, [content, mounted])

  return (
    <div
      className={`markdown-body ${isUser ? 'is-user text-white' : 'text-ink-800'} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
