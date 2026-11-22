import { supabase } from './supabase'
import type { ExtractedCandidate } from './crawlContent'
export const DEFAULT_CRAWL_PAGES = 5
export type { CrawledPage, ExtractedCandidate } from './crawlContent'

export interface CrawlProgressEvent {
  stage: string
  read?: number
  total?: number
  message?: string
  currentUrl?: string
  categories?: string[]
}

interface WebsiteKnowledge {
  pages_read: number
  candidates: ExtractedCandidate[]
  categories?: string[]
}

export interface OrganizeResult {
  success: boolean
  nodesCount: number
  edgesCount: number
  pagesRead?: number
  categories?: string[]
  error?: string
  warning?: string
}

export async function crawlRequest<T>(
  body: Record<string, unknown>,
  onProgress?: (event: CrawlProgressEvent) => void,
  signal?: AbortSignal
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  try {
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`
    }
  } catch {}

  const response = await fetch('/api/crawl', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok || !response.body) {
    let errMessage = 'Website reading could not start. Sign in and retry.'
    try {
      const errData = await response.json()
      if (errData?.error) errMessage = errData.error
    } catch {}
    throw new Error(errMessage)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      pending += decoder.decode(value, { stream: !done })
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) {
        if (!line) continue
        const event = JSON.parse(line)
        if (event.error) throw new Error(event.error)
        if (event.result !== undefined) return event.result as T
        onProgress?.(event)
      }
      if (done) throw new Error('Website reading ended before completion. Retry to continue.')
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export function readWebsiteKnowledge(
  url: string,
  onProgress?: (stage: string, read: number, currentUrl?: string, categories?: string[]) => void,
  signal?: AbortSignal
) {
  return crawlRequest<WebsiteKnowledge>(
    { action: 'read', url },
    event => onProgress?.(event.stage, event.read ?? 0, event.currentUrl, event.categories),
    signal
  )
}

export async function organizeBrainWithAi(
  url: string,
  _workspaceId: string,
  onProgress?: ((event: CrawlProgressEvent) => void) | ((status: string) => void)
): Promise<OrganizeResult> {
  try {
    return await crawlRequest<OrganizeResult>({ action: 'organize', url }, (event) => {
      if (!onProgress) return
      const text = event.message ?? (event.stage === 'extract' ? 'Extracting supported business knowledge...' : `Reading website (${event.read ?? 0}/${event.total ?? DEFAULT_CRAWL_PAGES} pages)...`)
      try {
        ;(onProgress as (e: CrawlProgressEvent, s: string) => void)(event, text)
      } catch {}
    })
  } catch (error) {
    return {
      success: false,
      nodesCount: 0,
      edgesCount: 0,
      error: error instanceof Error ? error.message : 'Could not organize website knowledge.',
    }
  }
}
