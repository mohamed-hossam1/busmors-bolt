'use client'

import { CalendarSkeleton } from '../components/skeletons'
import { useDialog } from '../hooks/useDialog'
import { Link } from '@/shared/i18n'
import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays, CheckCheck, ChevronLeft, ChevronRight, Clock, Copy, ExternalLink, XCircle,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { loadPosts, recoverPosts, updatePosts } from '../server/calendar-actions'
import { approveAndPublishPost, approveAndSchedulePost, preparePostRetry, publishNow, resolveContextHolds, schedulePost } from '../server/publishing-actions'
import { useCopy } from '../hooks/useCopy'
import { useAuth } from '../context/AuthContext'
import { formatWorkspaceTime } from '../lib/region'
import {
  addDays, addMonths, dayHeading, dayKey, hourLabel, localToInstant, monthGrid, monthLabel,
  planTime, startOfWeek, timeLabel, todayKey, weekKeys, weekRangeLabel, weekdayOf, zonedParts,
} from '../lib/calendar'
import type { PlannedPost } from '../lib/types'
import FacebookPostPreview, { type PreviewTimeKind } from '../components/publishing/FacebookPostPreview'
import { usePublishingStatus } from '../hooks/usePreviewPageName'
import type { TranslationKey } from '../lib/i18n'

/** Has an AI-proposed time but no schedule: shown dashed with a "Proposed" badge. */
const isProposed = (post: PlannedPost) => !post.scheduled_for && Boolean(post.proposed_for)

/** Facebook-native scheduling window: Facebook allows 10 minutes to 30 days; BUSMORA keeps a margin. */
const SCHEDULE_MIN_MS = 15 * 60_000
const SCHEDULE_MAX_MS = 29 * 24 * 3_600_000

/** Sent to Facebook as a scheduled post (Facebook publishes it; BUSMORA does not read it back). */
const scheduledOnFacebook = (post: PlannedPost) => post.status === 'scheduled' && post.execution_state === 'confirmed' && Boolean(post.scheduled_for)
/** A Facebook-scheduled post whose time has passed: shown as published via the Facebook schedule, unverified. */
const scheduleTimePassed = (post: PlannedPost, now: number) => scheduledOnFacebook(post) && Date.parse(post.scheduled_for!) <= now

/** Wall clock, read only from event handlers and state initializers (never during render). */
const currentTime = () => Date.now()

/** The allowed scheduling window right now, as datetime-local bounds in the workspace timezone. */
function scheduleWindow(tz: string) {
  const now = currentTime()
  return {
    min: wallTime(new Date(now + SCHEDULE_MIN_MS).toISOString(), tz),
    max: wallTime(new Date(now + SCHEDULE_MAX_MS).toISOString(), tz),
    fits: (instantMs: number) => instantMs - now >= SCHEDULE_MIN_MS && instantMs - now <= SCHEDULE_MAX_MS,
  }
}

/** Step 2 is open once the text is approved and nothing but a connection/missed-window hold blocks it. */
const inStepTwo = (post: PlannedPost) => post.status === 'approved'
  && (post.execution_state === 'idle' || (post.execution_state === 'held' && (post.holds ?? []).every((hold) => hold.kind === 'connection' || hold.kind === 'missed_window')))

/** Owner-facing text for a stored publish error code. */
const publishErrorKey = (post: PlannedPost) => ('publishError_' + String(post.publish_result?.errorCode ?? 'unknown')) as TranslationKey

