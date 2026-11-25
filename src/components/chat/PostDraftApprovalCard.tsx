'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, CheckCheck, ExternalLink, Send } from 'lucide-react'
import { Link } from '@/shared/i18n'
import { useCopy } from '../../hooks/useCopy'
import { useAuth } from '../../context/AuthContext'
import { usePublishingStatus } from '../../hooks/usePreviewPageName'
import FacebookPostPreview, { type PreviewTimeKind } from '../publishing/FacebookPostPreview'
import { loadPostStates, updatePosts } from '../../server/calendar-actions'
import { approveAndPublishPost, approveAndSchedulePost, publishNow, schedulePost } from '../../server/publishing-actions'
import { localToInstant, zonedParts } from '../../lib/calendar'
import { formatWorkspaceTime } from '../../lib/region'
import type { PlannedPost, PostStatus } from '../../lib/types'
import type { DraftRefData } from './employeeCards'

/** Facebook-native scheduling window (Facebook allows 10 min–30 days; BUSMORA keeps a margin). */
const SCHEDULE_MIN_MS = 15 * 60_000
const SCHEDULE_MAX_MS = 29 * 24 * 3_600_000

const needsApproval = (status: string) => ['draft', 'pending_approval', 'rejected'].includes(status)
const isSent = (status: string) => status === 'scheduled' || status === 'published'

