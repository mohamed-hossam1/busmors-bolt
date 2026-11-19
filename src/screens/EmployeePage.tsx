'use client'

import { useDialog } from '../hooks/useDialog'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
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
  ArrowUpRight,
  Gauge,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCopy } from '../hooks/useCopy'
import type { AgentEvent, ChatMessage, Conversation, FormField } from '../lib/types'
import type { TaskOrigin } from '../lib/contracts'
import { useTaskRunner } from '../features/tasks/TaskRunnerProvider'
import AgentCanvas, { type CanvasPreviewPost } from '../components/chat/AgentCanvas'
import { PostPreviewCard } from '../components/chat/PostPreview'
import MarkdownContent from '../components/chat/MarkdownContent'
import { forgetCanvasLayout, readActiveConversation, saveActiveConversation } from '../lib/chatCanvasStorage'

export default function EmployeePage() {
  const { t } = useCopy()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const { runner, tasks, error: runnerError } = useTaskRunner()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [actionError,setActionError] = useState('')
  const [sending,setSending] = useState(false)
  const requestKey = useRef<{conversation:string;text:string;key:string}|null>(null)
  const openedTaskLink = useRef<string|null>(null)
  const composedRef = useRef<string|null>(null)
  const continuationOrigin = useRef<{deliverableId:string;version:number}|null>(null)
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
  const conversationTasks = tasks.filter(task=>task.conversation_id===conversationId)
  const running = sending || conversationTasks.some(task=>['queued','running'].includes(task.status))
  const selectedTask = conversationTasks.find(task=>task.id===activeTask)
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
      // An exact task link owns the initial conversation. Selecting the last
      // saved conversation here can otherwise race the link and hide the task.
      if (searchParams.get('task')) return
      const savedId = searchParams.get('conversation') ?? readActiveConversation(userId)
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

  useEffect(()=>{
    const requested=searchParams.get('task')
    if(!requested){openedTaskLink.current=null;return}
    if(openedTaskLink.current===requested)return
    const task=tasks.find(task=>task.id===requested)
    if(task){openedTaskLink.current=requested;selectConversation(task.conversation_id);setActiveTask(task.id);return}
    // A stale or deleted task link must not leave an empty workspace.
    if(tasks.length&&conversations.length&&!conversationId)selectConversation(conversations[0].id)
  },[searchParams,tasks,conversations,conversationId])

  // Exact "Reuse"/"Continue with Director" links prefill the composer once.
  // A document continuation also keeps the checked origin for the first Task.
  useEffect(()=>{
    const compose=searchParams.get('compose')
    if(!compose){composedRef.current=null;continuationOrigin.current=null;return}
    if(composedRef.current===compose)return
    composedRef.current=compose
    setInput(compose)
    const document=searchParams.get('document')
    const version=Number(searchParams.get('version'))
    continuationOrigin.current=document&&Number.isInteger(version)&&version>0?{deliverableId:document,version}:null
  },[searchParams])

  const prevConversationId = useRef<string | null>(null)
  useEffect(()=>{
    if(!conversationId)return
    let cancelled=false,polling=false
    setLoadedConversationId(null);setMessages([]);setEvents([]);setCanvasLoadError(null)
    if(prevConversationId.current && prevConversationId.current !== conversationId && !composedRef.current) setInput('')
    prevConversationId.current = conversationId
    const refresh=async()=>{
      if(polling)return
      polling=true
      try{
        const {data,error}=await supabase.from('messages').select('*').eq('conversation_id',conversationId).order('created_at',{ascending:true})
        if(error)throw error
        if(!cancelled)setMessages((data??[]) as ChatMessage[])
      }catch{if(!cancelled)setActionError('Messages could not be loaded. Your saved conversation is kept; retry shortly.')}
      finally{polling=false;if(!cancelled)setLoadedConversationId(conversationId)}
    }
    void refresh();const interval=setInterval(()=>void refresh(),1800)
    return()=>{cancelled=true;clearInterval(interval)}
  },[conversationId])

  useEffect(()=>{
    if(!conversationId)return
    if(!conversationTasks.some(task=>task.id===activeTask)){
      const next=conversationTasks.find(task=>['running','queued','awaiting_input'].includes(task.status))??conversationTasks[0]
      setActiveTask(next?.id??null)
    }
  },[conversationId,conversationTasks,activeTask])

  useEffect(()=>{
    setEvents([])
    if(!activeTask||!conversationId)return
    let cancelled=false,polling=false
    const refresh=async()=>{
      if(polling)return
      polling=true
      try{
        const {data,error}=await supabase.from('agent_events').select('*').eq('task_id',activeTask).order('created_at',{ascending:true})
        if(cancelled)return
        if(error)throw error
        setEvents((data??[]) as AgentEvent[]);setCanvasLoadError(null)
      }catch{if(!cancelled)setCanvasLoadError('Saved task events could not be loaded. Retrying…')}
      finally{polling=false}
    }
    void refresh();const interval=setInterval(()=>void refresh(),1800)
    return()=>{cancelled=true;clearInterval(interval)}
  },[activeTask,conversationId])

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'})},[displayedMessages.length,running])

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
      setActionError('A new conversation could not be saved. Try again.')
      return
    }

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
    if (error) { setActionError('This conversation could not be deleted. Its saved data is unchanged.');return }
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
    if(!text.trim()||!conversationId||conversationLoading||running||!runner)return
    setSending(true);setActionError('')
    if(requestKey.current?.conversation!==conversationId||requestKey.current?.text!==text)requestKey.current={conversation:conversationId,text,key:crypto.randomUUID()}
    const pending=continuationOrigin.current
    const origin:TaskOrigin|undefined=pending?{kind:'document',conversationId,deliverableId:pending.deliverableId,version:pending.version}:undefined
    try{
      const task=await runner.submit(conversationId,text,requestKey.current.key,origin)
      requestKey.current=null
      continuationOrigin.current=null
      composedRef.current=null
      if(searchParams.has('compose')){
        const next=new URLSearchParams(searchParams)
        for(const key of ['compose','document','version','conversation'])next.delete(key)
        router.replace('?' + next.toString(), { scroll: false })
      }
      if(viewedConversationRef.current===conversationId){setInput('');setActiveTask(task.id)}
      const {data,error}=await supabase.from('messages').select('*').eq('conversation_id',conversationId).order('created_at',{ascending:true})
      if(viewedConversationRef.current===conversationId){
        if(error)setActionError('Your request is saved. Messages could not be refreshed yet; they will retry automatically.')
        else setMessages((data??[]) as ChatMessage[])
      }
      if(workspaceIdRef.current)await loadConversationsList(workspaceIdRef.current)
    }catch{setActionError('Your request could not be confirmed saved. Keep your text and retry; the same request will not be duplicated.')}
    finally{setSending(false)}
  }
  const submitForm = async (msg: ChatMessage, values: Record<string,string|string[]>) => {
    if(!runner||typeof msg.payload?.inputId!=='string')throw new Error('This older form cannot be resumed. Send a new request with your answer.')
    const selected=String(values.answer??'')
    const status=['unknown','skipped','not_applicable'].includes(selected)?selected:'answered'
    await runner.answer(msg.payload.inputId,Number(msg.payload.inputVersion),{status,value:status==='answered'?selected:undefined})
  }

  // Derive live progress step details from agent events
  const { currentAgentLabel, currentStepDescription, completedSteps } = useMemo(() => {
    const completed: string[] = []
    let activeAgent = 'Director'
    let currentStep = selectedTask?.status==='queued'?'Queued · waiting for an execution slot.':'Waiting for saved progress…'

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
  }, [events,selectedTask?.status])

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

        {(actionError||runnerError)&&<p role="alert" className="m-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{actionError||runnerError}</p>}
        {conversationTasks.length>0&&<div className="border-b border-ink-200 px-4 py-3 text-xs">
          <label className="flex items-center gap-2">Task history<select className="input-field min-w-0 flex-1 text-xs" aria-label="Selected task" value={activeTask??''} onChange={e=>setActiveTask(e.target.value)}>{conversationTasks.map(task=><option key={task.id} value={task.id}>{task.user_request?.slice(0,45)||'Saved task'} · {task.status}</option>)}</select></label>
          {selectedTask&&<div className="mt-2 flex flex-wrap items-center gap-2"><span className="badge capitalize">{selectedTask.status.replaceAll('_',' ')}</span><span>{selectedTask.consumption?.calls??0} / {selectedTask.allowance?.calls??8} model calls · {Math.max(0,(selectedTask.allowance?.calls??8)-(selectedTask.consumption?.calls??0))} remaining</span>
            {['failed','interrupted'].includes(selectedTask.status)&&<button className="btn-secondary text-xs" onClick={()=>void runner?.resume(selectedTask).catch(()=>setActionError('This task could not be resumed. Reload its latest state.'))}>Resume task</button>}
            {['running','queued','awaiting_input','awaiting_approval'].includes(selectedTask.status)&&<button className="btn-secondary text-xs" onClick={()=>void runner?.cancel(selectedTask).catch(()=>setActionError('Cancellation could not be saved. Check the task status before retrying.'))}>Cancel task</button>}
          </div>}
          <p className="mt-2 text-ink-500">Tasks continue while you navigate this app. Keep this browser open; interrupted work can be resumed.</p>
        </div>}
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
            aria-label="Message your Marketing Director"
            placeholder={t('chatPlaceholder')}
            className="input-field flex-1"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!runner || running || conversationLoading || !input.trim()}
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
            <AgentCanvas key={`${conversationId}:${activeTask}`} conversationId={conversationId ? `${conversationId}:${activeTask??'empty'}` : null} events={events} running={selectedTask?.status==='running'} taskId={selectedTask?.id} taskStatus={selectedTask?.status} previewPosts={canvasPreviews} />
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
  onSubmitForm: (msg: ChatMessage, values: Record<string, string | string[]>) => Promise<void>
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
  if(msg.type==='post_reference')return <Link className="card block p-4 text-sm text-primary-800 hover:border-primary-400" href={`/scheduling?post=${encodeURIComponent(String(msg.payload?.postId??''))}`}><span className="font-semibold">Draft Post · review in Scheduling</span><p className="mt-2 line-clamp-3 text-ink-600">{String(msg.payload?.caption??msg.content)}</p></Link>
  if(msg.type==='task_status')return <p className="rounded-xl bg-ink-100 p-3 text-sm text-ink-600">{msg.content}</p>
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
                    {typeof msg.payload?.deliverable_id === 'string' && (
                      <Link
                        href={`/deliverables?document=${encodeURIComponent(msg.payload.deliverable_id)}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-white border border-ink-200 px-2 py-1 text-xs font-medium text-ink-700 shadow-2xs hover:bg-ink-100 transition-colors"
                        title="Open this document in Documents"
                      >
                        <ArrowUpRight size={13} />
                        <span className="hidden sm:inline">Documents</span>
                      </Link>
                    )}
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
  if ((msg.type === 'form'||msg.type === 'structured_form') && msg.payload) {
    const fields = (msg.payload.fields as FormField[]) ?? []
    const submitted = Boolean(msg.payload.submitted)
    // Legacy forms have no Task input to resume. Keep them readable but never
    // show a submit button that would fail after the owner answers.
    const resumable = typeof msg.payload.inputId === 'string' && !msg.payload.legacy
    return (
      <div className="animate-fade-up">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
            <Bot size={16} />
          </div>
          <div className="card max-w-[95%] sm:max-w-[85%] p-3.5 sm:p-4">
            <MarkdownContent content={msg.content} className="text-sm font-medium text-ink-800" />
            {!submitted && resumable && <FormFields fields={fields} onSubmit={(v) => onSubmitForm(msg, v)} />}
            {!submitted && !resumable && <p className="mt-2 text-xs text-ink-500">This earlier form is kept for history and cannot be answered here.</p>}
            {submitted && <p className="mt-2 text-xs text-primary-700">✓ {t('submitForm')}</p>}
          </div>
        </div>
      </div>
    )
  }
  if (msg.type === 'budget_extension_request') {
    const taskId = typeof msg.payload?.taskId === 'string' ? msg.payload.taskId : ''
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
            <p className="text-sm font-semibold text-ink-900">Model allowance reached</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-700">{msg.content}</p>
            {(Number.isFinite(used) && Number.isFinite(limit)) || remaining !== null ? (
              <p className="mt-2 text-xs text-ink-600">
                {Number.isFinite(used) && Number.isFinite(limit) ? `${used} of ${limit} model calls used.` : ''}
                {remaining !== null ? ` ${remaining} remaining.` : ''}
              </p>
            ) : null}
            {taskId && (
              <Link
                href={`/employee?task=${encodeURIComponent(taskId)}`}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50"
              >
                <MessageSquare size={13} />
                Answer in Chat
              </Link>
            )}
            <p className="mt-2 text-xs text-ink-500">Saved progress is kept. No further model calls run until you explicitly continue.</p>
          </div>
        </div>
      </div>
    )
  }
  // Plain text and text_response share the standard bubble below. Submitting a
  // legacy form never changes brand voice; only an explicit form action does.
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
              href="/app/settings"
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

function FormFields({fields,onSubmit}:{fields:FormField[];onSubmit:(values:Record<string,string|string[]>)=>Promise<void>}) {
 const [values,setValues]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <form className="mt-3 space-y-4" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await onSubmit(values)}catch(error){setError(error instanceof Error?error.message:'Your answer could not be saved. Try again.')}finally{setBusy(false)}}}>
  {fields.map(field=>{
   // Numeric and URL fields ask for the right keyboard/validation without
   // changing the free-text answer path used by every other clarification.
   const inputType=field.type==='number'?'number':field.type==='url'?'url':'text'
   const inputMode=field.type==='number'?'decimal':field.type==='url'?'url':undefined
   return <fieldset key={field.name} className="space-y-3"><legend className="mb-2 text-sm font-medium">{field.label}</legend>
   {!!field.options?.length&&<div className="flex flex-wrap gap-2">{field.options.map(option=><button disabled={busy} type="button" key={option} className={`rounded-xl border px-3 py-2 text-xs ${values[field.name]===option?'border-primary-500 bg-primary-50':'border-ink-200'}`} onClick={()=>setValues({...values,[field.name]:option})}>{option}</button>)}</div>}
   <label className="block text-xs">Your answer or another option<input type={inputType} inputMode={inputMode} className="input-field mt-2" value={values[field.name]??''} maxLength={3000} onChange={e=>setValues({...values,[field.name]:e.target.value})}/></label>
   <div className="flex flex-wrap gap-2">{[['unknown','I don’t know yet'],['skipped','Skip'],['not_applicable','Not applicable']].map(([value,label])=><button disabled={busy} type="button" key={value} className={`rounded-lg border px-2 py-1.5 text-xs ${values[field.name]===value?'border-primary-500 bg-primary-50':'border-ink-200'}`} onClick={()=>setValues({...values,[field.name]:value})}>{label}</button>)}</div>
  </fieldset>})}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  <button className="btn-primary text-xs" disabled={busy||fields.some(field=>!values[field.name]?.trim())}>{busy?'Saving answer…':'Save answer and continue'}</button>
 </form>
}