/** `YYYY-MM-DDTHH:mm` wall time in the workspace timezone, for a datetime-local input. */
function wallTime(iso: string, tz: string) {
  const parts = zonedParts(iso, tz)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

/** Time line of the Facebook preview: published, else scheduled, else proposed, else draft. */
function previewTime(post: PlannedPost, now: number): { timeLabelKind: PreviewTimeKind; time: string | null } {
  if (post.status === 'published') return { timeLabelKind: 'published', time: post.published_at }
  if (scheduleTimePassed(post, now)) return { timeLabelKind: 'published', time: post.scheduled_for }
  if (post.scheduled_for) return { timeLabelKind: 'scheduled', time: post.scheduled_for }
  if (post.proposed_for) return { timeLabelKind: 'proposed', time: post.proposed_for }
  return { timeLabelKind: 'draft', time: null }
}

type View = 'month' | 'week'

const WEEKDAY_KEYS = ['weekdaySun', 'weekdayMon', 'weekdayTue', 'weekdayWed', 'weekdayThu', 'weekdayFri', 'weekdaySat'] as const
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const HOUR_HEIGHT = 48

const TONES: Record<PlannedPost['status'], { chip: string; dot: string }> = {
  draft: { chip: 'bg-ink-50 border-ink-200', dot: 'bg-ink-300' },
  pending_approval: { chip: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  approved: { chip: 'bg-primary-50 border-primary-200', dot: 'bg-primary-500' },
  scheduled: { chip: 'bg-primary-50 border-primary-200', dot: 'bg-primary-500' },
  publishing: { chip: 'bg-accent-50 border-accent-200', dot: 'bg-accent-500' },
  published: { chip: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  failed: { chip: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
  rejected: { chip: 'bg-ink-50 border-ink-200', dot: 'bg-ink-400' },
}

function toneFor(status: PlannedPost['status']) {
  return TONES[status] ?? { chip: 'bg-ink-50 border-ink-200', dot: 'bg-ink-400' }
}

function PlatformIcon({ platform, className }: { platform: PlannedPost['platform']; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      {platform === 'instagram' ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
        </>
      ) : (
        <path
          d="M14 21v-8h2.7l.4-3H14V8.2c0-.9.3-1.5 1.6-1.5h1.7V4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1V10H8.2v3h2.7v8H14Z"
          fill="currentColor"
          stroke="none"
        />
      )}
    </svg>
  )
}

export default function CalendarPage({ initial }: { initial: PlannedPost[] }) {
  const { t } = useCopy()
  const { settings } = useAuth()
  const tz = settings?.timezone ?? 'UTC'
  const { status: publishing, pageName } = usePublishingStatus()
  const canPublish = !!publishing?.configured && publishing.connection?.status === 'connected'
  const publishHint = !publishing?.configured ? t('publishingNotConfigured') : canPublish ? null : t('connectPageFirst')
  const today = todayKey(tz)

  const [posts, setPosts] = useState<PlannedPost[]>(initial)
  const [view, setView] = useState<View>('month')
  const [anchor, setAnchor] = useState(today)
  const [selected, setSelected] = useState(today)
  const [editing, setEditing] = useState<PlannedPost | null>(null)
  const [editText, setEditText] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  // Step-2 dialogs.
  const [scheduling, setScheduling] = useState<{ post: PlannedPost; approve: boolean } | null>(null)
  const [scheduleValue, setScheduleValue] = useState('')
  const [scheduleBounds, setScheduleBounds] = useState<{ min: string; max: string } | null>(null)
  // Clock used for display ("Scheduled" vs "Published via Facebook schedule"); refreshed on each load.
  const [now, setNow] = useState(currentTime)
  const [dialogError, setDialogError] = useState('')
  const [confirmPublish, setConfirmPublish] = useState<PlannedPost | null>(null)
  const [confirmApprovePublish, setConfirmApprovePublish] = useState<PlannedPost | null>(null)
  const [confirmRetry, setConfirmRetry] = useState<PlannedPost | null>(null)
  const [confirmReview, setConfirmReview] = useState<PlannedPost | null>(null)

  useDialog(!!editing, () => setEditing(null))
  useDialog(!!scheduling, () => setScheduling(null))
  useDialog(!!confirmPublish, () => { if (!busy) setConfirmPublish(null) })
  useDialog(!!confirmApprovePublish, () => { if (!busy) setConfirmApprovePublish(null) })
  useDialog(!!confirmRetry, () => setConfirmRetry(null))
  useDialog(!!confirmReview, () => setConfirmReview(null))

  useEffect(() => {
    if (initial.length) return
    let active = true
    void recoverPosts().then(posts => { if (active) setPosts(posts) }).catch(() => { if (active) setError(t('postsRecoverFailed')) })
    return () => { active = false }
  }, [initial])

  const load = async () => {
    try { setPosts(await loadPosts()); setNow(currentTime()); setError('') }
    catch { setError(t('postsLoadFailed')) }
    finally { setLoading(false) }
  }
  const changePosts = async (ids: string[], change: { status?: PlannedPost['status']; caption?: string }) => {
    setBusy(true); setError('')
    try {
      const result = await updatePosts(ids, change)
      if (result.error) { setError(result.error); return false }
      await load(); return true
    } catch { setError(t('postsSaveFailed')); return false }
    finally { setBusy(false) }
  }

  const scheduled = useMemo(() => posts.filter((post) => Boolean(planTime(post))), [posts])
  const unscheduled = useMemo(() => posts.filter((post) => !planTime(post)), [posts])
  const byDay = useMemo(() => {
    const map = new Map<string, PlannedPost[]>()
    for (const post of scheduled) {
      const key = dayKey(planTime(post)!, tz)
      const bucket = map.get(key)
      if (bucket) bucket.push(post)
      else map.set(key, [post])
    }
    for (const bucket of map.values()) bucket.sort((a, b) => Date.parse(planTime(a)!) - Date.parse(planTime(b)!))
    return map
  }, [scheduled, tz])

  const pending = useMemo(() => posts.filter((post) => post.status === 'pending_approval'), [posts])
  const approvedCount = useMemo(() => posts.filter((post) => post.status === 'approved' || post.status === 'scheduled').length, [posts])

  const selectedPosts = byDay.get(selected) ?? []
  const anchorParts = zonedParts(`${anchor}T12:00:00Z`, 'UTC')
  const days = view === 'month' ? monthGrid(anchorParts.year, anchorParts.month) : weekKeys(anchor)

  const goTo = (key: string) => { setAnchor(key); setSelected(key) }
  const shift = (direction: -1 | 1) => {
    if (view === 'month') {
      const next = addMonths(anchorParts.year, anchorParts.month, direction)
      goTo(`${next.year}-${String(next.month).padStart(2, '0')}-01`)
      return
    }
    goTo(addDays(anchor, direction * 7))
  }

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

  /** Runs one step-2 action, then reloads; returns false and shows the error on failure. */
  const runAction = async (action: () => Promise<{ error?: string }>) => {
    setBusy(true); setError('')
    let message = ''
    try {
      const result = await action()
      if (result.error) message = result.error
    } catch { message = t('errPostSave') }
    // Reload first: load() clears errors on success, so the action's message is set after it.
    await load()
    if (message) setError(message)
    setBusy(false)
    return !message
  }

  const openSchedule = (post: PlannedPost, approve = false) => {
    setScheduling({ post, approve })
    // Prefill the proposed time only when Facebook would accept it.
    const range = scheduleWindow(tz)
    setScheduleBounds({ min: range.min, max: range.max })
    setScheduleValue(post.proposed_for && range.fits(Date.parse(post.proposed_for)) ? wallTime(post.proposed_for, tz) : '')
    setDialogError('')
  }
  const confirmSchedule = async () => {
    if (!scheduling) return
    if (!scheduleValue) { setDialogError(t('scheduleTimeRequired')); return }
    // Interpreted in the workspace timezone, never the browser's.
    const instant = localToInstant(scheduleValue, tz)
    if (!instant) { setDialogError(t('scheduleTimeMissing')); return }
    if (!scheduleWindow(tz).fits(Date.parse(instant))) { setDialogError(t('errTimeOutOfRange')); return }
    const { post, approve } = scheduling
    const action = approve
      ? () => approveAndSchedulePost(post.id, post.version, instant, post.status)
      : () => schedulePost(post.id, post.version, instant)
    if (await runAction(action)) setScheduling(null)
  }
  const confirmPublishNow = async () => {
    if (!confirmPublish) return
    const post = confirmPublish
    await runAction(() => publishNow(post.id, post.version))
    setConfirmPublish(null)
  }
  const confirmApprovePublishNow = async () => {
    if (!confirmApprovePublish) return
    const post = confirmApprovePublish
    await runAction(() => approveAndPublishPost(post.id, post.version, post.status))
    setConfirmApprovePublish(null)
  }

  /** Which actions a card offers: step 1, step 2, scheduled, failed, on hold, or read-only once published. */
  const cardProps = (post: PlannedPost) => {
    // Sent to Facebook (published, being sent, or scheduled there): locked, no edit.
    const published = post.status === 'published' || post.status === 'scheduled'
    const sending = post.status === 'publishing'
    const contextHold = post.execution_state === 'held' && (post.holds ?? []).some((hold) => hold.kind === 'context')
    const needsApproval = ['draft', 'pending_approval', 'rejected'].includes(post.status)
    const canApproveAndSend = needsApproval && post.platform === 'facebook'
    return {
      post,
      pageName,
      now,
      busy,
      canPublish,
      publishHint,
      onApprove: needsApproval ? () => setStatus(post, 'approved') : undefined,
      onApproveSchedule: canApproveAndSend ? () => openSchedule(post, true) : undefined,
      onApprovePublish: canApproveAndSend ? () => setConfirmApprovePublish(post) : undefined,
      onReject: ['draft', 'pending_approval', 'rejected', 'approved'].includes(post.status) ? () => setStatus(post, 'rejected') : undefined,
      onEdit: published || sending ? undefined : () => { setEditing(post); setEditText(post.caption) },
      onCopy: () => void copyCaption(post),
      copied: copiedId === post.id,
      onMarkPublished: () => void markPublished(post),
      onSchedule: inStepTwo(post) ? () => openSchedule(post) : undefined,
      onPublishNow: inStepTwo(post) ? () => setConfirmPublish(post) : undefined,
      onReviewed: contextHold ? () => setConfirmReview(post) : undefined,
      onRetry: post.execution_state === 'failed' ? () => void runAction(() => preparePostRetry(post.id, post.version))
        : post.execution_state === 'uncertain' ? () => setConfirmRetry(post) : undefined,
    }
  }

  const heading = view === 'month'
    ? monthLabel(anchorParts.year, anchorParts.month)
    : weekRangeLabel(startOfWeek(anchor))

  if (loading) {
    return <CalendarSkeleton />
  }

  return (
    <div className="workspace-page">
      <div className="mx-auto max-w-6xl">
        {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}

        <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="brain-page-heading"><CalendarDays size={22} /></span>
            <div><h1 className="workspace-heading">{t('calendarTitle')}</h1><p className="workspace-description">{t('calendarDescription')}</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {pending.length > 0 && (
              <>
                <button onClick={approveAll} disabled={busy} className="btn-secondary px-3.5 py-1.5 text-xs sm:text-sm flex-1 sm:flex-initial justify-center">
                  <CheckCheck size={15} /> {t('approveAll')}
                </button>
                <button onClick={rejectAll} disabled={busy} className="btn-secondary px-3.5 py-1.5 text-xs sm:text-sm flex-1 sm:flex-initial justify-center">
                  <XCircle size={15} /> {t('rejectAll')}
                </button>
              </>
            )}
          </div>
        </header>

        <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">{[
          { id: 'all', label: t('calendarStatAll'), value: posts.length }, { id: 'review', label: t('calendarStatToReview'), value: pending.length }, { id: 'approved', label: t('status_approved'), value: approvedCount },
        ].map((stat) => <div key={stat.id} className="stat-card"><p className="text-xs text-ink-600">{stat.label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{stat.value}</p></div>)}</div>

        {posts.length === 0 && (
              <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-dashed border-ink-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary-200 bg-primary-50 text-primary-500">
                    <CalendarDays size={18} strokeWidth={1.7} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{t('calendarReadyTitle')}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-600">{t('calendarReadyHint')}</p>
                  </div>
                </div>
                <Link href="/employee" className="btn-primary shrink-0 px-4 py-2 text-xs sm:text-sm">{t('talkToDirector')}</Link>
              </div>
            )}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <button onClick={() => shift(-1)} aria-label={t('calendarPrevious')} className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-500 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => shift(1)} aria-label={t('calendarNext')} className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-500 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">
                  <ChevronRight size={16} />
                </button>
                <button onClick={() => goTo(today)} className="btn-secondary h-9 px-3.5 py-0 text-xs">{t('calendarToday')}</button>
                <h2 className="ms-1.5 text-base font-semibold tracking-tight text-ink-900 sm:text-lg">{heading}</h2>
              </div>

              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-1.5 text-xs text-ink-400 sm:flex">
                  <Clock size={13} /> {t('calendarTimezone', { zone: tz })}
                </span>
                <div role="group" aria-label={t('calendarViewLabel')} className="flex rounded-full border border-ink-200 bg-white p-1">
                  {(['month', 'week'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={view === option}
                      onClick={() => setView(option)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${view === option ? 'bg-primary-500 text-white shadow-2xs' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800'}`}
                    >
                      {option === 'month' ? t('calendarMonthView') : t('calendarWeekView')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {approvedCount > 0 && (
              <p className="mb-4 rounded-lg bg-primary-50 px-4 py-2.5 text-sm text-primary-800">
                {canPublish ? t('fbScheduleHint') : t('publishYourselfHint')}
              </p>
            )}

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              {view === 'month' ? (
                <MonthGrid
                  days={days}
                  month={anchorParts.month}
                  today={today}
                  selected={selected}
                  byDay={byDay}
                  tz={tz}
                  onSelect={goTo}
                />
              ) : (
                <WeekGrid
                  days={days}
                  today={today}
                  selected={selected}
                  byDay={byDay}
                  tz={tz}
                  onSelect={goTo}
                />
              )}

              <aside className="flex flex-col gap-3 rounded-2xl border border-ink-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2 border-b border-ink-100 pb-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-ink-400">{t('calendarDayPlan')}</p>
                    <h2 className="mt-1 text-sm font-semibold text-ink-900">{dayHeading(selected)}</h2>
                  </div>
                  <span className="badge bg-ink-100 text-ink-600">{selectedPosts.length}</span>
                </div>

                {selectedPosts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-500">{t('calendarDayEmpty')}</p>
                ) : (
                  <div className="space-y-4">
                    {selectedPosts.map((post) => <PostCard key={post.id} {...cardProps(post)} />)}
                  </div>
                )}
              </aside>
            </div>

            {unscheduled.length > 0 && (
              <section className="mt-7">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">{t('calendarUnscheduledTitle')} — {unscheduled.length}</h2>
                  <p className="text-xs text-ink-400">{t('calendarUnscheduledHint')}</p>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  {unscheduled.map((post) => <PostCard key={post.id} {...cardProps(post)} />)}
                </div>
              </section>
            )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-3 sm:p-4" onClick={() => setEditing(null)}>
          <div role="dialog" aria-modal="true" aria-label={t('editPost')} className="card modal-panel w-full max-w-lg p-4 sm:p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-bold text-base sm:text-lg">{t('edit')}</h3>
            <textarea value={editText} onChange={(e) => setEditText(e.target.value)} aria-label={t('postCaptionLabel')} rows={5} className="input-field resize-none" />
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

      {scheduling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-3 sm:p-4" onClick={() => setScheduling(null)}>
          <div role="dialog" aria-modal="true" aria-label={t(scheduling.approve ? 'approveAndSchedule' : 'scheduleDialogTitle')} className="card modal-panel w-full max-w-lg p-4 sm:p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-bold text-base sm:text-lg">{t(scheduling.approve ? 'approveAndSchedule' : 'scheduleDialogTitle')}</h3>
            <div className="card p-3"><FacebookPostPreview compact pageName={pageName} caption={scheduling.post.caption} hashtags={scheduling.post.hashtags} timezone={tz} timeLabelKind="draft" /></div>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">{t('scheduleTimeLabel', { zone: tz })}</span>
              <input
                type="datetime-local"
                required
                min={scheduleBounds?.min}
                max={scheduleBounds?.max}
                value={scheduleValue}
                onChange={(e) => { setScheduleValue(e.target.value); setDialogError('') }}
                className="input-field"
              />
            </label>
            <p className="mt-2 text-xs text-ink-500">{t('scheduleRangeHint')}</p>
            <p className="mt-3 text-sm text-ink-600">{t('scheduleConfirmText', { page: pageName })}</p>
            {dialogError && <p className="mt-2 text-xs text-red-600">{dialogError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setScheduling(null)} className="btn-secondary flex-1 sm:flex-initial">{t('cancel')}</button>
              <button onClick={() => void confirmSchedule()} disabled={busy} className="btn-primary flex-1 sm:flex-initial">{t(scheduling.approve ? 'approveAndSchedule' : 'schedule')}</button>
            </div>
          </div>
        </div>
      )}

      {confirmPublish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-3 sm:p-4" onClick={() => { if (!busy) setConfirmPublish(null) }}>
          <div role="dialog" aria-modal="true" aria-label={t('publishNowTitle')} className="card modal-panel w-full max-w-lg p-4 sm:p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-bold text-base sm:text-lg">{t('publishNowTitle')}</h3>
            <div className="card p-3"><FacebookPostPreview compact pageName={pageName} caption={confirmPublish.caption} hashtags={confirmPublish.hashtags} timezone={tz} timeLabelKind="draft" /></div>
            <p className="mt-3 text-sm text-ink-700">{t('publishNowConfirm', { page: pageName })}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmPublish(null)} disabled={busy} className="btn-secondary flex-1 sm:flex-initial">{t('cancel')}</button>
              <button onClick={() => void confirmPublishNow()} disabled={busy} className="btn-primary flex-1 sm:flex-initial justify-center">
                {busy && <Spinner size={14} />}{busy ? t('publishing') : t('publishNow')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmApprovePublish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-3 sm:p-4" onClick={() => { if (!busy) setConfirmApprovePublish(null) }}>
          <div role="dialog" aria-modal="true" aria-label={t('approveAndPublish')} className="card modal-panel w-full max-w-lg p-4 sm:p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-bold text-base sm:text-lg">{t('approveAndPublish')}</h3>
            <div className="card p-3"><FacebookPostPreview compact pageName={pageName} caption={confirmApprovePublish.caption} hashtags={confirmApprovePublish.hashtags} timezone={tz} timeLabelKind="draft" /></div>
            <p className="mt-3 text-sm text-ink-700">{t('approveAndPublishConfirm', { page: pageName })}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmApprovePublish(null)} disabled={busy} className="btn-secondary flex-1 sm:flex-initial">{t('cancel')}</button>
              <button onClick={() => void confirmApprovePublishNow()} disabled={busy} className="btn-primary flex-1 sm:flex-initial justify-center">
                {busy && <Spinner size={14} />}{busy ? t('publishing') : t('approveAndPublish')}
              </button>
            </div>
          </div>
        </div>
      )}

      {(confirmRetry || confirmReview) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-3 sm:p-4" onClick={() => { setConfirmRetry(null); setConfirmReview(null) }}>
          <div role="dialog" aria-modal="true" aria-label={confirmRetry ? t('checkedPrepareRetry') : t('reviewedKeepText')} className="card modal-panel w-full max-w-lg p-4 sm:p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-bold text-base sm:text-lg">{confirmRetry ? t('checkedPrepareRetry') : t('reviewedKeepText')}</h3>
            <p className="text-sm text-ink-700">{confirmRetry ? t('checkedNotPublished') : t('reviewedKeepTextConfirm')}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setConfirmRetry(null); setConfirmReview(null) }} className="btn-secondary flex-1 sm:flex-initial">{t('cancel')}</button>
              <button
                disabled={busy}
                className="btn-primary flex-1 sm:flex-initial"
                onClick={() => {
                  const post = confirmRetry ?? confirmReview!
                  const action = confirmRetry ? () => preparePostRetry(post.id, post.version) : () => resolveContextHolds(post.id, post.version)
                  setConfirmRetry(null); setConfirmReview(null)
                  void runAction(action)
                }}
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MonthGrid({
  days, month, today, selected, byDay, tz, onSelect,
}: {
  days: string[]
  month: number
  today: string
  selected: string
  byDay: Map<string, PlannedPost[]>
  tz: string
  onSelect: (key: string) => void
}) {
  const weeks = Array.from({ length: 6 }, (_, index) => days.slice(index * 7, index * 7 + 7))
  const { t } = useCopy()
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[620px] overflow-hidden rounded-2xl border border-ink-200 bg-ink-100">
        <div className="grid grid-cols-7 gap-px bg-ink-100">
          {WEEKDAY_KEYS.map((key) => (
            <div key={key} className="bg-ink-50 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-500">{t(key as never)}</div>
          ))}
        </div>

        <div className="grid gap-px bg-ink-100">
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-7 gap-px bg-ink-100">
              {week.map((key) => {
                const day = Number(key.slice(8))
                const outside = Number(key.slice(5, 7)) !== month
                const isToday = key === today
                const isSelected = key === selected
                const items = byDay.get(key) ?? []
                return (
                  <div
                    key={key}
                    className={`min-h-[104px] p-1.5 ${outside ? 'bg-ink-50/50' : 'bg-white'} ${isSelected ? 'bg-primary-50/70' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(key)}
                      aria-label={dayHeading(key)}
                      aria-pressed={isSelected}
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
                        isToday
                          ? 'bg-primary-500 text-white'
                          : outside
                            ? 'text-ink-300 hover:bg-ink-100'
                            : 'text-ink-700 hover:bg-ink-100'
                      }`}
                    >
                      {day}
                    </button>

                    <div className="mt-1 space-y-1">
                      {items.slice(0, 3).map((post) => (
                        <PostChip key={post.id} post={post} tz={tz} onSelect={() => onSelect(key)} />
                      ))}
                      {items.length > 3 && (
                        <button
                          type="button"
                          onClick={() => onSelect(key)}
                          className="w-full rounded-md px-1.5 py-0.5 text-start text-[11px] font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
                        >
                          {t(`calendarMore`, { count: items.length - 3 })}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function WeekGrid({
  days, today, selected, byDay, tz, onSelect,
}: {
  days: string[]
  today: string
  selected: string
  byDay: Map<string, PlannedPost[]>
  tz: string
  onSelect: (key: string) => void
}) {
  const { t } = useCopy()
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-ink-100 bg-ink-50/70">
        <div />
        {days.map((key) => {
          const isToday = key === today
          const isSelected = key === selected
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-label={dayHeading(key)}
              aria-pressed={isSelected}
              className={`flex flex-col items-center gap-0.5 border-s border-ink-100 py-2 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-300 ${isSelected ? 'bg-primary-50' : ''}`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{t(WEEKDAY_KEYS[weekdayOf(key)] as never)}</span>
              <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold ${isToday ? 'bg-primary-500 text-white' : 'text-ink-800'}`}>
                {Number(key.slice(8))}
              </span>
            </button>
          )
        })}
      </div>

      <div className="max-h-[560px] overflow-y-auto">
        <div className="flex">
          <div className="w-[52px] shrink-0">
            {HOURS.map((hour) => (
              <div key={hour} className="flex items-start justify-end border-b border-ink-100/60 pe-2" style={{ height: HOUR_HEIGHT }}>
                <span className="relative -top-1.5 text-[10px] font-medium text-ink-400">{hourLabel(hour)}</span>
              </div>
            ))}
          </div>

          <div className="grid flex-1 grid-cols-7">
            {days.map((key) => {
              const isSelected = key === selected
              return (
                <div key={key} className={`relative border-s border-ink-100 ${isSelected ? 'bg-primary-50/40' : ''}`}>
                  {HOURS.map((hour) => (
                    <div key={hour} className="border-b border-ink-100/60" style={{ height: HOUR_HEIGHT }} />
                  ))}
                  {(byDay.get(key) ?? []).map((post) => {
                    const time = planTime(post)!
                    const parts = zonedParts(time, tz)
                    const tone = toneFor(post.status)
                    const proposed = isProposed(post)
                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => onSelect(key)}
                        className={`card absolute inset-x-0.5 overflow-hidden rounded-md border px-1 py-0.5 text-start transition hover:shadow-sm ${tone.chip} ${proposed ? 'border-dashed' : ''}`}
                        style={{ top: (parts.hour + parts.minute / 60) * HOUR_HEIGHT, height: HOUR_HEIGHT - 4 }}
                      >
                        <span className="flex items-center gap-1 text-[10px] font-semibold">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
                          <span className="truncate">{timeLabel(time, tz)}</span>
                        </span>
                        {proposed && <span className="badge mt-0.5 w-fit max-w-full truncate bg-ink-100 px-1 py-0 text-[9px] text-ink-600">{t('proposedBadge')}</span>}
                        <span className={`mt-0.5 ${proposed ? 'line-clamp-1' : 'line-clamp-2'} block text-[10px] leading-tight text-ink-700`}>{post.caption}</span>
                        <span className="sr-only">{formatWorkspaceTime(time, tz)}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function PostChip({ post, tz, onSelect }: { post: PlannedPost; tz: string; onSelect: () => void }) {
  const { t } = useCopy()
  const tone = toneFor(post.status)
  const time = planTime(post)!
  const proposed = isProposed(post)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${t(`platform_${post.platform}` as never)} — ${proposed ? t('proposedBadge') + ' ' : ''}${formatWorkspaceTime(time, tz)}`}
      className={`card relative flex w-full min-w-0 flex-col gap-0.5 rounded-lg border px-1.5 py-1 text-start text-[11px] leading-snug transition hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${tone.chip} ${proposed ? 'border-dashed' : ''}`}
    >
      <span className="flex min-w-0 items-center gap-1 font-semibold">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
        <span className="truncate">{timeLabel(time, tz)}</span>
        <PlatformIcon platform={post.platform} className="ms-auto h-3 w-3 shrink-0 opacity-60" />
      </span>
      {proposed && <span className="badge w-fit max-w-full truncate bg-ink-100 px-1.5 py-0 text-[9px] text-ink-600">{t('proposedBadge')}</span>}
      <span className={`${proposed ? 'line-clamp-1' : 'line-clamp-2'} break-words text-ink-700`}>{post.caption}</span>
      <span className="sr-only">{formatWorkspaceTime(time, tz)}</span>
    </button>
  )
}

function PostCard({
  post,
  onApprove,
  onApproveSchedule,
  onApprovePublish,
  onReject,
  onEdit,
  onCopy,
  copied,
  onMarkPublished,
  pageName,
  now,
  busy,
  canPublish,
  publishHint,
  onSchedule,
  onPublishNow,
  onReviewed,
  onRetry,
}: {
  post: PlannedPost
  pageName: string
  now: number
  busy?: boolean
  canPublish?: boolean
  publishHint?: string | null
  onApprove?: () => void
  onApproveSchedule?: () => void
  onApprovePublish?: () => void
  onReject?: () => void
  onEdit?: () => void
  onCopy?: () => void
  copied?: boolean
  onMarkPublished?: () => void
  onSchedule?: () => void
  onPublishNow?: () => void
  onReviewed?: () => void
  onRetry?: () => void
}) {
  const { t } = useCopy()
  const { settings } = useAuth()
  const tz = settings?.timezone ?? 'UTC'
  const [selfPublish, setSelfPublish] = useState(false)
  const held = post.execution_state === 'held'
  const uncertain = post.execution_state === 'uncertain'
  const permalink = typeof post.publish_result?.permalink === 'string' ? post.publish_result.permalink : null
  // A Facebook-scheduled post whose time has passed reads as published (unverified; see note).
  const shownStatus = scheduleTimePassed(post, now) ? 'published' : post.status
  return (
    <div className="card animate-fade-up overflow-hidden p-4 sm:p-5 flex flex-col justify-between hover:shadow-xs transition-shadow" dir="auto">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-ink-100 pb-2.5">
          <span className="badge bg-primary-50 text-primary-800 font-semibold text-xs">
            {t(`platform_${post.platform}` as never)}
          </span>
          <span
            className={`badge text-xs ${
              shownStatus === 'published'
                ? 'bg-primary-50 text-primary-700'
                : post.status === 'failed'
                  ? 'bg-red-50 text-red-600'
                  : post.status === 'rejected'
                    ? 'bg-ink-100 text-ink-500'
                    : 'bg-accent-100 text-accent-700'
            }`}
          >
            {t(`status_${shownStatus}` as never)}
          </span>
          {held && <span className="badge bg-amber-50 text-amber-700 text-xs">{t('onHold')}</span>}
          {uncertain && <span className="badge bg-amber-50 text-amber-700 text-xs">{t('needsReview')}</span>}
          <span className="ms-auto text-xs text-ink-400 font-normal">
            {planTime(post) ? formatWorkspaceTime(planTime(post)!, tz) : t('calendarNoTime')}
          </span>
        </div>

        <FacebookPostPreview compact pageName={pageName} caption={post.caption} hashtags={post.hashtags} timezone={tz} {...previewTime(post, now)} />

        {post.status === 'published' && post.publish_result?.published_by === 'user' && (
          <p className="mt-2.5 flex items-center gap-1 text-xs text-primary-700">✓ {t('publishedByYou')}</p>
        )}
        {post.status === 'published' && post.execution_state === 'confirmed' && (
          <p className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-primary-700">
            ✓ {t('publishedOnFacebook')}
            {permalink && <a href={permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold hover:underline">{t('viewOnFacebook')} <ExternalLink size={12} /></a>}
          </p>
        )}
        {scheduledOnFacebook(post) && (scheduleTimePassed(post, now) ? (
          <>
            <p className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-primary-700">
              {t('publishedViaSchedule', { time: formatWorkspaceTime(post.scheduled_for!, tz) })}
              {permalink && <a href={permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold hover:underline">{t('viewOnFacebook')} <ExternalLink size={12} /></a>}
            </p>
            <p className="mt-1 text-xs text-ink-500">{t('publishedViaScheduleNote')}</p>
          </>
        ) : (
          <>
            <p className="mt-2.5 text-xs font-semibold text-primary-800">{t('scheduledOnFacebook', { time: formatWorkspaceTime(post.scheduled_for!, tz) })}</p>
            <p className="mt-1 text-xs text-ink-500">{t('scheduledLocked')}</p>
          </>
        ))}
        {post.status === 'published' && <p className="mt-2 text-xs text-ink-500">{t('publishedReadOnly')}</p>}
        {(post.execution_state === 'failed' || uncertain) && (
          <p className="mt-2.5 text-xs text-red-600">{t(publishErrorKey(post))}</p>
        )}
        {held && (post.holds ?? []).map((hold, index) => (
          <p key={index} className="mt-2 text-xs text-amber-700">{hold.reason}</p>
        ))}
        {typeof post.publish_result?.error === 'string' && (
          <p className="mt-2.5 text-xs text-red-600">{String(post.publish_result.error)}</p>
        )}
      </div>

      <div>
        {(onSchedule || onPublishNow) && post.status !== 'publishing' && (
          <div className="mt-3.5 rounded-lg bg-primary-50/70 p-2.5 sm:p-3 border border-primary-100">
            <div className="flex flex-wrap gap-2">
              {onSchedule && (
                <button onClick={onSchedule} disabled={busy || !canPublish} className="btn-primary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                  {t('schedule')}
                </button>
              )}
              {onPublishNow && (
                <button onClick={onPublishNow} disabled={busy || !canPublish} className="btn-secondary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                  {t('publishNow')}
                </button>
              )}
              {onSchedule && (
                <button onClick={() => setSelfPublish((open) => !open)} className="px-2 py-1.5 text-xs font-semibold text-primary-700 hover:underline">
                  {t('publishYourself')}
                </button>
              )}
            </div>
            {!canPublish && publishHint && (onSchedule || onPublishNow) && (
              <p className="mt-2 text-xs text-ink-500">
                {publishHint === t('connectPageFirst') ? <Link href="/settings" className="font-semibold text-primary-700 hover:underline">{publishHint}</Link> : publishHint}
              </p>
            )}
            {selfPublish && onSchedule && (
              <div className="mt-2.5 flex flex-wrap gap-2 border-t border-primary-100 pt-2.5">
                {onCopy && (
                  <button onClick={onCopy} className="btn-secondary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                    <Copy size={13} /> {copied ? t('copied') : t('copyCaption')}
                  </button>
                )}
                {onMarkPublished && (
                  <button onClick={onMarkPublished} className="btn-primary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                    <CheckCheck size={13} /> {t('markPublished')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {(onRetry || onReviewed) && (
          <div className="mt-3.5 flex flex-wrap gap-2">
            {onRetry && (
              <button onClick={onRetry} disabled={busy} className="btn-secondary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                {uncertain ? t('checkedPrepareRetry') : t('prepareRetry')}
              </button>
            )}
            {onReviewed && (
              <button onClick={onReviewed} disabled={busy} className="btn-secondary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                {t('reviewedKeepText')}
              </button>
            )}
          </div>
        )}
        {(onApprove || onEdit || onReject) && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
            {onApprove && (
              <button onClick={onApprove} className="btn-primary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                {t('approve')}
              </button>
            )}
            {onApproveSchedule && (
              <button onClick={onApproveSchedule} disabled={busy || !canPublish} className="btn-secondary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                <CalendarDays size={13} /> {t('approveAndSchedule')}
              </button>
            )}
            {onApprovePublish && (
              <button onClick={onApprovePublish} disabled={busy || !canPublish} className="btn-secondary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                {t('approveAndPublish')}
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
        {!canPublish && publishHint && (onApproveSchedule || onApprovePublish) && (
          <p className="mt-2 text-xs text-ink-500">
            {publishHint === t('connectPageFirst') ? <Link href="/settings" className="font-semibold text-primary-700 hover:underline">{publishHint}</Link> : publishHint}
          </p>
        )}
      </div>
    </div>
  )
}