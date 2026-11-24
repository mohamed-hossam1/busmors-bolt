'use client'

import { useDialog } from '../hooks/useDialog'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from '@/shared/i18n'
import { useSearchParams } from 'next/navigation'
import { useLocaleRouter as useRouter } from '@/context/I18nContext'
import {
  Bot,
  KeyRound,
  Send,
  Sparkles,
  MessageSquare,
  History,
  Plus,
  Trash2,
  Download,
  Maximize2,
  FileText,
  X,
  ArrowUpRight,
  Gauge,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCopy } from '../hooks/useCopy'
import { useAuth } from '../context/AuthContext'
import { formatWorkspaceTime } from '../lib/region'
import type { ChatMessage, Conversation } from '../lib/types'
import { useTaskRunner } from '../features/tasks/TaskRunnerProvider'
import { PostPreviewCard } from '../components/chat/PostPreview'
import MarkdownContent from '../components/chat/MarkdownContent'
import DeliverableOfferCard from '../components/chat/DeliverableOfferCard'
import AgentCanvas from '../components/chat/AgentCanvas'
import type { CanvasAgentEvent } from '@/features/agents/canvas'
import FacebookPostPreview from '../components/publishing/FacebookPostPreview'
import { usePreviewPageName } from '../hooks/usePreviewPageName'
import { formatConversationTitle } from '../lib/chat-title'

const activeConversationKey = (workspaceId: string) => `busmora:active-conversation:${workspaceId}`

function readActiveConversation(workspaceId: string): string | null {
  try { return localStorage.getItem(activeConversationKey(workspaceId)) } catch { return null }
}

function saveActiveConversation(workspaceId: string, conversationId: string): void {
  try { localStorage.setItem(activeConversationKey(workspaceId), conversationId) } catch { /* Optional browser preference. */ }
}

type DeliverablePost = {
  caption: string
  hashtags?: string
  platform?: string
  visualBrief?: string
  proposedAt?: string | null
}

