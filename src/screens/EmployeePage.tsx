'use client'

import { useState } from 'react'
import { MessageSquare, Network, Send } from 'lucide-react'
import { useCopy } from '../hooks/useCopy'
import AgentCanvas from '../components/chat/AgentCanvas'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function EmployeePage() {
  const { t } = useCopy()
  const [mobileTab, setMobileTab] = useState<'chat' | 'canvas'>('chat')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    try {
      const response = await fetch('/api/employee/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      })
      const data = (await response.json()) as { reply?: string; error?: string }
      const reply = response.ok && data.reply ? data.reply : data.error ?? 'Something went wrong. Please try again.'
      setMessages((current) => [...current, { role: 'assistant', content: reply }])
    } catch {
      setMessages((current) => [...current, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally {
      setSending(false)
    }
  }

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
            <span>{t('chatTab')}</span>
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
          </button>
        </div>
      </div>

      {/* Chat Column Shell */}
      <div
        className={`employee-chat ${
          mobileTab === 'chat' ? 'flex' : 'hidden'
        } w-full min-w-0 flex-1 flex-col border-ink-200 lg:flex lg:w-1/2 lg:border-e`}
      >
        <div className="employee-panel-header flex shrink-0 items-center justify-between gap-2 px-3.5 py-3 sm:px-5">
          <span className="truncate text-xs font-medium text-ink-600">{t('chatTab')}</span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-ink-500">
              {t('greetingProactive')}
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                    message.role === 'user'
                      ? 'bg-primary-500 text-white'
                      : 'bg-ink-100 text-ink-900'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))
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
        } w-full flex-1 flex-col lg:flex lg:w-1/2`}
      >
        <div className="employee-panel-header hidden items-center gap-2 px-6 py-3 text-sm font-medium text-ink-900 lg:flex">
          <Network size={16} className="text-primary-500" />
          {t('canvasTitle')}
        </div>
        <div className="min-h-0 flex-1">
          <AgentCanvas conversationId={null} events={[]} running={sending} />
        </div>
      </div>
    </div>
  )
}