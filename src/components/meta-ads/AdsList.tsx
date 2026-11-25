'use client'

import { useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Megaphone, Search, Star, Video } from 'lucide-react'
import { useCopy } from '@/hooks/useCopy'
import type { TranslationKey } from '@/lib/i18n'
import { formatCount, formatMoney, formatPercent } from '@/features/meta-ads/format'
import type { AdRow, Health, ResultKind } from '@/features/meta-ads/contracts'
import VideoCurveChart from './VideoCurveChart'

const HEALTH_DOT: Record<Health, string> = {
  good: 'bg-emerald-500',
  average: 'bg-amber-500',
  poor: 'bg-red-500',
  unknown: 'bg-gray-400',
}

const HEALTH_BADGE: Record<Health, string> = {
  good: 'bg-emerald-50 text-emerald-700',
  average: 'bg-amber-50 text-amber-700',
  poor: 'bg-red-50 text-red-700',
  unknown: 'bg-ink-100 text-ink-600',
}

const HEALTH_LABEL: Record<Health, TranslationKey> = {
  good: 'adsHealthGood',
  average: 'adsHealthAverage',
  poor: 'adsHealthPoor',
  unknown: 'adsHealthUnknown',
}

const RESULT_KIND_LABEL: Record<ResultKind, TranslationKey> = {
  messages: 'adsKindMessages',
  leads: 'adsKindLeads',
  purchases: 'adsKindPurchases',
  clicks: 'adsKindClicks',
}

function hasVideo(ad: AdRow): boolean {
  return ad.videoCurve !== null || ad.hookRate !== null || ad.holdRate !== null
}

type HealthFilter = 'all' | Health
type SortKey = 'spend' | 'results' | 'costPerResult' | 'name'
type SortDir = 'asc' | 'desc'
type PageSize = 5 | 10 | 25 | 'all'
const PAGE_SIZE_OPTIONS: PageSize[] = [5, 10, 25, 'all']