/** `YYYY-MM-DDTHH:mm` wall time in the workspace timezone, for a datetime-local input. */
function wallTime(iso: string, tz: string): string {
  const parts = zonedParts(iso, tz)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

/** Live post state, or a graceful fallback built from the captured draft fields. */
function fallbackPost(item: DraftRefData): PlannedPost {
  const status = (item.status as PostStatus) ?? 'draft'
  return {
    id: item.postId,
    workspace_id: '',
    deliverable_id: null,
    task_id: null,
    platform: item.platform ?? 'facebook',
    caption: item.caption ?? '',
    hashtags: item.hashtags ?? '',
    image_url: null,
    status,
    scheduled_for: null,
    proposed_for: item.proposedFor,
    version: item.version,
    approval_state: status === 'approved' ? 'approved' : 'unapproved',
    execution_state: 'idle',
    published_at: null,
    current_version_id: null,
    idempotency_key: '',
    publish_result: null,
    created_at: '',
  }
}

function previewTime(post: PlannedPost): { timeLabelKind: PreviewTimeKind; time: string | null } {
  if (post.status === 'published') return { timeLabelKind: 'published', time: post.published_at ?? post.scheduled_for }
  if (post.scheduled_for) return { timeLabelKind: 'scheduled', time: post.scheduled_for }
  if (post.proposed_for) return { timeLabelKind: 'proposed', time: post.proposed_for }
  return { timeLabelKind: 'draft', time: null }
}

/**
 * Inline Chat card for a saved post draft: shows the live status and a Facebook
 * preview, and offers the human-gate actions (Approve, Approve & Schedule,
 * Approve & Publish, or Schedule / Publish now once approved). The approved
 * draft is never lost when no Facebook Page is connected — the owner is pointed
 * to Settings to connect one and can retry.
 */
export default function PostDraftApprovalCard({ item }: { item: DraftRefData }) {
  const { t } = useCopy()
  const { settings } = useAuth()
  const tz = settings?.timezone ?? 'Africa/Cairo'
  const { status: publishing, pageName } = usePublishingStatus()
  const canPublish = !!publishing?.configured && publishing.connection?.status === 'connected'

  const [post, setPost] = useState<PlannedPost | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [needsConnection, setNeedsConnection] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleValue, setScheduleValue] = useState('')
  const [scheduleError, setScheduleError] = useState('')
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [confirmApprovePublish, setConfirmApprovePublish] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const rows = await loadPostStates([item.postId])
      setPost(rows[0] ?? null)
    } catch {
      /* keep the captured fallback fields */
    }
  }, [item.postId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const shown = post ?? fallbackPost(item)
  const status = shown.status
  const sent = isSent(status)
  const locked = sent || status === 'publishing'

  // Prefill the proposed time only when Facebook would accept it.
  const openSchedule = () => {
    const now = Date.now()
    const fits = (iso: string) => {
      const ms = Date.parse(iso) - now
      return ms >= SCHEDULE_MIN_MS && ms <= SCHEDULE_MAX_MS
    }
    setScheduleValue(shown.proposed_for && fits(shown.proposed_for) ? wallTime(shown.proposed_for, tz) : '')
    setScheduleError('')
    setShowSchedule(true)
  }

  const run = async (action: () => Promise<{ error?: string | null; needsConnection?: boolean }>) => {
    setBusy(true)
    setError('')
    setNeedsConnection(false)
    try {
      const result = await action()
      if (result.needsConnection) setNeedsConnection(true)
      if (result.error) setError(result.error)
    } catch {
      setError(t('errPostSave'))
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const approve = () => void run(() => updatePosts([shown.id], { status: 'approved' }))
  const reject = () => void run(() => updatePosts([shown.id], { status: 'rejected' }))

  const confirmSchedule = async (approveFirst: boolean) => {
    if (!scheduleValue) { setScheduleError(t('scheduleTimeRequired')); return }
    const instant = localToInstant(scheduleValue, tz)
    if (!instant) { setScheduleError(t('scheduleTimeMissing')); return }
    const ms = Date.parse(instant) - Date.now()
    if (ms < SCHEDULE_MIN_MS || ms > SCHEDULE_MAX_MS) { setScheduleError(t('errTimeOutOfRange')); return }
    setScheduleError('')
    await run(() =>
      approveFirst
        ? approveAndSchedulePost(shown.id, shown.version, instant, status)
        : schedulePost(shown.id, shown.version, instant),
    )
    setShowSchedule(false)
  }

  const doPublishNow = async (approveFirst: boolean) => {
    setConfirmPublish(false)
    setConfirmApprovePublish(false)
    await run(() =>
      approveFirst
        ? approveAndPublishPost(shown.id, shown.version, status)
        : publishNow(shown.id, shown.version),
    )
  }

  const time = previewTime(shown)
  const connectHint = !publishing?.configured ? t('publishingNotConfigured') : t('connectPageFirst')

  return (
    <div className="mt-2 rounded-xl border border-ink-200 bg-white p-3.5 shadow-sm transition-shadow hover:shadow-card" dir="auto">
      <div className="mb-2.5 flex flex-wrap items-center gap-2 border-b border-ink-100 pb-2.5">
        <span className="badge bg-primary-50 font-semibold text-primary-800 text-[11px]">
          {t(`platform_${shown.platform}` as never)}
        </span>
        <span className="badge bg-accent-100 text-accent-700 text-[11px]">
          {t(`status_${status}` as never)}
        </span>
        <Link href="/scheduling" className="ms-auto inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700 hover:underline">
          {t('viewInCalendar')} <ExternalLink size={12} />
        </Link>
      </div>

      {shown.platform === 'facebook' ? (
        <FacebookPostPreview compact pageName={pageName} caption={shown.caption} hashtags={shown.hashtags} timezone={tz} {...time} />
      ) : (
        <div className="min-w-0 break-words">
          <p dir="auto" className="whitespace-pre-wrap text-sm text-ink-900 line-clamp-3">{shown.caption}</p>
          {shown.hashtags?.trim() && <p dir="ltr" className="mt-1 text-sm text-[#385898] line-clamp-1">{shown.hashtags.trim()}</p>}
          {time.time && time.timeLabelKind !== 'draft' && (
            <p className="mt-1 text-[11px] text-ink-500">{formatWorkspaceTime(time.time, tz)}</p>
          )}
        </div>
      )}

      {item.visualBrief && item.visualBrief.trim() && (
        <div className="mt-2.5 rounded-lg bg-ink-50 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-ink-400">{t('visualBriefLabel')}</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-700 line-clamp-4">{item.visualBrief}</p>
        </div>
      )}

      {(error || needsConnection) && (
        <div className="mt-2.5 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
          {needsConnection ? t('connectPageToPublish') : error}
          {needsConnection && (
            <Link href="/settings" className="mt-1 inline-block font-semibold text-primary-700 hover:underline">{connectHint}</Link>
          )}
        </div>
      )}
      {error && needsConnection && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {!locked && (
        <div className="mt-3 flex flex-wrap gap-2">
          {needsApproval(status) && (
            <>
              <button onClick={approve} disabled={busy} className="btn-primary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                <CheckCheck size={13} /> {t('approve')}
              </button>
              {shown.platform === 'facebook' && (
                <>
                  <button onClick={openSchedule} disabled={busy || !canPublish} className="btn-secondary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                    <CalendarClock size={13} /> {t('approveAndSchedule')}
                  </button>
                  <button onClick={() => setConfirmApprovePublish(true)} disabled={busy || !canPublish} className="btn-secondary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                    <Send size={13} /> {t('approveAndPublish')}
                  </button>
                </>
              )}
              <button onClick={reject} disabled={busy} className="btn-danger px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                {t('reject')}
              </button>
            </>
          )}
          {status === 'approved' && shown.platform === 'facebook' && (
            <>
              <button onClick={openSchedule} disabled={busy || !canPublish} className="btn-primary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                {t('schedule')}
              </button>
              <button onClick={() => setConfirmPublish(true)} disabled={busy || !canPublish} className="btn-secondary px-3 py-1.5 text-xs flex-1 sm:flex-initial justify-center shadow-2xs">
                {t('publishNow')}
              </button>
            </>
          )}
        </div>
      )}

      {!canPublish && !locked && (
        <p className="mt-2 text-xs text-ink-500">
          <Link href="/settings" className="font-semibold text-primary-700 hover:underline">{connectHint}</Link>
        </p>
      )}

      {showSchedule && (
        <div className="mt-3 rounded-lg border border-primary-100 bg-primary-50/70 p-2.5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-700">{t('scheduleTimeLabel', { zone: tz })}</span>
            <input
              type="datetime-local"
              value={scheduleValue}
              onChange={(e) => { setScheduleValue(e.target.value); setScheduleError('') }}
              className="input-field"
            />
          </label>
          <p className="mt-1.5 text-[11px] text-ink-500">{t('scheduleRangeHint')}</p>
          {scheduleError && <p className="mt-1 text-[11px] text-red-600">{scheduleError}</p>}
          <div className="mt-2.5 flex justify-end gap-2">
            <button onClick={() => setShowSchedule(false)} className="btn-secondary px-3 py-1.5 text-xs">{t('cancel')}</button>
            <button onClick={() => void confirmSchedule(needsApproval(status))} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">
              {needsApproval(status) ? t('approveAndSchedule') : t('schedule')}
            </button>
          </div>
        </div>
      )}

      {(confirmPublish || confirmApprovePublish) && (
        <div className="mt-3 rounded-lg border border-primary-100 bg-primary-50/70 p-2.5">
          <p className="text-xs text-ink-700">
            {confirmApprovePublish
              ? t('approveAndPublishConfirm', { page: pageName })
              : t('publishNowConfirm', { page: pageName })}
          </p>
          <div className="mt-2.5 flex justify-end gap-2">
            <button onClick={() => { setConfirmPublish(false); setConfirmApprovePublish(false) }} disabled={busy} className="btn-secondary px-3 py-1.5 text-xs">
              {t('cancel')}
            </button>
            <button onClick={() => void doPublishNow(confirmApprovePublish)} disabled={busy} className="btn-primary px-3 py-1.5 text-xs justify-center">
              {busy ? t('publishing') : t('confirm')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}