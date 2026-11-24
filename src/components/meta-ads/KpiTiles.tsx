'use client'

import { useCopy } from '@/hooks/useCopy'
import type { TranslationKey } from '@/lib/i18n'
import { formatCount, formatMoney, formatPercent } from '@/features/meta-ads/format'
import type { KpiSummary } from '@/features/meta-ads/contracts'

export default function KpiTiles({ summary, currency, locale }: { summary: KpiSummary; currency: string; locale: 'ar' | 'en' }) {
  const { t } = useCopy()
  const tiles: { key: TranslationKey; value: string; help: TranslationKey | null }[] = [
    { key: 'adsKpiSpend', value: formatMoney(summary.spend, currency, locale), help: null },
    { key: 'adsKpiResults', value: formatCount(summary.results), help: null },
    { key: 'adsKpiCostPerResult', value: summary.costPerResult !== null ? formatMoney(summary.costPerResult, currency, locale) : '—', help: 'adsHelpCostPerResult' },
    { key: 'adsKpiReach', value: formatCount(summary.reach), help: 'adsHelpReach' },
    { key: 'adsKpiFrequency', value: summary.frequency.toFixed(2), help: 'adsHelpFrequency' },
    { key: 'adsKpiCtr', value: formatPercent(summary.ctr), help: 'adsHelpCtr' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <div key={tile.key} className="card p-4" title={tile.help ? t(tile.help) : undefined}>
          <p className="text-xs text-ink-600">{t(tile.key)}</p>
          <p className="mt-2 text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">{tile.value}</p>
        </div>
      ))}
    </div>
  )
}