'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, MessageSquare, Network, PanelLeft, Send, X } from 'lucide-react'
import { useCopy } from '../hooks/useCopy'
import AgentCanvas from '../components/chat/AgentCanvas'
import MarkdownContent from '../components/chat/MarkdownContent'
import ThinkingIndicator from '../components/chat/ThinkingIndicator'
import BrainApprovalCard from '../components/chat/BrainApprovalCard'
import ClarificationCardView from '../components/chat/ClarificationCard'
import ReferenceCards from '../components/chat/ReferenceCards'
import ChatHistorySidebar from '../components/chat/ChatHistorySidebar'
import type { CanvasEvent } from '../components/chat/AgentCanvas'
import type {
  BrainProposalCardData,
  ChatMessage,
  ClarificationCard,
  ConversationSummary,
  DeliverableRefData,
  DraftRefData,
} from '../components/chat/employeeCards'

interface ChatApiResponse {
  reply?: string
  error?: string
  conversationId?: string
  brainProposals?: BrainProposalCardData[]
  clarification?: ClarificationCard | null
  deliverables?: DeliverableRefData[]
  drafts?: DraftRefData[]
  traceId?: string
  status?: string
  stopReason?: string
  events?: CanvasEvent[]
}

const STARTERS = [
  { key: 'starterBrain' as const },
  { key: 'starterAdvice' as const },
  { key: 'starterPost' as const },
  { key: 'starterStrategy' as const },
]