function AdCard({ ad, currency, locale, isBest }: { ad: AdRow; currency: string; locale: 'ar' | 'en'; isBest: boolean }) {
  const { t } = useCopy()
  const expandable = hasVideo(ad)
  const [open, setOpen] = useState(false)
  const panelId = `ad-panel-${ad.adId}`
  const poor = ad.health === 'poor'

  const header = (
    <>
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
          expandable ? 'bg-primary-50 text-primary-500' : 'bg-ink-100 text-ink-400'
        }`}
      >
        {expandable ? <Video size={20} strokeWidth={1.7} aria-hidden="true" /> : <Megaphone size={20} strokeWidth={1.7} aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate font-semibold text-ink-900">
          {ad.adName}
        </span>
        <span dir="auto" className="block truncate text-xs text-ink-500">
          {ad.campaignName}
        </span>
      </span>
      <span className="ms-auto flex shrink-0 items-center gap-2">
        {isBest && (
          <span className="badge bg-primary-50 text-primary-700">
            <Star size={11} aria-hidden="true" />
            {t('adsBestAd')}
          </span>
        )}
        {expandable && (
          <span className="badge bg-primary-50 text-primary-700">
            <Video size={11} aria-hidden="true" />
            {t('adsHasVideo')}
          </span>
        )}
        <span className={`badge ${HEALTH_BADGE[ad.health]}`}>
          <span className={`h-2 w-2 rounded-full ${HEALTH_DOT[ad.health]}`} />
          {t(HEALTH_LABEL[ad.health])}
        </span>
      </span>
    </>
  )

  return (
    <div
      className={`card p-4 ${poor ? 'border-s-4 border-s-red-400' : ''} ${
        expandable ? 'transition-shadow hover:shadow-card' : ''
      }`}
    >
      {expandable ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-3 text-start"
        >
          {header}
          <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      ) : (
        <div className="flex w-full items-center gap-3 text-start">{header}</div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="min-w-0 rounded-xl bg-ink-50 p-3 text-start">
          <p className="text-xs text-ink-500">{t('adsKpiSpend')}</p>
          <p className="mt-1 whitespace-nowrap text-lg font-semibold leading-tight text-ink-900 tabular-nums sm:text-xl">
            {formatMoney(ad.spend, currency, locale)}
          </p>
        </div>
        <div className="min-w-0 rounded-xl bg-ink-50 p-3 text-start">
          <p className="text-xs text-ink-500">{t('adsKpiResults')}</p>
          <p className="mt-1 whitespace-nowrap text-lg font-semibold leading-tight text-ink-900 tabular-nums sm:text-xl">{formatCount(ad.results)}</p>
          <p className="mt-0.5 text-[11px] text-ink-400">{t(RESULT_KIND_LABEL[ad.resultKind])}</p>
        </div>
        <div className="min-w-0 rounded-xl bg-ink-50 p-3 text-start">
          <p className="text-xs text-ink-500">{t('adsKpiCostPerResult')}</p>
          <p className="mt-1 whitespace-nowrap text-lg font-semibold leading-tight text-ink-900 tabular-nums sm:text-xl">
            {ad.costPerResult !== null ? formatMoney(ad.costPerResult, currency, locale) : '—'}
          </p>
        </div>
        <div className="min-w-0 rounded-xl bg-ink-50 p-3 text-start">
          <p className="text-xs text-ink-500">{t('adsKpiCtr')}</p>
          <p className="mt-1 whitespace-nowrap text-lg font-semibold leading-tight text-ink-900 tabular-nums sm:text-xl">{formatPercent(ad.ctr)}</p>
        </div>
      </div>

      {expandable && open && (
        <div id={panelId} className="mt-3 animate-fade-up border-t border-ink-100 pt-3">
          <div className="flex flex-wrap gap-4 text-xs text-ink-600">
            <span>
              {t('adsHookShort')}: <span dir="ltr" className="tabular-nums">{formatPercent(ad.hookRate)}</span>
            </span>
            <span>
              {t('adsHoldShort')}: <span dir="ltr" className="tabular-nums">{formatPercent(ad.holdRate)}</span>
            </span>
          </div>
          {ad.videoCurve && <VideoCurveChart curve={ad.videoCurve} />}
        </div>
      )}
    </div>
  )
}

const PILL_BASE = 'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors'
const PILL_ACTIVE = 'border-primary-600 bg-primary-50 text-primary-800'
const PILL_IDLE = 'border-ink-200 text-ink-600 hover:border-ink-300'

export default function AdsList({ ads, currency, locale }: { ads: AdRow[]; currency: string; locale: 'ar' | 'en' }) {
  const { t } = useCopy()
  const [health, setHealth] = useState<HealthFilter>('all')
  const [videoOnly, setVideoOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('spend')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [pageSize, setPageSize] = useState<PageSize>(10)
  const [page, setPage] = useState(1)
  const listTopRef = useRef<HTMLDivElement>(null)

  const counts = useMemo(() => {
    const base: Record<HealthFilter, number> = { all: ads.length, good: 0, average: 0, poor: 0, unknown: 0 }
    for (const ad of ads) base[ad.health] += 1
    return base
  }, [ads])

  const bestAdId = useMemo(() => {
    let best: AdRow | null = null
    for (const ad of ads) {
      if (!best || ad.results > best.results || (ad.results === best.results && ad.spend > best.spend)) best = ad
    }
    return best?.adId ?? null
  }, [ads])

  // Pipeline: full ads → search + health + video filter → sort → pagination slice.
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = ads.filter((ad) => {
      if (health !== 'all' && ad.health !== health) return false
      if (videoOnly && !hasVideo(ad)) return false
      if (needle) {
        const haystack = `${ad.adName} ${ad.campaignName}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
    list.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'spend') cmp = a.spend - b.spend
      else if (sortKey === 'results') cmp = a.results - b.results
      else if (sortKey === 'name') cmp = a.adName.localeCompare(b.adName)
      else {
        const av = a.costPerResult ?? Number.POSITIVE_INFINITY
        const bv = b.costPerResult ?? Number.POSITIVE_INFINITY
        cmp = av === bv ? 0 : av < bv ? -1 : 1
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [ads, health, videoOnly, query, sortKey, sortDir])

  const filterActive = health !== 'all' || videoOnly || query.trim() !== ''

  const totalPages = pageSize === 'all' ? 1 : Math.ceil(filtered.length / pageSize)
  const safePage = Math.max(1, Math.min(page, totalPages))
  const pageStart = pageSize === 'all' ? 0 : (safePage - 1) * pageSize
  const visibleAds = useMemo(
    () => (pageSize === 'all' ? filtered : filtered.slice(pageStart, pageStart + pageSize)),
    [filtered, pageSize, pageStart],
  )

  const goToPage = (next: number) => {
    setPage(next)
    listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const changePageSize = (size: PageSize) => {
    setPageSize(size)
    setPage(1)
  }

  const chooseSort = (key: SortKey) => {
    setSortKey(key)
    setSortDir(key === 'costPerResult' ? 'asc' : 'desc')
    setPage(1)
  }

  if (ads.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary-200 bg-primary-50 text-primary-500">
          <Megaphone size={22} strokeWidth={1.6} aria-hidden="true" />
        </span>
        <p className="text-sm text-ink-600">{t('adsSummaryNoData')}</p>
      </div>
    )
  }

  const healthFilters: { key: HealthFilter; label: TranslationKey }[] = [
    { key: 'all', label: 'adsFilterAll' },
    { key: 'good', label: 'adsHealthGood' },
    { key: 'average', label: 'adsHealthAverage' },
    { key: 'poor', label: 'adsHealthPoor' },
    { key: 'unknown', label: 'adsHealthUnknown' },
  ]

  const sortOptions: { key: SortKey; label: TranslationKey }[] = [
    { key: 'spend', label: 'adsKpiSpend' },
    { key: 'results', label: 'adsKpiResults' },
    { key: 'costPerResult', label: 'adsKpiCostPerResult' },
    { key: 'name', label: 'adsSortName' },
  ]

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-3">
        <div className="relative">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder={t('adsSearch')}
            aria-label={t('adsSearch')}
            className="w-full rounded-xl border border-ink-300 bg-white py-2 pe-3 ps-9 text-sm text-ink-900 placeholder:text-ink-500 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {healthFilters.map((item) => {
            const active = health === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setHealth(item.key)
                  setPage(1)
                }}
                aria-pressed={active}
                className={`${PILL_BASE} ${active ? PILL_ACTIVE : PILL_IDLE}`}
              >
                {t(item.label)}
                <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${active ? 'bg-primary-100 text-primary-800' : 'bg-ink-100 text-ink-500'}`}>
                  {counts[item.key]}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setVideoOnly((value) => !value)
              setPage(1)
            }}
            aria-pressed={videoOnly}
            className={`${PILL_BASE} ${videoOnly ? PILL_ACTIVE : PILL_IDLE}`}
          >
            <Video size={13} aria-hidden="true" />
            {t('adsVideoOnly')}
          </button>
          <span className="ms-1 text-xs text-ink-500">{t('adsSortBy')}:</span>
          {sortOptions.map((item) => {
            const active = sortKey === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => chooseSort(item.key)}
                aria-pressed={active}
                className={`${PILL_BASE} ${active ? PILL_ACTIVE : PILL_IDLE}`}
              >
                {t(item.label)}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => {
              setSortDir((value) => (value === 'asc' ? 'desc' : 'asc'))
              setPage(1)
            }}
            aria-label={t(sortDir === 'asc' ? 'adsSortAsc' : 'adsSortDesc')}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-500 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
          >
            {sortDir === 'asc' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-500">{t('adsPerPage')}:</span>
          <div className="flex flex-wrap items-center gap-1">
            {PAGE_SIZE_OPTIONS.map((size) => {
              const active = pageSize === size
              const label = size === 'all' ? t('adsPerPageAll') : String(size)
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => changePageSize(size)}
                  aria-pressed={active}
                  className={`rounded-xl border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
                    active
                      ? 'border-primary-600 bg-primary-50 font-medium text-primary-800'
                      : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:text-ink-800'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {filterActive && (
          <p className="text-xs text-ink-500">
            {t('adsShowingCount', { shown: filtered.length, total: ads.length })}
          </p>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
          <p className="text-sm text-ink-600">{t('adsNoMatchingAds')}</p>
        </div>
      ) : (
        <div ref={listTopRef} className="space-y-3 scroll-mt-4">
          {visibleAds.map((ad) => (
            <AdCard key={ad.adId} ad={ad} currency={currency} locale={locale} isBest={ad.adId === bestAdId} />
          ))}

          {pageSize !== 'all' && totalPages > 1 && (
            <div className="card flex flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row">
              <p className="text-xs text-ink-500">
                {t('adsShowingRange', {
                  from: pageStart + 1,
                  to: Math.min(pageStart + pageSize, filtered.length),
                  total: filtered.length,
                })}
              </p>

              <nav aria-label={t('adsPagination')} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToPage(safePage - 1)}
                  disabled={safePage <= 1}
                  aria-label={t('adsPrevPage')}
                  className="flex h-8 items-center gap-1 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-600 transition-colors hover:border-primary-300 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink-200 disabled:hover:text-ink-600"
                >
                  <ChevronLeft size={14} aria-hidden="true" className="rtl:rotate-180" />
                  <span className="hidden sm:inline">{t('adsPrevPage')}</span>
                </button>

                {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => {
                  const active = pageNumber === safePage
                  return (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => goToPage(pageNumber)}
                      aria-current={active ? 'page' : undefined}
                      aria-label={t('adsPageOf', { page: pageNumber, total: totalPages })}
                      className={`flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-medium tabular-nums transition-colors ${
                        active
                          ? 'border-primary-600 bg-primary-50 text-primary-800'
                          : 'border-ink-200 bg-white text-ink-600 hover:border-primary-300 hover:text-primary-700'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  )
                })}

                <button
                  type="button"
                  onClick={() => goToPage(safePage + 1)}
                  disabled={safePage >= totalPages}
                  aria-label={t('adsNextPage')}
                  className="flex h-8 items-center gap-1 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-600 transition-colors hover:border-primary-300 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink-200 disabled:hover:text-ink-600"
                >
                  <span className="hidden sm:inline">{t('adsNextPage')}</span>
                  <ChevronRight size={14} aria-hidden="true" className="rtl:rotate-180" />
                </button>
              </nav>

              <p className="text-xs tabular-nums text-ink-500 sm:hidden">
                {t('adsPageOf', { page: safePage, total: totalPages })}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}