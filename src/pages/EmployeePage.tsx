import { useDialog } from '../hooks/useDialog'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Bot,
  KeyRound,
  Send,
  Sparkles,
  MessageSquare,
  Network,
  History,
  Plus,
  Trash2,
  Download,
  Maximize2,
  FileText,
  CheckCircle2,
  Loader2,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLang } from '../context/LangContext'
import type { AgentEvent, ChatMessage, Conversation, FormField } from '../lib/types'
import { classifyIntent, persistAgentResults, runAgentTask } from '../lib/agents'
import AgentCanvas, { type CanvasPreviewPost } from '../components/chat/AgentCanvas'
import { PostPreviewCard } from '../components/chat/PostPreview'
import MarkdownContent from '../components/chat/MarkdownContent'
import { forgetCanvasLayout, readActiveConversation, saveActiveConversation } from '../lib/chatCanvasStorage'

export default function EmployeePage() {
  const { t } = useLang()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [activeTask, setActiveTask] = useState<string | null>(null)
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null)
  const [canvasLoadError, setCanvasLoadError] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<'chat' | 'canvas'>('chat')
  const [viewingDeliverable, setViewingDeliverable] = useState<{ title: string; content: string } | null>(null)

  useDialog(showHistory || !!viewingDeliverable, () => { setShowHistory(false); setViewingDeliverable(null) })

  const bottomRef = useRef<HTMLDivElement>(null)
  const viewedConversationRef = useRef<string | null>(null)
  const workspaceIdRef = useRef<string | null>(null)
  const inFlightConversations = useRef(new Set<string>())
  const conversationLoading = !conversationId || loadedConversationId !== conversationId

  const selectConversation = (id: string) => {
    viewedConversationRef.current = id
    setConversationId(id)
    if (workspaceIdRef.current) saveActiveConversation(workspaceIdRef.current, id)
  }

  const displayedMessages = useMemo(() => {
    const greetingText = t('greetingProactive')
    const isGreeting = (m: ChatMessage) =>
      m.role === 'agent' && (m.content === greetingText || m.content.includes('I reviewed your company info'))

    const currentMessages = messages.filter((message) => message.conversation_id === conversationId)
    const greetingMsg = currentMessages.find(isGreeting)
    const otherMsgs = currentMessages.filter((m) => !isGreeting(m))

    if (greetingMsg) {
      return [greetingMsg, ...otherMsgs]
    }

    const virtualGreeting: ChatMessage = {
      id: 'initial-greeting-top',
      conversation_id: conversationId ?? 'default',
      role: 'agent',
      type: 'text',
      content: greetingText,
      payload: null,
      created_at: new Date(0).toISOString(),
    }
    return [virtualGreeting, ...otherMsgs]
  }, [messages, conversationId, t])

  const canvasPreviews: CanvasPreviewPost[] = useMemo(() => {
    const lastCard = [...displayedMessages]
      .reverse()
      .find((m) => m.type === 'deliverable_card' && Array.isArray(m.payload?.posts) && (m.payload.posts as unknown[]).length > 0)
    if (!lastCard) return []
    return (lastCard.payload?.posts as CanvasPreviewPost[]) ?? []
  }, [displayedMessages])

  const loadConversationsList = async (userId: string) => {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('workspace_id', userId)
      .order('created_at', { ascending: false })
    if (data) {
      setConversations(data as Conversation[])
    }
    return (data ?? []) as Conversation[]
  }

  // Restore the last conversation for this workspace instead of always opening the newest one.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId || cancelled) return
      workspaceIdRef.current = userId
      const available = await loadConversationsList(userId)
      if (cancelled) return
      const savedId = readActiveConversation(userId)
      let id = available.find((item) => item.id === savedId)?.id ?? available[0]?.id
      if (!id) {
        const { data: created } = await supabase.from('conversations')
          .insert({ workspace_id: userId, title: 'First conversation' }).select().single()
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

  // Messages and the latest saved workflow belong to the same conversation.
  useEffect(() => {
    if (!conversationId) return
    let cancelled = false
    setLoadedConversationId(null)
    setCanvasLoadError(null)
    setMessages([])
    setEvents([])
    setActiveTask(null)
    setRunning(false)
    setInput('')
    void (async () => {
      try {
        const [messageResult, taskResult] = await Promise.all([
          supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true }),
          supabase.from('tasks').select('id, status').eq('conversation_id', conversationId)
            .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        ])
        if (cancelled) return
        if (messageResult.error) throw messageResult.error
        setMessages((messageResult.data ?? []) as ChatMessage[])
        if (taskResult.error) throw taskResult.error
        if (taskResult.data) {
          const { data, error } = await supabase.from('agent_events').select('*')
            .eq('task_id', taskResult.data.id).order('seq', { ascending: true })
          if (cancelled) return
          if (error) throw error
          setEvents((data ?? []) as AgentEvent[])
          const inProgress = ['pending', 'running'].includes(taskResult.data.status) || inFlightConversations.current.has(conversationId)
          setRunning(inProgress)
          setActiveTask(inProgress ? taskResult.data.id : null)
        }
      } catch (error) {
        console.error('Could not restore conversation canvas:', error)
        if (!cancelled) setCanvasLoadError('Could not load this conversation’s graph. Please reopen the chat to retry.')
      } finally {
        if (!cancelled) setLoadedConversationId(conversationId)
      }
    })()
    return () => { cancelled = true }
  }, [conversationId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayedMessages, running])

  // Start polling as soon as the task is created, and stop without clearing its graph.
  useEffect(() => {
    if (!activeTask || !conversationId) return
    let cancelled = false
    let polling = false
    const poll = async () => {
      if (polling) return
      polling = true
      try {
        const [eventResult, taskResult] = await Promise.all([
          supabase.from('agent_events').select('*').eq('task_id', activeTask).order('seq', { ascending: true }),
          supabase.from('tasks').select('status').eq('id', activeTask).maybeSingle(),
        ])
        if (cancelled) return
        if (!eventResult.error) setEvents((eventResult.data ?? []) as AgentEvent[])
        if (taskResult.data && !['pending', 'running'].includes(taskResult.data.status)) {
          const { data } = await supabase.from('messages').select('*')
            .eq('conversation_id', conversationId).order('created_at', { ascending: true })
          if (cancelled) return
          if (data) setMessages(data as ChatMessage[])
          if (!inFlightConversations.current.has(conversationId)) {
            setRunning(false)
            setActiveTask(null)
          }
        }
      } finally { polling = false }
    }
    void poll()
    const interval = setInterval(() => { void poll() }, 900)
    return () => { cancelled = true; clearInterval(interval) }
  }, [activeTask, conversationId])

  // Create new conversation
  const handleNewChat = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) return

    const { data: created, error } = await supabase
      .from('conversations')
      .insert({ workspace_id: userId, title: 'New conversation' })
      .select()
      .single()

    if (error || !created) {
      console.error('Failed to create conversation:', error)
      return
    }

    const greetingText = t('greetingProactive')
    await supabase.from('messages').insert({
      conversation_id: created.id,
      workspace_id: userId,
      role: 'agent',
      type: 'text',
      content: greetingText,
      created_at: new Date().toISOString(),
    })

    selectConversation(created.id)
    setMessages([])
    setEvents([])
    setActiveTask(null)
    setShowHistory(false)
    await loadConversationsList(userId)
  }

  // Delete conversation
  const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm(t('deleteChatConfirm'))) return
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) return

    const { error } = await supabase.from('conversations').delete().eq('id', id)
    if (error) return
    forgetCanvasLayout(id)
    const updated = conversations.filter((c) => c.id !== id)
    setConversations(updated)

    if (conversationId === id) {
      if (updated.length > 0) {
        selectConversation(updated[0].id)
      } else {
        await handleNewChat()
      }
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
    if (!text.trim() || !conversationId || conversationLoading || running) return
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) return

    const isCurrentConversation = () => viewedConversationRef.current === conversationId
    if (inFlightConversations.current.has(conversationId)) return
    inFlightConversations.current.add(conversationId)
    if (isCurrentConversation()) { setRunning(true); setEvents([]); setCanvasLoadError(null) }

    // Update conversation title if this is the first user query
    const userMsgCount = messages.filter((m) => m.role === 'user').length
    if (userMsgCount === 0) {
      const summaryTitle = text.trim().slice(0, 36)
      void supabase.from('conversations').update({ title: summaryTitle }).eq('id', conversationId)
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, title: summaryTitle } : c))
      )
    }

    setInput('')
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      role: 'user',
      type: 'text',
      content: text,
      payload: null,
      created_at: new Date().toISOString(),
    }
    setMessages((m) => [...m, userMsg])
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      workspace_id: userId,
      role: 'user',
      type: 'text',
      content: text,
    })

    let taskIdForGraph: string | null = null
    try {
      const type = classifyIntent(text)
      const { taskId, result } = await runAgentTask({
        workspaceId: userId,
        conversationId,
        type,
        userRequest: text,
        onTaskCreated: (id) => {
          taskIdForGraph = id
          if (isCurrentConversation()) setActiveTask(id)
        },
      })
      await persistAgentResults({ workspaceId: userId, conversationId, taskId, result })
      const { data: fresh } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      if (isCurrentConversation()) setMessages((fresh ?? []) as ChatMessage[])
    } catch (err: unknown) {
      console.error('Agent task failed:', err)
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        workspace_id: userId,
        role: 'system',
        type: 'error',
        content: t('errorGeneric'),
      })
      if (isCurrentConversation()) setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          conversation_id: conversationId,
          role: 'system',
          type: 'error',
          content: t('errorGeneric'),
          payload: null,
          created_at: new Date().toISOString(),
        },
      ])
    } finally {
      if (taskIdForGraph) {
        const { data } = await supabase.from('agent_events').select('*')
          .eq('task_id', taskIdForGraph).order('seq', { ascending: true })
        if (isCurrentConversation() && data) setEvents(data as AgentEvent[])
      }
      inFlightConversations.current.delete(conversationId)
      if (isCurrentConversation()) { setRunning(false); setActiveTask(null) }
    }
  }

  const submitForm = async (msg: ChatMessage, values: Record<string, string | string[]>) => {
    const fields = ((msg.payload?.fields as FormField[]) ?? []).map((f) => ({ ...f, value: values[f.name] ?? f.value }))
    setMessages((m) =>
      m.map((x) => (x.id === msg.id ? { ...x, payload: { ...x.payload, fields, submitted: true } } : x))
    )
    const summary = fields.map((f) => `${f.label}: ${Array.isArray(f.value) ? f.value.join(', ') : f.value}`).join('; ')
    await send(`Brand voice updated: ${summary}`)
  }

  // Derive live progress step details from agent events
  const { currentAgentLabel, currentStepDescription, completedSteps } = useMemo(() => {
    const completed: string[] = []
    let activeAgent = 'Orchestrator'
    let currentStep = 'Analyzing your request and planning the workflow…'

    const formatAgentName = (id: string) => {
      switch (id) {
        case 'orchestrator':
          return 'Orchestrator'
        case 'market_research':
          return 'Market Research'
        case 'competitor_analysis':
          return 'Competitor Analysis'
        case 'content_writer':
          return 'Content Writer'
        case 'campaign_planner':
          return 'Campaign Planner'
        case 'performance':
          return 'Performance Analyst'
        default:
          return id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Orchestrator'
      }
    }

    for (const e of events) {
      if (e.agent_id) activeAgent = formatAgentName(e.agent_id)

      if (e.event_type === 'agent_tool_used' && e.payload?.tool_label) {
        const tool = String(e.payload.tool_label)
        currentStep = `${tool}…`
        completed.push(tool)
      } else if (e.event_type === 'agent_started' && e.payload?.task_summary) {
        currentStep = String(e.payload.task_summary)
      } else if (e.event_type === 'agent_completed' && e.payload?.result_summary) {
        completed.push(String(e.payload.result_summary))
      }
    }

    return {
      currentAgentLabel: activeAgent,
      currentStepDescription: currentStep,
      completedSteps: Array.from(new Set(completed)),
    }
  }, [events])

  const currentConversation = conversations.find((c) => c.id === conversationId)

  const quickPrompts: { label: string; text: string }[] = [
    { label: t('quickResearch'), text: 'Do market research for my market' },
    { label: t('quickCompetitors'), text: 'Analyze my competitors' },
    { label: t('quickContent'), text: 'Write 5 social posts for my main product' },
    { label: t('quickCalendar'), text: 'Create a content calendar for next month' },
  ]

  return (
    <div className="employee-workspace flex h-full min-h-0 flex-col overflow-hidden lg:flex-row">
      {/* Mobile/Tablet Tab Switcher */}
      <div className="flex shrink-0 border-b border-ink-200 bg-white px-3 py-2 lg:hidden">
        <div className="flex w-full rounded-xl bg-ink-100 p-1">
          <button
            type="button"
            onClick={() => setMobileTab('chat')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-semibold transition-all ${
              mobileTab === 'chat'
                ? 'bg-white text-ink-900 shadow-sm'
                : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <MessageSquare size={14} />
            <span>Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('canvas')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-semibold transition-all ${
              mobileTab === 'canvas'
                ? 'bg-white text-ink-900 shadow-sm'
                : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <Network size={14} />
            <span>{t('canvasTitle')}</span>
            {running && <span className="h-2 w-2 rounded-full bg-primary-500 animate-pulse" />}
          </button>
        </div>
      </div>

      {/* Chat Column */}
      <div
        className={`employee-chat ${
          mobileTab === 'chat' ? 'flex' : 'hidden'
        } w-full min-w-0 flex-1 flex-col border-ink-200 lg:flex lg:w-1/2 lg:border-e`}
      >
        {/* Chat Header Bar: History & New Chat */}
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
              {currentConversation?.title || 'Chat'}
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

        {/* Message Stream */}
        <div className="flex-1 space-y-4 overflow-y-auto p-3.5 sm:p-6">
          {displayedMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              onSubmitForm={submitForm}
              onDownload={downloadDeliverable}
              onOpenFull={(title, content) => setViewingDeliverable({ title, content })}
            />
          ))}

          {/* Real-time Detailed Agent Progress */}
          {running && (
            <div className="animate-fade-up rounded-2xl border border-primary-200/90 bg-gradient-to-r from-primary-50/95 to-accent-50/80 p-3.5 shadow-xs">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-xs">
                  <Loader2 size={16} className="animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary-900">
                      {currentAgentLabel}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-600 animate-ping" />
                      In Progress
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-ink-900 leading-snug">
                    {currentStepDescription}
                  </p>

                  {/* Completed Steps Trail */}
                  {completedSteps.length > 0 && (
                    <div className="mt-2.5 space-y-1 border-t border-primary-200/50 pt-2">
                      {completedSteps.slice(-3).map((step, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-xs text-ink-600">
                          <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                          <span className="truncate">{step}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {displayedMessages.length <= 1 && (
          <div className="flex gap-2 overflow-x-auto px-3.5 sm:px-6 pb-2 no-scrollbar sm:flex-wrap">
            {quickPrompts.map((q) => (
              <button
                key={q.label}
                disabled={conversationLoading || running}
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
            aria-label="Message your Marketing Director"
            placeholder={t('chatPlaceholder')}
            className="input-field flex-1"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={running || conversationLoading || !input.trim()}
            className="btn-primary px-4 shrink-0 h-10 sm:h-11 flex items-center justify-center"
          >
            <Send size={16} />
          </button>
        </form>
      </div>

      {/* Live Agent Canvas Column */}
      <div
        className={`employee-canvas ${
          mobileTab === 'canvas' ? 'flex' : 'hidden'
        } w-full flex-1 flex-col lg:flex lg:w-1/2`}
      >
        <div className="employee-panel-header hidden items-center gap-2 px-6 py-3 text-sm font-medium text-ink-900 lg:flex">
          <Network size={16} className="text-primary-500" />
          {t('canvasTitle')}
        </div>
        <div className="min-h-0 flex-1">
          {conversationLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-ink-500"><Loader2 size={16} className="animate-spin" />Loading conversation graph…</div>
          ) : canvasLoadError ? (
            <p role="alert" className="m-5 rounded-xl border border-red-100 bg-white p-4 text-sm text-red-600">{canvasLoadError}</p>
          ) : (
            <AgentCanvas key={conversationId} conversationId={conversationId} events={events} running={running} previewPosts={canvasPreviews} />
          )}
        </div>
      </div>

      {/* Chat History Slide-Over Drawer */}
      {showHistory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center sm:justify-start bg-ink-900/40 backdrop-blur-xs animate-fade-in"
          onClick={() => setShowHistory(false)}
        >
          <div
            role="dialog" aria-modal="true" aria-label="Conversation history" className="h-full w-full max-w-xs bg-white shadow-2xl border-e border-ink-200 p-4 flex flex-col"
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
                aria-label="Close conversation history"
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
                      <MessageSquare
                        size={14}
                        className={isSelected ? 'text-primary-600 shrink-0' : 'text-ink-400 shrink-0'}
                      />
                      <div className="truncate">
                        <p className="truncate">{c.title || 'Conversation'}</p>
                        <p className="text-[10px] text-ink-400 font-normal">
                          {new Date(c.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteChat(e, c.id)}
                      className="opacity-0 group-hover:opacity-100 rounded p-1 text-ink-400 hover:text-red-600 hover:bg-red-50 transition-all shrink-0 ml-1"
                      title="Delete chat"
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

      {/* Full Deliverable Reading Modal */}
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
                <h3 className="font-bold text-base sm:text-lg text-ink-900 truncate">
                  {viewingDeliverable.title}
                </h3>
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
                  aria-label="Close report"
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
  onSubmitForm,
  onDownload,
  onOpenFull,
}: {
  msg: ChatMessage
  onSubmitForm: (msg: ChatMessage, values: Record<string, string | string[]>) => void
  onDownload: (title: string, content: string) => void
  onOpenFull: (title: string, content: string) => void
}) {
  const { t } = useLang()
  if (msg.type === 'knowledge_notification') {
    const count = Number(msg.payload?.count ?? msg.content)
    return (
      <div className="animate-fade-up rounded-lg border border-accent-200 bg-accent-50 px-4 py-2.5 text-sm text-accent-800">
        {count} {t('candidatesBadge')} — {t('navBrain')}
      </div>
    )
  }
  if (msg.type === 'error') {
    return (
      <div className="animate-fade-up rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{msg.content}</div>
    )
  }
  if (msg.type === 'deliverable_card' && msg.payload) {
    const previewPosts = (Array.isArray(msg.payload.posts) ? msg.payload.posts : []) as CanvasPreviewPost[]
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

            {/* Social Posts Grid */}
            {previewPosts.length > 0 && (
              <div className="mt-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">{t('postPreviewTitle')}</p>
                <div className="grid max-h-96 gap-2 overflow-y-auto grid-cols-1 sm:grid-cols-2">
                  {previewPosts.map((p, i) => (
                    <PostPreviewCard key={i} post={p} />
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-500">{t('postPreviewHint')}</p>
              </div>
            )}

            {/* Readable Document / Report Card with Direct Download */}
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
                      title="Download as Markdown file"
                    >
                      <Download size={13} />
                      <span>{t('downloadReport')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenFull(title, content)}
                      className="inline-flex items-center gap-1 rounded-lg bg-white border border-ink-200 px-2 py-1 text-xs font-medium text-ink-700 shadow-2xs hover:bg-ink-100 transition-colors"
                      title="Open full view"
                    >
                      <Maximize2 size={13} />
                      <span className="hidden sm:inline">{t('viewFull')}</span>
                    </button>
                  </div>
                </div>

                {/* Formatted Markdown Content - NO RAW PRE! */}
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
  if (msg.type === 'form' && msg.payload) {
    const fields = (msg.payload.fields as FormField[]) ?? []
    const submitted = Boolean(msg.payload.submitted)
    return (
      <div className="animate-fade-up">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
            <Bot size={16} />
          </div>
          <div className="card max-w-[95%] sm:max-w-[85%] p-3.5 sm:p-4">
            <MarkdownContent content={msg.content} className="text-sm font-medium text-ink-800" />
            {!submitted && <FormFields fields={fields} onSubmit={(v) => onSubmitForm(msg, v)} />}
            {submitted && <p className="mt-2 text-xs text-primary-700">✓ {t('submitForm')}</p>}
          </div>
        </div>
      </div>
    )
  }
  const isUser = msg.role === 'user'
  return (
    <div className={`animate-fade-up flex ${isUser ? 'justify-end' : 'items-start gap-2.5'}`}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          <Bot size={16} />
        </div>
      )}
      <div
        className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser ? 'bg-primary-700 text-white' : 'card text-ink-800'
        }`}
      >
        <MarkdownContent content={msg.content} isUser={isUser} />
        {!isUser && (msg.content.includes('Settings page') || msg.content.includes('add your API key')) && (
          <div className="mt-3 pt-2.5 border-t border-ink-100 flex items-center gap-2">
            <Link
              to="/app/settings"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors"
            >
              <KeyRound size={13} />
              Open AI Settings
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function FormFields({ fields, onSubmit }: { fields: FormField[]; onSubmit: (v: Record<string, string | string[]>) => void }) {
  const { t } = useLang()
  const [values, setValues] = useState<Record<string, string | string[]>>({})

  return (
    <div className="mt-3 space-y-3">
      {fields.map((f) => (
        <div key={f.name}>
          <span className="mb-1 block text-xs font-semibold text-ink-600">{f.label}</span>
          {f.type === 'text' && (
            <input
              className="input-field"
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            />
          )}
          {f.type === 'single' && (
            <div className="flex flex-wrap gap-2">
              {(f.options ?? []).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setValues((v) => ({ ...v, [f.name]: o }))}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    values[f.name] === o
                      ? 'border-primary-600 bg-primary-50 text-primary-800'
                      : 'border-ink-200 text-ink-600 hover:border-ink-300'
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setValues((v) => ({ ...v, [f.name]: `${f.label} — researched by agent` }))}
            className="mt-1 text-xs text-primary-700 hover:underline"
          >
            {t('searchYourself')}
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onSubmit(values)}
        className="btn-primary px-4 py-1.5 text-xs"
      >
        {t('submitForm')}
      </button>
    </div>
  )
}
