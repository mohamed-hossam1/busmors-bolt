'use client'

import { Hash, MousePointerClick, Receipt, Repeat, Users, Wallet, type LucideIcon } from 'lucide-react'
import { useCopy } from '@/hooks/useCopy'
import type { TranslationKey } from '@/lib/i18n'
import { formatCount, formatMoney, formatPercent } from '@/features/meta-ads/format'
import type { KpiSummary } from '@/features/meta-ads/contracts'

type Tile = {
  key: TranslationKey
  value: string
  help: TranslationKey | null
  icon: LucideIcon
  hero?: boolean
}

export default function KpiTiles({ summary, currency, locale }: { summary: KpiSummary; currency: string; locale: 'ar' | 'en' }) {
  const { t } = useCopy()
  const tiles: Tile[] = [
    { key: 'adsKpiSpend', value: formatMoney(summary.spend, currency, locale), help: null, icon: Wallet, hero: true },
    { key: 'adsKpiResults', value: formatCount(summary.results), help: null, icon: Hash },
    { key: 'adsKpiCostPerResult', value: summary.costPerResult !== null ? formatMoney(summary.costPerResult, currency, locale) : '—', help: 'adsHelpCostPerResult', icon: Receipt },
    { key: 'adsKpiReach', value: formatCount(summary.reach), help: 'adsHelpReach', icon: Users },
    { key: 'adsKpiFrequency', value: summary.frequency.toFixed(2), help: 'adsHelpFrequency', icon: Repeat },
    { key: 'adsKpiCtr', value: formatPercent(summary.ctr), help: 'adsHelpCtr', icon: MousePointerClick },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {tiles.map((tile) => {
        const Icon = tile.icon
        return (
          <div
            key={tile.key}
            className={`card min-w-0 p-4 ${tile.hero ? 'col-span-2 md:col-span-1' : ''}`}
            title={tile.help ? t(tile.help) : undefined}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-ink-600">
              <Icon size={14} strokeWidth={1.8} className="text-ink-400" aria-hidden="true" />
              <span>{t(tile.key)}</span>
            </div>
            <p
              className={`mt-2 truncate whitespace-nowrap font-semibold leading-tight tracking-tight text-ink-900 tabular-nums ${
                tile.hero ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'
              }`}
            >
              {tile.value}
            </p>
            {tile.help && <span className="sr-only">{t(tile.help)}</span>}
          </div>
        )
      })}
    </div>
  )
}