'use client'

import LoadingState from '../components/LoadingState'
import EmptyState from '../components/EmptyState'
import { useDialog } from '../hooks/useDialog'
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCheck, Copy, XCircle } from 'lucide-react'
import { loadPosts, recoverPosts, updatePosts } from '../server/calendar-actions'
import { useCopy } from '../hooks/useCopy'
import type { PlannedPost } from '../lib/types'

export default function CalendarPage({ initial }: { initial: PlannedPost[] }) {
  const { t } = useCopy()
  const [posts, setPosts] = useState<PlannedPost[]>(initial)
  const [editing, setEditing] = useState<PlannedPost | null>(null)
  const [editText, setEditText] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useDialog(!!editing, () => setEditing(null))

  const [error, setError] = useState('')
  useEffect(() => {
    if (initial.length) return
    let active = true
    void recoverPosts().then(posts => { if (active) setPosts(posts) }).catch(() => { if (active) setError('Posts could not be recovered. Please retry.') })
    return () => { active = false }
  }, [initial])

  const load = async () => {
    try { setPosts(await loadPosts()); setError('') }
    catch { setError('Posts could not be loaded. Please retry.') }
    finally { setLoading(false) }
  }
  const changePosts = async (ids: string[], change: { status?: PlannedPost['status']; caption?: string }) => {
    setBusy(true); setError('')
    try {
      const result = await updatePosts(ids, change)
      if (result.error) { setError(result.error); return false }
      await load(); return true
    } catch { setError('Posts could not be saved. Please retry.'); return false }
    finally { setBusy(false) }
  }
  const pending = useMemo(() => posts.filter((p) => p.status === 'pending_approval'), [posts])
  const others = useMemo(() => posts.filter((p) => p.status !== 'pending_approval'), [posts])
  const approvedCount = useMemo(() => posts.filter((p) => p.status === 'approved').length, [posts])

  const setStatus = (post: PlannedPost, status: PlannedPost['status']) => changePosts([post.id], { status })
  const saveEdit = async () => { if (editing && await changePosts([editing.id], { caption: editText })) setEditing(null) }
  const approveAll = () => changePosts(pending.map(post => post.id), { status: 'approved' })
  const rejectAll = () => changePosts(pending.map(post => post.id), { status: 'rejected' })

  const copyCaption = async (post: PlannedPost) => {
    const text = post.hashtags ? `${post.caption}\n\n${post.hashtags}` : post.caption
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(post.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const markPublished = (post: PlannedPost) => changePosts([post.id], { status: 'published' })

  return (
    <div className="workspace-page">
      <div className="mx-auto max-w-5xl">{error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="brain-page-heading"><CalendarDays size={22} /></span>
            <div><h1 className="workspace-heading">{t('calendarTitle')}</h1><p className="workspace-description">A clear view of what’s next. You make the final call.</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {pending.length > 0 && (
              <>
                <button
                  onClick={approveAll}
                  disabled={busy}
                  className="btn-secondary px-3.5 py-1.5 text-xs sm:text-sm flex-1 sm:flex-initial justify-center"
                >
                  <CheckCheck size={15} /> {t('approveAll')}
                </button>
                <button
                  onClick={rejectAll}
                  disabled={busy}
                  className="btn-secondary px-3.5 py-1.5 text-xs sm:text-sm flex-1 sm:flex-initial justify-center"
                >
                  <XCircle size={15} /> {t('rejectAll')}
                </button>
              </>
            )}
          </div>
        </header>

        {!loading && <div className="mb-7 grid grid-cols-3 gap-3 sm:gap-4">{[
          { label: 'All posts', value: posts.length }, { label: 'To review', value: pending.length }, { label: 'Approved', value: approvedCount },
        ].map((stat) => <div key={stat.label} className="stat-card"><p className="text-xs text-ink-600">{stat.label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{stat.value}</p></div>)}</div>}
        {loading ? (
          <LoadingState />
        ) : posts.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Your next story starts here." description="Ask your Marketing Director to prepare posts. Drafts will appear here for you to review." action={{ to: "/app/employee", label: "Talk to your Director" }} />
        ) : (
          <div className="space-y-6">
            {approvedCount > 0 && (
              <p className="rounded-lg bg-primary-50 px-4 py-2.5 text-sm text-primary-800">
                {t('publishYourselfHint')}
              </p>
            )}
            {pending.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">
                  {t('batchReview')} — {pending.length}
                </h2>
                <div className="grid gap-5 md:grid-cols-2">
                  {pending.map((p) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      onApprove={() => setStatus(p, 'approved')}
                      onReject={() => setStatus(p, 'rejected')}
                      onEdit={() => {
                        setEditing(p)
                        setEditText(p.caption)
                      }}
                    />
                  ))}
                </div>
              </section>
            )}
            {others.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">
                  {t('navCalendar')}
                </h2>
                <div className="grid gap-5 md:grid-cols-2">
                  {others.map((p) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      onCopy={() => void copyCaption(p)}
                      copied={copiedId === p.id}
                      onMarkPublished={() => void markPublished(p)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-3 sm:p-4" onClick={() => setEditing(null)}>
          <div role="dialog" aria-modal="true" aria-label="Edit post" className="card modal-panel w-full max-w-lg p-4 sm:p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-bold text-base sm:text-lg">{t('edit')}</h3>
            <textarea value={editText} onChange={(e) => setEditText(e.target.value)} aria-label="Post caption" rows={5} className="input-field resize-none" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="btn-secondary flex-1 sm:flex-initial">
                {t('cancel')}
              </button>
              <button onClick={saveEdit} className="btn-primary flex-1 sm:flex-initial">
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PostCard({
  post,
  onApprove,
  onReject,
  onEdit,
  onCopy,
  copied,
  onMarkPublished,
}: {
  post: PlannedPost
  onApprove?: () => void
  onReject?: () => void
  onEdit?: () => void
  onCopy?: () => void
  copied?: boolean
  onMarkPublished?: () => void
}) {
  const { t } = useCopy()
  return (
    <div className="card animate-fade-up overflow-hidden p-4 sm:p-5 flex flex-col justify-between hover:shadow-xs transition-shadow" dir="auto">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-ink-100 pb-2.5">
          <span className="badge bg-primary-50 text-primary-800 font-semibold text-xs">
            {t(`platform_${post.platform}` as never)}
          </span>
          <span
            className={`badge text-xs ${
              post.status === 'published'
                ? 'bg-primary-50 text-primary-700'
                : post.status === 'failed'
                  ? 'bg-red-50 text-red-600'
                  : post.status === 'rejected'
                    ? 'bg-ink-100 text-ink-500'
                    : 'bg-accent-100 text-accent-700'
            }`}
          >
            {t(`status_${post.status}` as never)}
          </span>
          <span className="ms-auto text-xs text-ink-400 font-normal">
            {new Date(post.scheduled_for).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        </div>

        <p className="text-sm leading-relaxed text-ink-850 font-normal whitespace-pre-wrap">{post.caption}</p>

        {post.hashtags && (
          <p className="mt-2.5 text-xs font-medium text-primary-700 leading-normal" dir="ltr">
            {post.hashtags}
          </p>
        )}

        {post.status === 'published' && post.publish_result?.published_by === 'user' && (
          <p className="mt-2.5 flex items-center gap-1 text-xs text-primary-700">✓ {t('publishedByYou')}</p>
        )}
        {typeof post.publish_result?.error === 'string' && (
          <p className="mt-2.5 text-xs text-red-600">{String(post.publish_result.error)}</p>
        )}
      </div>

      <div>
        {post.status === 'approved' && onMarkPublished && (
          <div className="mt-3.5 rounded-lg bg-primary-50/70 p-2.5 sm:p-3 border border-primary-100">
            <div className="flex flex-wrap gap-2">
              {onCopy && (
                <button onClick={onCopy} className="btn-secondary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                  <Copy size={13} /> {copied ? t('copied') : t('copyCaption')}
                </button>
              )}
              <button onClick={onMarkPublished} className="btn-primary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                <CheckCheck size={13} /> {t('markPublished')}
              </button>
            </div>
          </div>
        )}
        {(onApprove || onEdit || onReject) && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
            {onApprove && (
              <button onClick={onApprove} className="btn-primary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                {t('approve')}
              </button>
            )}
            {onEdit && (
              <button onClick={onEdit} className="btn-secondary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                {t('edit')}
              </button>
            )}
            {onReject && (
              <button onClick={onReject} className="btn-danger px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                {t('reject')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
