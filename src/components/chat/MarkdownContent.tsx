import { useMemo } from 'react'
import { marked } from 'marked'

interface MarkdownContentProps {
  content: string
  className?: string
  isUser?: boolean
}

export default function MarkdownContent({ content, className = '', isUser = false }: MarkdownContentProps) {
  const html = useMemo(() => {
    if (!content) return ''
    try {
      const parsed = marked.parse(content, {
        breaks: true,
        gfm: true,
      })
      return typeof parsed === 'string' ? parsed : ''
    } catch {
      return content
    }
  }, [content])

  return (
    <div
      className={`markdown-body ${isUser ? 'is-user text-white' : 'text-ink-800'} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