export default function EmployeePage() {
  const { t } = useCopy()
  const searchParams = useSearchParams()
  const [mobileTab, setMobileTab] = useState<'chat' | 'canvas'>('chat')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)

  // Per-query Canvas binding: the selected trace drives the Canvas, and the
  // matching chat message is highlighted. Events are cached per trace id so a
  // click is instant after the first load.
  const [canvasEvents, setCanvasEvents] = useState<CanvasEvent[]>([])
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)
  const [selectedUserMessage, setSelectedUserMessage] = useState<string | null>(null)
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null)
  const traceCacheRef = useRef<Map<string, CanvasEvent[]>>(new Map())

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const autoRanRef = useRef(false)

  const loadConversations = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const response = await fetch('/api/employee/conversations')
      const data = (await response.json()) as { conversations?: ConversationSummary[]; error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Could not load chat history.')
      setConversations(data.conversations ?? [])
    } catch (err) {
      // Non-fatal: the chat still works without the sidebar list.
      setConversations((current) => current)
      void err
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (messages.length > 0 || sending) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages, sending])

  const selectTrace = useCallback(async (traceId: string, messageId: string, userText: string) => {
    setSelectedTraceId(traceId)
    setActiveMessageId(messageId)
    setSelectedUserMessage(userText)
    const cached = traceCacheRef.current.get(traceId)
    if (cached) {
      setCanvasEvents(cached)
      return
    }
    try {
      const response = await fetch(`/api/employee/trace/${traceId}`)
      const data = (await response.json()) as { events?: CanvasEvent[]; error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Could not load trace.')
      const events = data.events ?? []
      traceCacheRef.current.set(traceId, events)
      setCanvasEvents(events)
    } catch {
      setCanvasEvents([])
    }
  }, [])

  const resetCanvas = useCallback(() => {
    setSelectedTraceId(null)
    setActiveMessageId(null)
    setSelectedUserMessage(null)
    setCanvasEvents([])
  }, [])

  const selectConversation = useCallback(async (id: string): Promise<ChatMessage[]> => {
    setActiveId(id)
    setError(null)
    setHistoryOpen(false)
    resetCanvas()
    try {
      const response = await fetch(`/api/employee/conversations/${id}`)
      const data = (await response.json()) as { messages?: Array<{ id: string; role: 'user' | 'assistant'; content: string; metadata?: ChatMessage['metadata'] }>; error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Could not load this conversation.')
      const loaded: ChatMessage[] = (data.messages ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        metadata: m.metadata,
      }))
      setMessages(loaded)
      return loaded
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this conversation.')
      return []
    }
  }, [resetCanvas])

  const newChat = useCallback(() => {
    setActiveId(null)
    setMessages([])
    setError(null)
    setInput('')
    setHistoryOpen(false)
    setMobileTab('chat')
    resetCanvas()
  }, [resetCanvas])

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/employee/conversations/${id}`, { method: 'DELETE' })
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error ?? 'Could not delete this conversation.')
        }
        if (id === activeId) newChat()
        await loadConversations()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not delete this conversation.')
      }
    },
    [activeId, loadConversations, newChat],
  )

  const send = async (override?: string, context?: { conversationId: string; baseMessages: ChatMessage[] }) => {
    const text = (override ?? input).trim()
    if (!text || sending) return
    const baseMessages = context?.baseMessages ?? messages
    const conversationId = context?.conversationId ?? activeId
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const nextMessages: ChatMessage[] = [...baseMessages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    setError(null)
    try {
      const response = await fetch('/api/employee/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })
      const data = (await response.json()) as ChatApiResponse
      if (!response.ok || data.error) {
        throw new Error(data.error ?? 'Something went wrong. Please try again.')
      }
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply && data.reply.trim() ? data.reply : t('emptyReplyFallback'),
        metadata: {
          brainProposals: data.brainProposals,
          clarification: data.clarification,
          deliverables: data.deliverables,
          drafts: data.drafts,
          traceId: data.traceId,
          status: data.status,
          stopReason: data.stopReason,
        },
      }
      const boundMessages = nextMessages.map((m) =>
        m.id === userMessage.id && data.traceId ? { ...m, metadata: { ...m.metadata, traceId: data.traceId } } : m,
      )
      setMessages([...boundMessages, assistantMessage])
      if (data.conversationId) setActiveId(data.conversationId)
      if (data.traceId) {
        const events = data.events ?? []
        traceCacheRef.current.set(data.traceId, events)
        setSelectedTraceId(data.traceId)
        setActiveMessageId(assistantMessage.id)
        setSelectedUserMessage(text)
        setCanvasEvents(events)
      }
      void loadConversations()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      setError(message)
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'assistant', content: message, error: true },
      ])
    } finally {
      setSending(false)
    }
  }

  // Phase 4: deep-link from a roadmap step. Open the thread directly when a
  // conversationId is supplied, prefill the composer with the prompt, and
  // optionally auto-send once (guarded so it can never double-send).
  useEffect(() => {
    const conversationId = searchParams.get('conversationId')
    const prompt = searchParams.get('prompt')
    const autorun = searchParams.get('autorun') === '1'
    if (!conversationId && !prompt) return
    let cancelled = false
    void (async () => {
      let baseMessages: ChatMessage[] = []
      if (conversationId) baseMessages = await selectConversation(conversationId)
      if (cancelled) return
      if (prompt) {
        setInput(prompt)
        if (autorun && !autoRanRef.current && baseMessages.length === 0) {
          autoRanRef.current = true
          await send(prompt, { conversationId: conversationId ?? '', baseMessages })
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // Run once on mount; searchParams is stable for the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="employee-workspace flex h-full min-h-0 flex-col overflow-hidden lg:flex-row">
      {/* Mobile/Tablet Tab Switcher */}
      <div className="flex shrink-0 border-b border-ink-200 bg-white px-3 py-2 lg:hidden">
        <div className="flex w-full rounded-xl bg-ink-100 p-1">
          <button
            type="button"
            onClick={() => setMobileTab('chat')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-semibold transition-all ${
              mobileTab === 'chat' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <MessageSquare size={14} />
            <span>{t('chatTab')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('canvas')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-semibold transition-all ${
              mobileTab === 'canvas' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <Network size={14} />
            <span>{t('canvasTitle')}</span>
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ChatHistorySidebar
          open={historyOpen}
          conversations={conversations}
          activeId={activeId}
          loading={historyLoading}
          onSelect={(id) => void selectConversation(id)}
          onNew={newChat}
          onDelete={(id) => void deleteConversation(id)}
          onClose={() => setHistoryOpen(false)}
        />

        {/* Chat Column Shell */}
        <div
          className={`employee-chat ${
            mobileTab === 'chat' ? 'flex' : 'hidden'
          } w-full min-w-0 flex-1 flex-col lg:me-3 lg:flex xl:me-[18px]`}
        >
          <div className="employee-panel-header flex shrink-0 items-center justify-between gap-2 px-3.5 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHistoryOpen((open) => !open)}
                aria-label={t('chatHistory')}
                aria-expanded={historyOpen}
                className={`rounded-lg p-1.5 transition-colors ${
                  historyOpen
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900'
                }`}
              >
                <PanelLeft size={16} />
              </button>
              <span className="truncate text-xs font-medium text-ink-600">{t('chatTab')}</span>
            </div>
          </div>

          {error && (
            <div className="mx-3.5 mt-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 sm:mx-5">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label={t('dismiss')} className="rounded p-0.5 hover:bg-red-100">
                <X size={13} />
              </button>
            </div>
          )}

          <div className="sleek-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            {messages.length === 0 && !sending ? (
              <div className="flex flex-1 flex-col justify-between gap-4">
                <div className="flex justify-start">
                  <div className="max-w-[88%] rounded-2xl rounded-ss-md bg-ink-100 px-4 py-2.5 text-sm leading-relaxed text-ink-900">
                    {t('greetingProactive')}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-start gap-2 pt-2">
                  {STARTERS.map((starter) => (
                    <button
                      key={starter.key}
                      type="button"
                      onClick={() => void send(t(starter.key))}
                      className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800"
                    >
                      {t(starter.key)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((message, index) => {
                  const traceId = message.metadata?.traceId
                  const isActive = message.id === activeMessageId
                  const userText =
                    message.role === 'user'
                      ? message.content
                      : [...messages.slice(0, index)].reverse().find((m) => m.role === 'user')?.content ?? ''
                  const onSelect = () => {
                    if (traceId) void selectTrace(traceId, message.id, userText)
                  }
                  return message.role === 'user' ? (
                    <div key={message.id} className="flex justify-end">
                      <button
                        type="button"
                        onClick={onSelect}
                        disabled={!traceId}
                        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-se-md px-4 py-2 text-left text-sm text-white transition-shadow ${
                          isActive ? 'bg-primary-600 ring-2 ring-primary-300 ring-offset-1' : 'bg-primary-500'
                        } ${traceId ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        {message.content}
                      </button>
                    </div>
                  ) : (
                    <div key={message.id} className="flex justify-start">
                      <div
                        onClick={onSelect}
                        className={`max-w-[88%] rounded-2xl rounded-ss-md px-4 py-2.5 text-sm transition-shadow ${
                          message.error ? 'border border-red-200 bg-red-50 text-red-700' : 'bg-ink-100 text-ink-900'
                        } ${isActive ? 'ring-2 ring-primary-300 ring-offset-1' : ''} ${traceId ? 'cursor-pointer' : ''}`}
                      >
                        {message.error ? (
                          <p className="flex items-start gap-1.5">
                            <AlertCircle size={14} className="mt-0.5 shrink-0" /> {message.content}
                          </p>
                        ) : (
                          <>
                            <MarkdownContent content={message.content} className="text-sm leading-relaxed" />
                            {message.metadata?.clarification && (
                              <ClarificationCardView
                                card={message.metadata.clarification}
                                disabled={sending}
                                onSubmit={(answer) => void send(answer)}
                              />
                            )}
                            {message.metadata?.brainProposals?.map((proposal) => (
                              <BrainApprovalCard key={proposal.proposalId} proposal={proposal} />
                            ))}
                            <ReferenceCards
                              deliverables={message.metadata?.deliverables}
                              drafts={message.metadata?.drafts}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
                {sending && <ThinkingIndicator />}
                <div ref={bottomRef} className="h-px shrink-0" />
              </>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
            className="employee-composer flex gap-2 p-3 sm:p-4"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label={t('messageDirectorAriaLabel')}
              placeholder={t('chatPlaceholder')}
              className="input-field flex-1"
              disabled={sending}
            />
            <button
              type="submit"
              aria-label={t('sendMessageAriaLabel')}
              disabled={sending || !input.trim()}
              className="btn-primary flex h-10 shrink-0 items-center justify-center px-4 sm:h-11"
            >
              <Send size={16} />
            </button>
          </form>
        </div>

        {/* Live Agent Canvas Column */}
        <div
          className={`employee-canvas ${
            mobileTab === 'canvas' ? 'flex' : 'hidden'
          } w-full min-w-0 flex-1 flex-col lg:flex lg:w-2/5`}
        >
          <div className="employee-panel-header hidden items-center gap-2 px-6 py-3 text-sm font-medium text-ink-900 lg:flex">
            <Network size={16} className="text-primary-500" />
            {t('canvasTitle')}
          </div>
          <div className="min-h-0 flex-1">
            <AgentCanvas
              key={selectedTraceId ?? 'empty'}
              conversationId={activeId}
              events={canvasEvents}
              running={sending}
              userMessage={selectedUserMessage}
            />
          </div>
        </div>
      </div>
    </div>
  )
}