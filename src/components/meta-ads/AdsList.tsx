'use client'

import { useState } from 'react'
import { Megaphone } from 'lucide-react'
import { useCopy } from '@/hooks/useCopy'
import type { TranslationKey } from '@/lib/i18n'
import { formatCount, formatMoney, formatPercent } from '@/features/meta-ads/format'
import type { AdRow, Health } from '@/features/meta-ads/contracts'
import VideoCurveChart from './VideoCurveChart'

const HEALTH_DOT: Record<Health, string> = {
  good: 'bg-green-500',
  average: 'bg-amber-500',
  poor: 'bg-red-500',
  unknown: 'bg-gray-400',
}

const HEALTH_LABEL: Record<Health, TranslationKey> = {
  good: 'adsHealthGood',
  average: 'adsHealthAverage',
  poor: 'adsHealthPoor',
  unknown: 'adsHealthUnknown',
}

function AdCard({ ad, currency, locale }: { ad: AdRow; currency: string; locale: 'ar' | 'en' }) {
  const { t } = useCopy()
  const [open, setOpen] = useState(false)
  return (
    <div className="card p-4">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-3 text-start">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-400">
          <Megaphone size={20} strokeWidth={1.7} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-ink-900">{ad.adName}</span>
          <span className="block truncate text-xs text-ink-500">{ad.campaignName}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-600">
          <span className={`h-2.5 w-2.5 rounded-full ${HEALTH_DOT[ad.health]}`} />
          {t(HEALTH_LABEL[ad.health])}
        </span>
      </button>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-w-0 rounded-xl bg-ink-50 p-3 text-start">
          <p className="text-xs text-ink-500">{t('adsKpiSpend')}</p>
          <p className="mt-1 break-words text-lg font-semibold leading-tight text-ink-900 tabular-nums sm:text-xl">{formatMoney(ad.spend, currency, locale)}</p>
        </div>
        <div className="min-w-0 rounded-xl bg-ink-50 p-3 text-start">
          <p className="text-xs text-ink-500">{t('adsKpiResults')}</p>
          <p className="mt-1 break-words text-lg font-semibold leading-tight text-ink-900 tabular-nums sm:text-xl">{formatCount(ad.results)}</p>
        </div>
        <div className="min-w-0 rounded-xl bg-ink-50 p-3 text-start">
          <p className="text-xs text-ink-500">{t('adsKpiCostPerResult')}</p>
          <p className="mt-1 break-words text-lg font-semibold leading-tight text-ink-900 tabular-nums sm:text-xl">{ad.costPerResult !== null ? formatMoney(ad.costPerResult, currency, locale) : '—'}</p>
        </div>
      </div>

      {open && (
        <div className="mt-3 border-t border-ink-100 pt-3">
          <div className="flex flex-wrap gap-4 text-xs text-ink-600">
            <span>{t('adsHookRate')}: {formatPercent(ad.hookRate)}</span>
            <span>{t('adsHoldRate')}: {formatPercent(ad.holdRate)}</span>
          </div>
          {ad.videoCurve && <VideoCurveChart curve={ad.videoCurve} />}
        </div>
      )}
    </div>
  )
}

export default function AdsList({ ads, currency, locale }: { ads: AdRow[]; currency: string; locale: 'ar' | 'en' }) {
  return (
    <div className="space-y-3">
      {ads.map((ad) => (
        <AdCard key={ad.adId} ad={ad} currency={currency} locale={locale} />
      ))}
    </div>
  )
}