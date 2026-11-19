import { requireApiIdentity, apiError } from '@/server/auth'
import { extractKnowledgeFromSite, analyzeSiteKnowledge, prepareSiteKnowledge, saveCrawlKnowledge } from '@/server/crawl'
import { normalizeSiteUrl } from '@/lib/siteUrl'
export const maxDuration = 120

// Bounded, short-lived retry cache, isolated by authenticated workspace.
// Durable knowledge continues to live in Supabase; this is only an optimization.
const completedReads = new Map<string, { expires: number; pagesRead: number; prepared: ReturnType<typeof prepareSiteKnowledge>; analysis: Awaited<ReturnType<typeof analyzeSiteKnowledge>> }>()

export async function POST(request: Request) {
  try {
    const { user } = await requireApiIdentity(request)
    const body = await request.json()
    if (!['read', 'organize'].includes(body.action) || typeof body.url !== 'string' || body.url.length > 2048) {
      return Response.json({ error: 'Invalid website request.' }, { status: 400 })
    }
    let url: string
    try { url = normalizeSiteUrl(body.url) } catch { return Response.json({ error: 'Enter a public website URL.' }, { status: 400 }) }
    const encoder = new TextEncoder()
    const controller = new AbortController()
    const stream = new ReadableStream({
      async start(stream) {
        const send = (event: unknown) => { if (!controller.signal.aborted) stream.enqueue(encoder.encode(JSON.stringify(event) + '\n')) }
        try {
          const key = user.id + ':' + url
          let completed = completedReads.get(key)
          if (!completed || completed.expires < Date.now()) {
            const result = await extractKnowledgeFromSite(url, (read, total, currentUrl) => send({ stage: 'read', read, total, currentUrl }), 10, { forceRefresh: true, signal: controller.signal })
            if (!result.pages_read) throw new Error('No useful website pages were found.')
            const categories = Array.from(new Set(result.candidates.map(c => c.category)))
            send({ stage: 'extract', read: result.pages_read, categories, message: 'Finding business information supported by your website...' })
            const analysis = await analyzeSiteKnowledge(result.pages)
            if (controller.signal.aborted) return
            completed = { expires: Date.now() + 300000, pagesRead: result.pages_read, prepared: prepareSiteKnowledge(result.pages, result.candidates, analysis), analysis }
            if (completedReads.size >= 20) completedReads.delete(completedReads.keys().next().value!)
            completedReads.set(key, completed)
          }
          const { prepared, analysis, pagesRead } = completed
          const categories = Array.from(new Set(prepared.candidates.map(c => c.category)))
          send({ stage: 'extract', read: pagesRead, categories })
          if (body.action === 'read') {
            send({ result: { pages_read: pagesRead, candidates: prepared.candidates, categories } })
          } else {
            send({ stage: 'save', message: 'Saving your business knowledge...', read: pagesRead, categories })
            const counts = await saveCrawlKnowledge(url, prepared.candidates, prepared.relations, pagesRead, analysis.candidates.length > 0 && analysis.warnings.length === 0, user.id)
            completedReads.delete(key)
            send({ result: { success: true, pagesRead, categories, ...counts, warning: counts.warning || (analysis.warnings.length ? analysis.warnings.join(' ') + ' Source-backed suggestions were saved for review; existing knowledge was kept.' : undefined) } })
          }
        } catch (err) {
          console.error('Crawl route processing error:', err)
          send({ error: err instanceof Error ? err.message : 'The website could not be fully read or saved. Your existing knowledge is kept; retry or continue manually.' })
        } finally {
          if (!controller.signal.aborted) stream.close()
        }
      },
      cancel() { controller.abort() },
    })
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'private, no-store', 'X-Accel-Buffering': 'no' } })
  } catch (error) { return apiError(error) }
}
