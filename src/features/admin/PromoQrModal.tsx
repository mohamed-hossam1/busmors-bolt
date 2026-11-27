'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Download, Printer, X } from 'lucide-react'
import type { AdminPromoItem } from './promoTypes'
import { buildPromosCsv, buildSignupUrl, downloadTextFile } from '@/lib/promo'
import { useDialog } from '@/hooks/useDialog'
import { useTranslate } from '@/context/I18nContext'

const subscribeOrigin = () => () => {}

const PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  .promo-print-sheet, .promo-print-sheet * { visibility: visible !important; }
  .promo-print-sheet { position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: auto !important; height: auto !important; display: grid !important; }
  .promo-print-sheet .promo-print-card { break-inside: avoid; page-break-inside: avoid; }
}
`

export default function PromoQrModal({
  cards,
  onClose,
  initialLocale,
}: {
  cards: AdminPromoItem[]
  onClose: () => void
  initialLocale?: 'ar' | 'en'
}) {
  const t = useTranslate()
  const origin = useSyncExternalStore(subscribeOrigin, () => window.location.origin, () => '')
  const [qrLocale, setQrLocale] = useState<'ar' | 'en'>(initialLocale ?? 'ar')
  const [urls, setUrls] = useState<string[]>([])
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useDialog(true, onClose)

  useEffect(() => {
    if (cards.length === 0) return
    let cancelled = false
    Promise.all(cards.map((card) => QRCode.toDataURL(buildSignupUrl(origin, qrLocale, card.code), { width: 512, margin: 2 })))
      .then((generated) => {
        if (!cancelled) setUrls(generated)
      })
      .catch(() => {
        if (!cancelled) setUrls([])
      })
    return () => {
      cancelled = true
    }
  }, [cards, origin, qrLocale])

  if (cards.length === 0) return null

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1500)
    } catch {
      setCopiedKey(null)
    }
  }

  const exportCsv = () => {
    const csv = buildPromosCsv(
      cards.map((card) => ({
        code: card.code,
        status: card.status,
        signupUrl: buildSignupUrl(origin, qrLocale, card.code),
        heavyTasksLimit: card.heavyTasksLimit,
        heavyTasksUsed: card.heavyTasksUsed,
        redeemedEmail: card.redeemedEmail,
        phoneNumber: card.phoneNumber,
        batchLabel: card.batchLabel,
        note: card.note,
        expiresAt: card.expiresAt,
        createdAt: card.createdAt,
      })),
    )
    downloadTextFile(csv, 'promo-codes.csv', 'text/csv;charset=utf-8')
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4 print:static print:block print:bg-white print:p-0"
      onClick={onClose}
    >
      <style>{PRINT_STYLES}</style>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('adminPromosQrModalTitle')}
        className="card modal-panel max-h-[90dvh] w-full max-w-4xl overflow-y-auto p-5 sm:p-6 print:max-h-none print:w-full print:max-w-none print:overflow-visible print:border-0 print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <h2 className="text-lg font-semibold text-ink-900">{t('adminPromosQrModalTitle')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={exportCsv} className="btn-secondary h-9 px-3 text-sm">
              <Download size={15} aria-hidden="true" />
              {t('adminPromosExportCsv')}
            </button>
            <button type="button" onClick={() => window.print()} className="btn-secondary h-9 px-3 text-sm">
              <Printer size={15} aria-hidden="true" />
              {t('adminPromosPrintCards')}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary h-9 px-3 text-sm">
              <X size={15} aria-hidden="true" />
              {t('adminPromosClose')}
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-xs font-medium text-ink-600">{t('adminPromosQrLocale')}</span>
          <button
            type="button"
            onClick={() => setQrLocale('ar')}
            aria-pressed={qrLocale === 'ar'}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              qrLocale === 'ar' ? 'bg-primary-500 text-white' : 'border border-ink-200 text-ink-600 hover:bg-ink-50'
            }`}
          >
            {t('adminPromosQrLocaleAr')}
          </button>
          <button
            type="button"
            onClick={() => setQrLocale('en')}
            aria-pressed={qrLocale === 'en'}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              qrLocale === 'en' ? 'bg-primary-500 text-white' : 'border border-ink-200 text-ink-600 hover:bg-ink-50'
            }`}
          >
            {t('adminPromosQrLocaleEn')}
          </button>
        </div>

        <div className="promo-print-sheet grid gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-6">
          {cards.map((card, index) => {
            const dataUrl = urls[index]
            const signupUrl = buildSignupUrl(origin, qrLocale, card.code)
            return (
              <div key={card.id} className="promo-print-card card flex flex-col items-center gap-3 p-4 text-center">
                {dataUrl ? (
                  <img src={dataUrl} alt={card.code} width={180} height={180} className="h-[180px] w-[180px]" />
                ) : (
                  <div className="h-[180px] w-[180px]" />
                )}
                <p className="font-mono text-base font-bold text-ink-900">{card.code}</p>
                <p className="w-full break-all text-xs text-ink-500">{signupUrl}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className="badge bg-ink-100 text-ink-600">
                    {card.heavyTasksUsed} / {card.heavyTasksLimit}
                  </span>
                  {card.batchLabel && <span className="badge bg-primary-50 text-primary-700">{card.batchLabel}</span>}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => copy('code:' + card.code, card.code)}
                    className="btn-secondary h-8 px-2.5 text-xs"
                  >
                    {copiedKey === 'code:' + card.code ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                    {copiedKey === 'code:' + card.code ? t('adminPromosCopied') : t('adminPromosCopyCode')}
                  </button>
                  <button
                    type="button"
                    onClick={() => copy('link:' + card.code, signupUrl)}
                    className="btn-secondary h-8 px-2.5 text-xs"
                  >
                    {copiedKey === 'link:' + card.code ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                    {copiedKey === 'link:' + card.code ? t('adminPromosCopied') : t('adminPromosCopyLink')}
                  </button>
                  {dataUrl && (
                    <a download={`${card.code}.png`} href={dataUrl} className="btn-secondary h-8 px-2.5 text-xs">
                      <Download size={13} aria-hidden="true" />
                      {t('adminPromosDownloadPng')}
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}