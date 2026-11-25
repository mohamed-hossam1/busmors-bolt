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
  open,
  conversations,
  activeId,
  loading,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: {
  open: boolean
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
      <div
        className={`fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px] transition-opacity duration-300 lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        aria-hidden={!open}
        inert={!open}
        className={`fixed inset-y-0 start-0 z-40 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl transition-[transform,opacity,width,margin] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:static lg:z-auto lg:h-full lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:overflow-hidden lg:bg-transparent lg:shadow-none ${
          open
            ? 'translate-x-0 opacity-100 lg:w-64 lg:me-3 xl:me-[18px]'
            : 'pointer-events-none ltr:-translate-x-full rtl:translate-x-full opacity-0 lg:w-0 lg:me-0'
        }`}
      >
        <div
          className={`flex h-full w-full flex-col bg-white transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:w-64 lg:shrink-0 lg:overflow-hidden lg:rounded-[18px] lg:border lg:border-[#d4daeb] ${
            open ? 'lg:translate-x-0' : 'lg:ltr:-translate-x-3 lg:rtl:translate-x-3'
          }`}
        >
          <div className="employee-panel-header flex shrink-0 items-center justify-between gap-2 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">{t('chatHistory')}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('closeDetailsAriaLabel')}
              className="rounded-lg p-1 text-ink-500 hover:bg-ink-100 lg:hidden"
            >
              <X size={15} />
            </button>
          </div>

          <div className="p-3">
            <button
              type="button"
              onClick={onNew}
              className="btn-primary flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs"
            >
              <Plus size={14} /> {t('newConversation')}
            </button>
          </div>

          <div className="sleek-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-3">
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
                        className={`group flex items-center gap-1 rounded-lg px-2 py-2 transition-colors ${
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
                          className="rounded p-1 text-ink-300 opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
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
        </div>
      </aside>
    </>
  )
}