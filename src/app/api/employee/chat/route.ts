import type { ModelMessage } from 'ai'
import { requireApiIdentity, apiError } from '@/server/auth'
import { createTraceCollector } from '@/server/observability'
import { runOrchestrator } from '@/server/employee/agents/orchestrator'
import {
  appendMessage,
  conversationExists,
  createConversation,
  loadMessages,
  renameConversation,
  titleFromMessage,
  DEFAULT_CONVERSATION_TITLE,
  type ConversationSupabase,
} from '@/server/employee/conversation-store'
import { ensureNonEmptyReply, isArabicText } from '@/server/employee/reply'
import { createSupabaseHeavyTaskGate } from '@/server/quota/heavy-tasks'
import { describeLiveTraceStep } from '@/server/employee/live-status'
import { projectTraceEvents } from '@/server/employee/trace-projection'

export const maxDuration = 300

/**
 * Employee chat entry point (Phase 3.5).
 *
 * Every live user message flows through the Orchestrator. The workspace id and
 * user identity are derived strictly from the authenticated server session
 * (`requireApiIdentity`); any client-supplied ids are ignored for authorization.
 *
 * This route also owns persistence: it creates/loads the conversation, persists
 * the user + assistant messages (with inline-card metadata), and feeds the full
 * prior history loaded from the database back into the Orchestrator so context
 * survives page reloads. It guarantees a non-empty `reply` and returns clear,
 * structured payloads (brainProposals, clarification, deliverables, drafts).
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
    const workspaceId = user.id
    // The full session client is structurally huge; narrow it to the minimal
    // adapter surface the conversation helpers need (avoids deep instantiation).
    const db = supabase as unknown as ConversationSupabase

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const messages = normalizeMessages(body)
    if (messages.length === 0) {
      return Response.json({ error: 'A message is required.' }, { status: 400 })
    }
    const userText = lastUserText(messages)
    if (!userText.trim()) {
      return Response.json({ error: 'A message is required.' }, { status: 400 })
    }

    // Resolve (or create) the conversation this turn belongs to.
    const requestedId = typeof body.conversationId === 'string' ? body.conversationId : null
    let conversationId: string
    let isNew = false
    if (requestedId) {
      const exists = await conversationExists(db, requestedId, workspaceId)
      if (!exists) {
        return Response.json({ error: 'This conversation could not be found.' }, { status: 404 })
      }
      conversationId = requestedId
    } else {
      const created = await createConversation(db, {
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        user_id: user.id,
        title: DEFAULT_CONVERSATION_TITLE,
      })
      conversationId = created.id
      isNew = true
    }

    // The trace id links the user message, the assistant message and the
    // persisted execution events to the same per-query Canvas.
    const traceId = crypto.randomUUID()

    // Persist the incoming user message (tagged with the trace id), then load the
    // authoritative history (prior turns + this one) from the database.
    await appendMessage(db, {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      role: 'user',
      content: userText,
      metadata: { traceId },
    })
    if (isNew) {
      await renameConversation(db, conversationId, titleFromMessage(userText))
    }

    const history = await loadMessages(db, conversationId)
    const modelMessages: ModelMessage[] = history.map(
      (m) => ({ role: m.role, content: m.content }) as ModelMessage,
    )

    const collector = createTraceCollector({
      traceId,
      workspaceId,
      userId: user.id,
      conversationId,
      request: userText,
      route: '/api/employee/chat',
    })

    const arabic = isArabicText(userText)
    const wantsStream =
      body.stream === true ||
      (request.headers.get('accept') ?? '').includes('text/event-stream')

    if (!wantsStream) {
      const heavyTaskGate = createSupabaseHeavyTaskGate(workspaceId)
      const initialQuota = await heavyTaskGate.getQuota()
      const result = await runOrchestrator({
        workspaceId,
        userId: user.id,
        conversationId,
        messages: modelMessages,
        traceContext: { traceId },
        collector,
        supabase,
        heavyTaskGate,
        heavyTasksRemaining: initialQuota.remaining,
      })

      const updatedQuota = await heavyTaskGate.getQuota()

      // Guarantee a visible, non-empty reply even for tool-only turns.
      const reply = ensureNonEmptyReply(result.output, result.structured, arabic, {
        status: result.status,
        stopReason: result.stopReason,
      })

      await appendMessage(db, {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: 'assistant',
        content: reply,
        metadata: {
          ...result.structured,
          usedTools: result.usedTools,
          loadedSkills: result.loadedSkills,
          status: result.status,
          stopReason: result.stopReason,
          traceId,
        },
      })

      return Response.json({
        reply,
        conversationId,
        status: result.status,
        stopReason: result.stopReason,
        usedTools: result.usedTools,
        loadedSkills: result.loadedSkills,
        traceId,
        events: projectTraceEvents(collector.getEvents()),
        brainProposals: result.structured.brainProposals,
        clarification: result.structured.clarification,
        deliverables: result.structured.deliverables,
        drafts: result.structured.drafts,
        heavyTasks: updatedQuota,
        quotaExhausted: result.structured.quotaExhausted === true,
      })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false
        const emit = (eventName: string, payload: unknown) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`))
          } catch {
            closed = true
          }
        }

        let lastStatus = arabic ? 'فهم طلبك ومراجعة السياق...' : 'Understanding your request...'
        emit('init', { traceId, conversationId })
        emit('status', { label: lastStatus })

        const unsubscribe = collector.subscribe((traceEvent) => {
          const nextLabel = describeLiveTraceStep(traceEvent, arabic)
          if (nextLabel && nextLabel !== lastStatus) {
            lastStatus = nextLabel
            emit('status', { label: nextLabel })
          }
          if (
            traceEvent.event_type === 'agent' ||
            traceEvent.event_type === 'tool' ||
            traceEvent.event_type === 'skill'
          ) {
            emit('trace', { events: projectTraceEvents(collector.getEvents()) })
          }
        })

        try {
          const heavyTaskGate = createSupabaseHeavyTaskGate(workspaceId)
          const initialQuota = await heavyTaskGate.getQuota()
          const result = await runOrchestrator({
            workspaceId,
            userId: user.id,
            conversationId,
            messages: modelMessages,
            traceContext: { traceId },
            collector,
            abortSignal: request.signal,
            supabase,
            heavyTaskGate,
            heavyTasksRemaining: initialQuota.remaining,
          })

          const updatedQuota = await heavyTaskGate.getQuota()

          const reply = ensureNonEmptyReply(result.output, result.structured, arabic, {
            status: result.status,
            stopReason: result.stopReason,
          })

          await appendMessage(db, {
            id: crypto.randomUUID(),
            conversation_id: conversationId,
            role: 'assistant',
            content: reply,
            metadata: {
              ...result.structured,
              usedTools: result.usedTools,
              loadedSkills: result.loadedSkills,
              status: result.status,
              stopReason: result.stopReason,
              traceId,
            },
          })

          emit('done', {
            reply,
            conversationId,
            status: result.status,
            stopReason: result.stopReason,
            usedTools: result.usedTools,
            loadedSkills: result.loadedSkills,
            traceId,
            events: projectTraceEvents(collector.getEvents()),
            brainProposals: result.structured.brainProposals,
            clarification: result.structured.clarification,
            deliverables: result.structured.deliverables,
            drafts: result.structured.drafts,
            heavyTasks: updatedQuota,
            quotaExhausted: result.structured.quotaExhausted === true,
          })
        } catch (err) {
          emit('error', {
            error: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
          })
        } finally {
          unsubscribe()
          if (!closed) {
            closed = true
            try {
              controller.close()
            } catch {
              // ignore already closed
            }
          }
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    return apiError(error)
  }
}