'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import Skeleton from '../../components/Skeleton'
import { useCopy } from '../../hooks/useCopy'

interface NotificationRow {
  id: string
  type: string
  title: string
  body: string
  read_at: string | null
  created_at: string
}

type Copy = ReturnType<typeof useCopy>['t']

function formatTime(iso: string, t: Copy) {
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return t('justNow')
  if (minutes < 60) return t('minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('hoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t('daysAgo', { count: days })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function NotificationCenter() {
  const { t } = useCopy()
  const { session } = useAuth()
  const workspaceId = session?.user.id ?? null
  const [items, setItems] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [marking, setMarking] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!workspaceId) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, read_at, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(50)
    setItems((data as unknown as NotificationRow[] | null) ?? [])
    setLoading(false)
  }, [workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const unread = items.filter((item) => !item.read_at).length

  const markAllRead = async () => {
    if (!workspaceId || marking) return
    setMarking(true)
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .is('read_at', null)
    setMarking(false)
    if (!error) void load()
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label={unread > 0 ? t('notificationsUnread', { count: unread }) : t('notifications')}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="notification-bell"
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className="notification-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="card absolute end-0 z-50 mt-2 flex max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">{t('notifications')}</p>
            <button
              type="button"
              onClick={markAllRead}
              disabled={marking || unread === 0}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-primary-700 transition hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {marking ? t('marking') : t('markAllRead')}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-3 p-4">
                <Skeleton height="1rem" width="60%" />
                <Skeleton height="0.75rem" />
                <Skeleton height="1px" className="!bg-ink-100" />
                <Skeleton height="1rem" width="45%" />
                <Skeleton height="0.75rem" width="90%" />
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-500">{t('allCaughtUp')}</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {items.map((item) => (
                  <li key={item.id} className={`flex gap-3 px-4 py-3 ${item.read_at ? '' : 'bg-primary-50/40'}`}>
                    <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read_at ? 'bg-ink-200' : 'bg-primary-500'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-900">{item.title}</p>
                      {item.body && <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{item.body}</p>}
                      <p className="mt-1 text-[11px] text-ink-400">{formatTime(item.created_at, t)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}