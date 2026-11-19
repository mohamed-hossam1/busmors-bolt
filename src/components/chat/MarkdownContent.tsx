'use client'

import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

export function safeMarkdown(content: string): string {
  const parsed = marked.parse(content, { breaks: true, gfm: true })
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
