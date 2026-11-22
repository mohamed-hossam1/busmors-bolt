'use client'

import { useState } from 'react'
import { Globe, MessageCircle, Share2, ThumbsUp } from 'lucide-react'
import { useCopy } from '../../hooks/useCopy'
import { formatWorkspaceTime } from '../../lib/region'

export type PreviewTimeKind = 'draft' | 'proposed' | 'scheduled' | 'published'

const SEE_MORE_AT = 280

/**
 * How a post will look on a Facebook Page. Placed inside an existing `.card`.
 * Shows no reaction counts: there are no real metrics, so none are invented.
 */
export default function FacebookPostPreview({
  pageName,
  caption,
  hashtags,
  timeLabelKind,
  time,
  timezone,
  compact = false,
}: {
  pageName: string
  caption: string
  hashtags?: string | null
  timeLabelKind: PreviewTimeKind
  /** UTC ISO; ignored for 'draft'. */
  time?: string | null
  timezone: string
  compact?: boolean
}) {
  const { t } = useCopy()
  const [expanded, setExpanded] = useState(false)
  const formatted = time && timeLabelKind !== 'draft' ? formatWorkspaceTime(time, timezone) : null
  const timeText =
    timeLabelKind === 'draft' || !formatted
      ? t('fbDraft')
      : timeLabelKind === 'proposed'
        ? t('fbProposedAt', { time: formatted })
        : timeLabelKind === 'scheduled'
          ? t('fbScheduledAt', { time: formatted })
          : formatted
  const long = !compact && !expanded && caption.length > SEE_MORE_AT
  const initial = (pageName.trim()[0] ?? 'F').toUpperCase()

  return (
    // `relative` keeps the absolutely positioned sr-only label inside this card.
    // Without it the label escapes the chat's scroll container and stretches the
    // whole document (a blank page-level scroll area below the workspace).
    <div className={`relative min-w-0 ${compact ? 'space-y-2' : 'space-y-3'}`}>
      <span className="sr-only">{t('fbPreviewLabel')}</span>
      <div className="flex items-center gap-2.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700" aria-hidden="true">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{pageName}</p>
          <p className="flex items-center gap-1 text-xs text-ink-500">
            <span className="truncate">{timeText}</span>
            <span aria-hidden="true">·</span>
            <Globe size={12} className="shrink-0" aria-hidden="true" />
          </p>
        </div>
      </div>

      <div className="min-w-0 break-words">
        <p dir="auto" className={`whitespace-pre-wrap text-sm text-ink-900 ${compact ? 'line-clamp-3' : ''}`}>
          {long ? caption.slice(0, SEE_MORE_AT) + '… ' : caption}
          {long && (
            <button type="button" onClick={() => setExpanded(true)} className="font-semibold text-ink-500 hover:underline">
              {t('fbSeeMore')}
            </button>
          )}
        </p>
        {hashtags?.trim() && !long && (
          <p dir="ltr" className={`mt-1 text-sm text-[#385898] ${compact ? 'line-clamp-1' : ''}`}>{hashtags.trim()}</p>
        )}
      </div>

      <div className="border-t border-ink-100 pt-1.5">
        <div className="grid grid-cols-3 text-xs font-semibold text-ink-500" aria-hidden="true">
          <div className="flex items-center justify-center gap-1.5 py-1"><ThumbsUp size={14} />{t('fbLike')}</div>
          <div className="flex items-center justify-center gap-1.5 py-1"><MessageCircle size={14} />{t('fbComment')}</div>
          <div className="flex items-center justify-center gap-1.5 py-1"><Share2 size={14} />{t('fbShare')}</div>
        </div>
      </div>
    </div>
  )
}
