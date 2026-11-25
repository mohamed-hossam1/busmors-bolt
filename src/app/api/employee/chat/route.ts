import type { ModelMessage } from 'ai'
import { requireApiIdentity, apiError } from '@/server/auth'
import { createTraceCollector } from '@/server/observability'
import { runOrchestrator } from '@/server/employee/agents/orchestrator'

export const maxDuration = 60

/**
 * Employee chat entry point (Phase 2).
 *
 * Every live user message flows through the Orchestrator. The workspace id and
 * user identity are derived strictly from the authenticated server session
 * (`requireApiIdentity`); any client-supplied ids are ignored for authorization.
 * A per-request trace collector is attached and flushed off the response path by
 * the runtime (scheduleCollectorFlush), so observability adds no user latency.
 */

function normalizeMessages(body: Record<string, unknown>): ModelMessage[] {
  const raw = body.messages
  if (Array.isArray(raw)) {
    const messages: ModelMessage[] = []
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const role = record.role
      const content = record.content
      if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
        messages.push({ role, content } as ModelMessage)
      }
    }
    if (messages.length > 0) return messages
  }

  const message = body.message
  if (typeof message === 'string' && message.trim()) {
    return [{ role: 'user', content: message } as ModelMessage]
  }
  return []
}

function lastUserText(messages: ModelMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user') {
      const content = (m as { content?: unknown }).content
      if (typeof content === 'string') return content
    }
  }
  return ''
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireApiIdentity(request)

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const messages = normalizeMessages(body)
    if (messages.length === 0) {
      return Response.json({ error: 'A message is required.' }, { status: 400 })
    }

    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null
    const traceId = crypto.randomUUID()
    const collector = createTraceCollector({
      traceId,
      workspaceId: user.id,
      userId: user.id,
      conversationId,
      request: lastUserText(messages),
      route: '/api/employee/chat',
    })

    const result = await runOrchestrator({
      workspaceId: user.id,
      userId: user.id,
      conversationId,
      messages,
      traceContext: { traceId },
      collector,
      supabase,
    })

    return Response.json({
      reply: result.output,
      status: result.status,
      stopReason: result.stopReason,
      usedTools: result.usedTools,
      loadedSkills: result.loadedSkills,
      traceId,
    })
  } catch (error) {
    return apiError(error)
  }
}