'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bot } from 'lucide-react'
import { useCopy } from '../../hooks/useCopy'
import type { TranslationKey } from '../../lib/i18n'
import type { ChatMessage } from '../../lib/types'
import { acceptDeliverableOffer, dismissDeliverableOffer } from '../../server/deliverable-offers'
import MarkdownContent from './MarkdownContent'

type OfferState = 'offered' | 'saved' | 'dismissed'

/** Asks the owner whether to save a substantial result to the routed Deliverables section. */
export default function DeliverableOfferCard({ msg }: { msg: ChatMessage }) {
  const { t } = useCopy()
  const payload = msg.payload ?? {}
  const offerId = String(payload.offerId ?? '')
  const proposedType = String(payload.proposedType ?? 'general')
  const title = String(payload.title ?? msg.content)
  const preview = String(payload.preview ?? '')
  const initialState: OfferState = payload.state === 'saved' || payload.state === 'dismissed' ? payload.state : 'offered'
  const [state, setState] = useState<OfferState>(initialState)
  const [deliverableId, setDeliverableId] = useState<string | null>(typeof payload.deliverableId === 'string' ? payload.deliverableId : null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const section = t(`type_${proposedType}` as TranslationKey)

  async function save() {
    setPending(true)
    setError(null)
    const result = await acceptDeliverableOffer(offerId).catch(() => ({ error: 'Could not save. Please retry.' }) as { error: string; deliverableId?: string })
    setPending(false)
    if (result.error || !result.deliverableId) {
      setError(result.error ?? 'Could not save. Please retry.')
      return
    }
    setDeliverableId(result.deliverableId)
    setState('saved')
  }

  async function dismiss() {
    setPending(true)
    setError(null)
    const result = await dismissDeliverableOffer(offerId).catch(() => ({ error: 'Could not update. Please retry.' }))
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setState('dismissed')
  }

  return (
    <div className="animate-fade-up">
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          <Bot size={16} />
        </div>
        <div className="card max-w-[95%] sm:max-w-[85%] p-3.5 sm:p-4">
          <span className="badge bg-primary-100 text-primary-800 text-[10px]">{section}</span>
          <p className="mt-1 text-sm font-bold text-ink-900">{title}</p>
          {preview && <MarkdownContent content={preview} className="mt-1 line-clamp-3 text-sm text-ink-700" />}

          {state === 'saved' ? (
            <p className="mt-3 text-sm text-ink-700">
              {t('offerSaved', { section })}
              {deliverableId && (
                <>
                  {' · '}
                  <Link className="font-semibold text-primary-700 hover:underline" href={'/deliverables?document=' + encodeURIComponent(deliverableId)}>
                    {t('offerOpen')}
                  </Link>
                </>
              )}
            </p>
          ) : state === 'dismissed' ? (
            <p className="mt-3 text-sm text-ink-500">
              {t('offerDismissed')}{' '}
              <button type="button" disabled={pending} onClick={save} className="font-semibold text-primary-700 hover:underline disabled:opacity-50">
                {t('offerSave')}
              </button>
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm text-ink-800">{t('offerQuestion', { section })}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={pending} onClick={save} className="btn-primary px-3 py-1.5 text-xs">
                  {t('offerSave')}
                </button>
                <button type="button" disabled={pending} onClick={dismiss} className="btn-secondary px-3 py-1.5 text-xs">
                  {t('offerNotNow')}
                </button>
              </div>
            </>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}
