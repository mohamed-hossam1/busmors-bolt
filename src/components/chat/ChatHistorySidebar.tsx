'use client'

import { MessageSquare, Plus, Trash2, X } from 'lucide-react'
import { useCopy } from '../../hooks/useCopy'
import type { ConversationSummary } from './employeeCards'

function formatWhen(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ChatHistorySidebar({
  conversations,
  activeId,
  loading,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: {
  conversations: ConversationSummary[]
  activeId: string | null
  loading: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const { t } = useCopy()
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={onClose} aria-hidden />
      <aside className="fixed inset-y-0 start-0 z-40 flex w-72 max-w-[85%] flex-col border-e border-ink-200 bg-white lg:static lg:z-auto lg:w-60 lg:max-w-none">
        <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-3 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t('chatHistory')}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeDetailsAriaLabel')}
            className="rounded p-1 text-ink-500 hover:bg-ink-100 lg:hidden"
          >
            <X size={15} />
          </button>
        </div>

        <div className="p-2">
          <button
            type="button"
            onClick={onNew}
            className="btn-primary flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs"
          >
            <Plus size={14} /> {t('newConversation')}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {loading ? (
            <p className="px-2 py-6 text-center text-xs text-ink-400">{t('loadingChats')}</p>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-ink-400">{t('noChatsYet')}</p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((conversation) => {
                const active = conversation.id === activeId
                return (
                  <li key={conversation.id}>
                    <div
                      className={`group flex items-center gap-1 rounded-lg px-2 py-2 ${
                        active ? 'bg-primary-50 text-primary-900' : 'hover:bg-ink-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(conversation.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-start"
                      >
                        <MessageSquare size={14} className={active ? 'text-primary-600' : 'text-ink-400'} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-ink-800">{conversation.title}</span>
                          <span className="block text-[10px] text-ink-400">{formatWhen(conversation.updated_at)}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(t('deleteChatConfirm'))) onDelete(conversation.id)
                        }}
                        aria-label={t('deleteChat')}
                        className="rounded p-1 text-ink-300 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}