export default function EmployeePage() {
  const { t } = useCopy()
  const { settings } = useAuth()
  const tz = settings?.timezone ?? 'UTC'
  const pageName = usePreviewPageName()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const { runner, error: runnerError } = useTaskRunner()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [actionError, setActionError] = useState('')
  const [sending, setSending] = useState(false)
  const requestKey = useRef<{ conversation: string; text: string; key: string } | null>(null)
  const composedRef = useRef<string | null>(null)
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null)
  const [viewingDeliverable, setViewingDeliverable] = useState<{ title: string; content: string } | null>(null)
  const [canvasEvents, setCanvasEvents] = useState<CanvasAgentEvent[]>([])

  useDialog(showHistory || !!viewingDeliverable, () => { setShowHistory(false); setViewingDeliverable(null) })

  const bottomRef = useRef<HTMLDivElement>(null)
  const viewedConversationRef = useRef<string | null>(null)
  const workspaceIdRef = useRef<string | null>(null)
  const running = sending
  const conversationLoading = !conversationId || loadedConversationId !== conversationId

  const selectConversation = (id: string) => {
    viewedConversationRef.current = id
    setConversationId(id)
    if (workspaceIdRef.current) saveActiveConversation(workspaceIdRef.current, id)
  }

  // Load the customer-safe Agent Canvas projection for a conversation (real events only).
  const refreshCanvas = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversation/canvas?conversationId=${encodeURIComponent(id)}`, { cache: 'no-store' })
      if (!res.ok) return
      const body = (await res.json()) as { events?: CanvasAgentEvent[] }
      if (viewedConversationRef.current === id) setCanvasEvents(Array.isArray(body.events) ? body.events : [])
    } catch { /* Canvas is best-effort; the conversation still works without it. */ }
  }, [])

  const displayedMessages = useMemo(() => {
    const greetingText = t('greetingProactive')
    const currentMessages = messages.filter((message) => message.conversation_id === conversationId)

    // Only the proactive greeting that predates the whole conversation may be
    // hoisted to the top. A direct greeting reply is an ordinary agent answer and
    // must keep its chronological place.
    const firstUserMessage = currentMessages.find((m) => m.role === 'user' && m.type === 'text')
    const isGreeting = (m: ChatMessage) => {
      if (m.role !== 'agent') return false
      if (m.id === 'initial-greeting-top') return true
      if (firstUserMessage && new Date(m.created_at).getTime() >= new Date(firstUserMessage.created_at).getTime()) return false
      return (
        m.content === greetingText ||
        m.content.includes('I reviewed your company info') ||
        m.content.includes('أقدر أساعدك بناءً على المعلومات اللي أكدتها عن مشروعك') ||
        m.content.includes('المساعد التسويقي لـ Busmora') ||
        m.content.includes('Busmora marketing assistant')
      )
    }

    const greetingMsg = currentMessages.find(isGreeting)
    const otherMsgs = currentMessages.filter((m) => !isGreeting(m))

    const pendingOptimistic = optimisticMessages.filter((om) => {
      if (om.conversation_id !== conversationId) return false
      const existsInServer = otherMsgs.some(
        (m) =>
          m.id === om.id ||
          (m.role === 'user' &&
            m.content === om.content &&
            new Date(m.created_at).getTime() >= new Date(om.created_at).getTime() - 3000)
      )
      return !existsInServer
    })

    // Historical task results can share a created_at; keep Post references, the
    // reply, then the save-to-Deliverables offer last.
    const sameTimeRank = (m: ChatMessage) => (m.type === 'post_reference' ? 0 : m.type === 'deliverable_offer' ? 2 : 1)
    const combined = [...otherMsgs, ...pendingOptimistic].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || sameTimeRank(a) - sameTimeRank(b)
    )

    if (greetingMsg) return [greetingMsg, ...combined]

    const virtualGreeting: ChatMessage = {
      id: 'initial-greeting-top',
      conversation_id: conversationId ?? 'default',
      role: 'agent',
      type: 'text',
      content: greetingText,
      payload: null,
      created_at: new Date(0).toISOString(),
    }
    return [virtualGreeting, ...combined]
  }, [messages, optimisticMessages, conversationId, t])

  const loadConversationsList = async (userId: string) => {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('workspace_id', userId)
      .order('created_at', { ascending: false })
    if (data) setConversations(data as Conversation[])
    return (data ?? []) as Conversation[]
  }

  // Restore the last conversation for this workspace instead of always opening
  // the newest one. Task links from the retired execution path are ignored.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId || cancelled) return
      workspaceIdRef.current = userId
      const available = await loadConversationsList(userId)
      if (cancelled) return
      const savedId = searchParams.get('conversation') ?? readActiveConversation(userId)
      let id = available.find((item) => item.id === savedId)?.id ?? available[0]?.id
      if (!id) {
        const { data: created } = await supabase.from('conversations')
          .insert({ workspace_id: userId, title: t('newConversation') || 'محادثة جديدة' }).select().single()
        if (cancelled) return
        if (created) {
          id = created.id
          await loadConversationsList(userId)
        }
      }
      if (id && !cancelled) selectConversation(id)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Exact "Reuse" links prefill the composer once.
  useEffect(() => {
    const compose = searchParams.get('compose')
    if (!compose) { composedRef.current = null; return }
    if (composedRef.current === compose) return
    composedRef.current = compose
    setInput(compose)
  }, [searchParams])

  const prevConversationId = useRef<string | null>(null)
  useEffect(() => {
    if (!conversationId) return
    let cancelled = false
    let polling = false
    setLoadedConversationId(null)
    setMessages([])
    setOptimisticMessages([])
    if (prevConversationId.current && prevConversationId.current !== conversationId && !composedRef.current) setInput('')
    prevConversationId.current = conversationId
    const refresh = async () => {
      if (polling) return
      polling = true
      try {
        const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true })
        if (error) throw error
        if (!cancelled) setMessages((data ?? []) as ChatMessage[])
      } catch {
        if (!cancelled) setActionError(t('messagesLoadFailed'))
      } finally {
        polling = false
        if (!cancelled) setLoadedConversationId(conversationId)
      }
    }
    void refresh()
    void refreshCanvas(conversationId)
    const interval = setInterval(() => { void refresh(); if (viewedConversationRef.current === conversationId) void refreshCanvas(conversationId) }, 1800)
    return () => { cancelled = true; clearInterval(interval) }
  }, [conversationId, refreshCanvas])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [displayedMessages.length, running])

  const handleNewChat = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) return

    const { data: created, error } = await supabase
      .from('conversations')
      .insert({ workspace_id: userId, title: t('newConversation') || 'محادثة جديدة' })
      .select()
      .single()

    if (error || !created) {
      setActionError(t('newConversationSaveFailed'))
      return
    }

    selectConversation(created.id)
    setMessages([])
    setOptimisticMessages([])
    setShowHistory(false)
    await loadConversationsList(userId)
  }

  const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm(t('deleteChatConfirm'))) return
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) return

    const { error } = await supabase.from('conversations').delete().eq('id', id)
    if (error) { setActionError(t('deleteConversationFailed')); return }
    const updated = conversations.filter((c) => c.id !== id)
    setConversations(updated)

    if (conversationId === id) {
      if (updated.length > 0) selectConversation(updated[0].id)
      else await handleNewChat()
    }
  }

  const downloadDeliverable = (title: string, content: string) => {
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/\s+/g, '_')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const send = async (text: string) => {
    const textToSend = text.trim()
    if (!textToSend || !conversationId || conversationLoading || running || !runner) return
    setInput('')
    setActionError('')
    setSending(true)
    const existingUser = [...messages, ...optimisticMessages].filter((m) => m.role === 'user' && m.type === 'text')
    const isFirstMessage = existingUser.length === 0
    const tempId = `optimistic-${crypto.randomUUID()}`
    const optimisticMsg: ChatMessage = {
      id: tempId,
      conversation_id: conversationId,
      role: 'user',
      type: 'text',
      content: textToSend,
      payload: null,
      created_at: new Date().toISOString(),
    }
    setOptimisticMessages((prev) => [...prev, optimisticMsg])
    if (requestKey.current?.conversation !== conversationId || requestKey.current?.text !== textToSend) {
      requestKey.current = { conversation: conversationId, text: textToSend, key: crypto.randomUUID() }
    }
    try {
      await runner.orchestrate(conversationId, textToSend, requestKey.current.key)
      requestKey.current = null
      composedRef.current = null
      if (searchParams.has('compose')) {
        const next = new URLSearchParams(searchParams)
        for (const key of ['compose', 'document', 'version', 'conversation']) next.delete(key)
        router.replace('?' + next.toString(), { scroll: false })
      }
      if (isFirstMessage) {
        void (async () => {
          try {
            const res = await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'title', conversationId, request: textToSend }) })
            if (res.ok) {
              const { title } = await res.json()
              setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, title } : c)))
            }
          } catch { /* Title is best-effort; the default title is kept. */ }
        })()
      }
      const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true })
      if (viewedConversationRef.current === conversationId) {
        if (error) setActionError(t('messagesRefreshFailed'))
        else setMessages((data ?? []) as ChatMessage[])
      }
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId))
      if (workspaceIdRef.current) await loadConversationsList(workspaceIdRef.current)
      void refreshCanvas(conversationId)
    } catch {
      setInput(textToSend)
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId))
      setActionError(t('requestSaveUncertain'))
    } finally {
      setSending(false)
    }
  }

  const currentConversation = conversations.find((c) => c.id === conversationId)

  const quickPrompts: { label: string; text: string }[] = [
    { label: t('quickHelp'), text: 'What can you help me with?' },
    { label: t('quickBusiness'), text: 'What do you know about my business?' },
  ]

  return (
    <div className="employee-workspace flex h-full min-h-0 flex-col overflow-hidden">
      <div className="employee-chat flex w-full min-w-0 flex-1 flex-col">
        <div className="employee-panel-header flex shrink-0 items-center justify-between gap-2 px-3.5 py-3 sm:px-5">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-100 transition-colors shrink-0"
              title={t('chatHistory')}
            >
              <History size={14} className="text-primary-700" />
              <span>{t('chatHistory')}</span>
              {conversations.length > 0 && (
                <span className="rounded-full bg-ink-200 px-1.5 py-0.2 text-[10px] text-ink-700 font-bold">
                  {conversations.length}
                </span>
              )}
            </button>
            <span className="text-ink-300">|</span>
            <span className="truncate text-xs font-medium text-ink-600 max-w-[120px] sm:max-w-[200px]">
              {formatConversationTitle(currentConversation?.title, t('newConversation') || t('chatTab'))}
            </span>
          </div>

          <button
            type="button"
            onClick={handleNewChat}
            className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold shadow-xs shrink-0"
          >
            <Plus size={14} />
            <span>{t('newConversation')}</span>
          </button>
        </div>

        {(actionError || runnerError) && <p role="alert" className="m-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{actionError || runnerError}</p>}

        <div className="flex-1 space-y-4 overflow-y-auto p-3.5 sm:p-6">
          {canvasEvents.length > 0 && <AgentCanvas events={canvasEvents} />}
          {displayedMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              pageName={pageName}
              tz={tz}
              onDownload={downloadDeliverable}
              onOpenFull={(title, content) => setViewingDeliverable({ title, content })}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        {displayedMessages.length <= 1 && (
          <div className="flex gap-2 overflow-x-auto px-3.5 sm:px-6 pb-2 no-scrollbar sm:flex-wrap">
            {quickPrompts.map((q) => (
              <button
                key={q.label}
                disabled={!runner || conversationLoading || running}
                onClick={() => void send(q.text)}
                className="btn-secondary px-3 py-1.5 text-xs shrink-0 sm:shrink"
              >
                <Sparkles size={13} /> {q.label}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void send(input)
          }}
          className="employee-composer flex gap-2 p-3 sm:p-4"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label={t('messageDirectorAriaLabel')}
            placeholder={t('chatPlaceholder')}
            className="input-field flex-1"
          />
          <button
            type="submit"
            aria-label={t('sendMessageAriaLabel')}
            disabled={!runner || running || conversationLoading || !input.trim()}
            className="btn-primary px-4 shrink-0 h-10 sm:h-11 flex items-center justify-center"
          >
            <Send size={16} />
          </button>
        </form>
      </div>

      {showHistory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center sm:justify-start bg-ink-900/40 backdrop-blur-xs animate-fade-in"
          onClick={() => setShowHistory(false)}
        >
          <div
            role="dialog" aria-modal="true" aria-label={t('conversationHistoryAriaLabel')} className="h-full w-full max-w-xs bg-white shadow-2xl border-e border-ink-200 p-4 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-ink-100">
              <div className="flex items-center gap-2">
                <History size={18} className="text-primary-700" />
                <h2 className="font-bold text-sm text-ink-900">{t('chatHistory')}</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                aria-label={t('closeConversationHistoryAriaLabel')}
                className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-3">
              <button
                type="button"
                onClick={handleNewChat}
                className="btn-primary w-full py-2 text-xs flex items-center justify-center gap-2 shadow-xs"
              >
                <Plus size={15} />
                <span>{t('newConversation')}</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
              {conversations.length === 0 && (
                <p className="text-center text-xs text-ink-400 py-6">{t('noChatsYet')}</p>
              )}
              {conversations.map((c) => {
                const isSelected = c.id === conversationId
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      selectConversation(c.id)
                      setShowHistory(false)
                    }}
                    className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-xs transition-colors cursor-pointer border ${
                      isSelected
                        ? 'bg-primary-50 border-primary-200 text-primary-900 font-semibold'
                        : 'border-transparent text-ink-700 hover:bg-ink-50 hover:text-ink-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <MessageSquare size={14} className={isSelected ? 'text-primary-600 shrink-0' : 'text-ink-400 shrink-0'} />
                      <div className="truncate">
                        <p className="truncate">{formatConversationTitle(c.title, t('newConversation') || t('conversationFallback'))}</p>
                        <p className="text-[10px] text-ink-400 font-normal">
                          {formatWorkspaceTime(c.created_at, tz, { dateStyle: 'medium', timeStyle: undefined })}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteChat(e, c.id)}
                      className="opacity-0 group-hover:opacity-100 rounded p-1 text-ink-400 hover:text-red-600 hover:bg-red-50 transition-all shrink-0 ml-1"
                      title={t('deleteChatTitle')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {viewingDeliverable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-3 sm:p-4 backdrop-blur-xs animate-fade-in"
          onClick={() => setViewingDeliverable(null)}
        >
          <div
            role="dialog" aria-modal="true" aria-label={viewingDeliverable.title}
            className="card modal-panel flex max-h-[85vh] w-full max-w-3xl flex-col p-4 sm:p-6 shadow-2xl border border-ink-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between border-b border-ink-100 pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary-700 shrink-0">
                  <FileText size={18} />
                </div>
                <h3 className="font-bold text-base sm:text-lg text-ink-900 truncate">{viewingDeliverable.title}</h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => downloadDeliverable(viewingDeliverable.title, viewingDeliverable.content)}
                  className="btn-primary px-3 py-1.5 text-xs flex items-center gap-1.5"
                >
                  <Download size={14} />
                  <span>{t('downloadReport')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingDeliverable(null)}
                  aria-label={t('closeReportAriaLabel')}
                  className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-2">
              <MarkdownContent content={viewingDeliverable.content} className="text-sm leading-relaxed text-ink-800" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MessageBubble({
  msg,
  pageName,
  tz,
  onDownload,
  onOpenFull,
}: {
  msg: ChatMessage
  pageName: string
  tz: string
  onDownload: (title: string, content: string) => void
  onOpenFull: (title: string, content: string) => void
}) {
  const { t } = useCopy()
  if (msg.type === 'knowledge_notification') {
    const count = Number(msg.payload?.count ?? msg.content)
    return (
      <div className="animate-fade-up rounded-lg border border-accent-200 bg-accent-50 px-4 py-2.5 text-sm text-accent-800">
        {count} {t('candidatesBadge')} — {t('navBrain')}
      </div>
    )
  }
  if (msg.type === 'post_reference') {
    return (
      <Link className="card block p-4 text-sm text-primary-800 hover:border-primary-400" href={`/scheduling?post=${encodeURIComponent(String(msg.payload?.postId ?? ''))}`}>
        <span className="font-semibold">{t('draftPostReviewScheduling')}</span>
        <div className="mt-3">
          <FacebookPostPreview compact pageName={pageName} caption={String(msg.payload?.caption ?? msg.content)} timeLabelKind={msg.payload?.proposedFor ? 'proposed' : 'draft'} time={typeof msg.payload?.proposedFor === 'string' ? msg.payload.proposedFor : null} timezone={tz} />
        </div>
      </Link>
    )
  }
  if (msg.type === 'task_status') return <p className="rounded-xl bg-ink-100 p-3 text-sm text-ink-600">{msg.content}</p>
  if (msg.type === 'error') {
    return <div className="animate-fade-up rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{msg.content}</div>
  }
  if (msg.type === 'deliverable_offer') return <DeliverableOfferCard msg={msg} />
  if (msg.type === 'deliverable_card' && msg.payload) {
    const previewPosts = (Array.isArray(msg.payload.posts) ? msg.payload.posts : []) as DeliverablePost[]
    const title = String(msg.payload.title ?? t('deliverablesTitle'))
    const content = String(msg.payload.content ?? '')
    const type = msg.payload?.type ?? 'general'

    return (
      <div className="animate-fade-up">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
            <Bot size={16} />
          </div>
          <div className="card max-w-[95%] sm:max-w-[85%] p-3.5 sm:p-4">
            <MarkdownContent content={msg.content} className="text-sm leading-relaxed text-ink-800" />

            {previewPosts.length > 0 && (
              <div className="mt-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">{t('postPreviewTitle')}</p>
                <div className="grid max-h-96 gap-2 overflow-y-auto grid-cols-1 sm:grid-cols-2">
                  {previewPosts.map((p, i) => (
                    <PostPreviewCard key={i} post={{ platform: p.platform ?? 'facebook', caption: p.caption, hashtags: p.hashtags }} />
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-500">{t('postPreviewHint')}</p>
              </div>
            )}

            {previewPosts.length === 0 && content && (
              <div className="mt-3 rounded-xl border border-primary-200/70 bg-primary-50/40 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary-200/60 pb-2.5 mb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-100 text-primary-700 shrink-0">
                      <FileText size={15} />
                    </div>
                    <div className="min-w-0">
                      <span className="badge bg-primary-100 text-primary-800 text-[10px] mb-0.5">
                        {String(t(`type_${type}` as never) ?? type)}
                      </span>
                      <p className="text-sm font-bold text-ink-900 truncate">{title}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onDownload(title, content)}
                      className="inline-flex items-center gap-1 rounded-lg bg-white border border-primary-200 px-2.5 py-1 text-xs font-semibold text-primary-800 shadow-2xs hover:bg-primary-50 hover:border-primary-300 transition-colors"
                      title={t('downloadMarkdownTitle')}
                    >
                      <Download size={13} />
                      <span>{t('downloadReport')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenFull(title, content)}
                      className="inline-flex items-center gap-1 rounded-lg bg-white border border-ink-200 px-2 py-1 text-xs font-medium text-ink-700 shadow-2xs hover:bg-ink-100 transition-colors"
                      title={t('openFullViewTitle')}
                    >
                      <Maximize2 size={13} />
                      <span className="hidden sm:inline">{t('viewFull')}</span>
                    </button>
                    {typeof msg.payload?.deliverable_id === 'string' && (
                      <Link
                        href={`/deliverables?document=${encodeURIComponent(msg.payload.deliverable_id)}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-white border border-ink-200 px-2 py-1 text-xs font-medium text-ink-700 shadow-2xs hover:bg-ink-100 transition-colors"
                        title={t('openDocumentTitle')}
                      >
                        <ArrowUpRight size={13} />
                        <span className="hidden sm:inline">{t('documentsLabel')}</span>
                      </Link>
                    )}
                  </div>
                </div>

                <div className="max-h-36 overflow-y-auto pr-1">
                  <MarkdownContent content={content} className="text-xs leading-relaxed text-ink-700" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }
  if ((msg.type === 'form' || msg.type === 'structured_form') && msg.payload) {
    // Historical forms remain readable. Answering a task input is disabled with
    // the rest of task execution.
    return (
      <div className="animate-fade-up">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
            <Bot size={16} />
          </div>
          <div className="card max-w-[95%] sm:max-w-[85%] p-3.5 sm:p-4">
            {msg.type === 'form' && <MarkdownContent content={msg.content} className="text-sm font-medium text-ink-800" />}
            <p className="mt-2 text-xs text-ink-500">{t('earlierFormHistoryNote')}</p>
          </div>
        </div>
      </div>
    )
  }
  if (msg.type === 'budget_extension_request') {
    const used = Number(msg.payload?.used ?? msg.payload?.calls)
    const limit = Number(msg.payload?.limit ?? msg.payload?.allowance)
    const storedRemaining = Number(msg.payload?.remaining)
    const remaining = Number.isFinite(storedRemaining)
      ? storedRemaining
      : Number.isFinite(used) && Number.isFinite(limit) ? Math.max(0, limit - used) : null
    return (
      <div className="animate-fade-up">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Gauge size={16} />
          </div>
          <div className="card max-w-[95%] sm:max-w-[85%] p-3.5 sm:p-4">
            <p className="text-sm font-semibold text-ink-900">{t('modelAllowanceReached')}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-700">{msg.content}</p>
            {(Number.isFinite(used) && Number.isFinite(limit)) || remaining !== null ? (
              <p className="mt-2 text-xs text-ink-600">
                {Number.isFinite(used) && Number.isFinite(limit) ? t('modelCallsUsed', { used, limit }) : ''}
                {remaining !== null ? ` ${t('modelCallsRemaining', { remaining })}` : ''}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  const isUser = msg.role === 'user'
  const dir = /[\u0600-\u06FF]/.test(msg.content) ? 'rtl' : 'ltr'
  return (
    <div className={`animate-fade-up flex ${isUser ? 'justify-end' : 'items-start gap-2.5'}`}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          <Bot size={16} />
        </div>
      )}
      <div
        dir={dir}
        className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser ? 'bg-primary-700 text-white' : 'card text-ink-800'
        }`}
      >
        <MarkdownContent content={msg.content} isUser={isUser} />
        {!isUser && (msg.content.includes('Settings page') || msg.content.includes('add your API key')) && (
          <div className="mt-3 pt-2.5 border-t border-ink-100 flex items-center gap-2">
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors"
            >
              <KeyRound size={13} />
              {t('openAiSettings')}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}