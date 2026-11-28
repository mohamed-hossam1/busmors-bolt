'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useParams } from 'next/navigation'
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Gift,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import type { AdminPromoItem, AdminPromoListResult, AdminPromoStatus, CreatePromosInput } from './promoTypes'
import { formatDateTime, statusClasses } from './format'
import { buildPromosCsv, buildSignupUrl, downloadTextFile, normalizePromoCodeInput, normalizePromoPrefix } from '@/lib/promo'
import { Link } from '@/shared/i18n'
import { useTranslate } from '@/context/I18nContext'
import { useDialog } from '@/hooks/useDialog'
import PromoQrModal from './PromoQrModal'

const subscribeOrigin = () => () => {}

interface FilterState {
  q: string
  status: string
  batch: string
}

const EMPTY_FILTERS: FilterState = { q: '', status: '', batch: '' }

const STATUS_FILTERS = [
  { value: '', key: 'adminPromosStatusAll' },
  { value: 'active', key: 'adminPromosStatusActive' },
  { value: 'reserved', key: 'adminPromosStatusReserved' },
  { value: 'redeemed', key: 'adminPromosStatusRedeemed' },
  { value: 'revoked', key: 'adminPromosStatusRevoked' },
] as const

const COUNT_PRESETS = [1, 5, 10, 25]

export default function PromoManager() {
  const t = useTranslate()
  const params = useParams<{ lang: string }>()
  const lang = params?.lang ?? 'en'
  const origin = useSyncExternalStore(subscribeOrigin, () => window.location.origin, () => '')

  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<AdminPromoListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<'auto' | 'custom'>('auto')
  const [count, setCount] = useState(5)
  const [prefix, setPrefix] = useState('BUSM')
  const [customCode, setCustomCode] = useState('')
  const [limit, setLimit] = useState(6)
  const [batchLabel, setBatchLabel] = useState('')
  const [expiresDays, setExpiresDays] = useState('')
  const [note, setNote] = useState('')
  const [createQrLocale, setCreateQrLocale] = useState<'ar' | 'en'>(lang === 'ar' ? 'ar' : 'en')
  const [submitting, setSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdNotice, setCreatedNotice] = useState(false)

  const [qrCards, setQrCards] = useState<AdminPromoItem[]>([])
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null)
  const [grantRow, setGrantRow] = useState<AdminPromoItem | null>(null)

  const pageSize = 20

  const queryString = useMemo(() => {
    const sp = new URLSearchParams()
    sp.set('page', String(page))
    sp.set('pageSize', String(pageSize))
    if (applied.q) sp.set('q', applied.q)
    if (applied.status) sp.set('status', applied.status)
    if (applied.batch) sp.set('batch', applied.batch)
    return sp.toString()
  }, [applied, page])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/promos?${queryString}`)
      const data = (await response.json()) as AdminPromoListResult & { error?: string }
      if (!response.ok) throw new Error(data.error || t('errorGeneric'))
      setResult(data)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('errorGeneric'))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [queryString, t])

  useEffect(() => {
    void load()
  }, [load])

  const rows = result?.data ?? []
  const summary = result?.summary
  const total = result?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const activeRows = rows.filter((row) => row.status === 'active')

  const previewCode =
    mode === 'custom'
      ? normalizePromoCodeInput(customCode) || 'BUSM-XXXX-XXXX'
      : `${normalizePromoPrefix(prefix) || 'BUSM'}-XXXX-XXXX`
  const linkPreview = buildSignupUrl(origin, createQrLocale, previewCode)

  const applyFilters = () => {
    setPage(1)
    setApplied(draft)
  }

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1500)
    } catch {
      setCopiedKey(null)
    }
  }

  const exportVisible = () => {
    const csv = buildPromosCsv(
      rows.map((row) => ({
        code: row.code,
        status: row.status,
        signupUrl: buildSignupUrl(origin, createQrLocale, row.code),
        heavyTasksLimit: row.heavyTasksLimit,
        heavyTasksUsed: row.heavyTasksUsed,
        redeemedEmail: row.redeemedEmail,
        phoneNumber: row.phoneNumber,
        batchLabel: row.batchLabel,
        note: row.note,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
      })),
    )
    downloadTextFile(csv, 'promo-codes.csv', 'text/csv;charset=utf-8')
  }

  const submitCreate = async () => {
    setSubmitting(true)
    setCreateError(null)
    setCreatedNotice(false)
    const shared = {
      limit: Number(limit) || 0,
      batchLabel: batchLabel.trim() ? batchLabel.trim() : null,
      note: note.trim() ? note.trim() : null,
      expiresDays: expiresDays.trim() ? Number(expiresDays) : null,
    }
    const input: CreatePromosInput =
      mode === 'auto'
        ? { mode: 'auto', count: Number(count) || 1, prefix: normalizePromoPrefix(prefix), ...shared }
        : { mode: 'custom', code: normalizePromoCodeInput(customCode), ...shared }
    try {
      const response = await fetch('/api/admin/promos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = (await response.json()) as { data?: AdminPromoItem[]; error?: string }
      if (!response.ok) throw new Error(data.error || t('errorGeneric'))
      setCreatedNotice(true)
      if (data.data && data.data.length > 0) setQrCards(data.data)
      void load()
    } catch (err) {
      setCreateError(err instanceof Error && err.message ? err.message : t('errorGeneric'))
    } finally {
      setSubmitting(false)
    }
  }

  const revoke = async (code: string) => {
    try {
      const response = await fetch(`/api/admin/promos/${encodeURIComponent(code)}/revoke`, { method: 'POST' })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error || t('errorGeneric'))
      setRevokeConfirm(null)
      void load()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('errorGeneric'))
    }
  }

  const statusLabel = (status: AdminPromoStatus) => {
    switch (status) {
      case 'active':
        return t('adminPromosStatusActive')
      case 'reserved':
        return t('adminPromosStatusReserved')
      case 'redeemed':
        return t('adminPromosStatusRedeemed')
      case 'revoked':
        return t('adminPromosStatusRevoked')
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 print:max-w-none print:space-y-0 print:p-0">
      <div className={qrCards.length > 0 ? 'space-y-6 print:hidden' : 'space-y-6'}>
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-ink-900">{t('adminPromosTitle')}</h1>
        <p className="text-sm text-ink-500">{t('adminPromosSubtitle')}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label={t('adminPromosStatTotal')} value={summary ? String(summary.total) : '—'} />
        <StatCard label={t('adminPromosStatActive')} value={summary ? String(summary.active) : '—'} />
        <StatCard label={t('adminPromosStatRedeemed')} value={summary ? String(summary.redeemed) : '—'} />
        <StatCard label={t('adminPromosStatRevoked')} value={summary ? String(summary.revoked) : '—'} />
        <StatCard
          label={t('adminPromosStatQuota')}
          value={summary ? `${summary.totalHeavyUsed} / ${summary.totalHeavyLimit}` : '—'}
        />
      </div>

      <section className="card space-y-4 p-4 sm:p-5">
        <h2 className="text-base font-semibold text-ink-900">{t('adminPromosCreateTitle')}</h2>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode('auto')}
            aria-pressed={mode === 'auto'}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === 'auto' ? 'bg-primary-500 text-white' : 'border border-ink-200 text-ink-600 hover:bg-ink-50'
            }`}
          >
            {t('adminPromosModeAuto')}
          </button>
          <button
            type="button"
            onClick={() => setMode('custom')}
            aria-pressed={mode === 'custom'}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === 'custom' ? 'bg-primary-500 text-white' : 'border border-ink-200 text-ink-600 hover:bg-ink-50'
            }`}
          >
            {t('adminPromosModeCustom')}
          </button>
        </div>

        {mode === 'auto' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
              {t('adminPromosCount')}
              <input
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="input-field"
              />
              <span className="flex flex-wrap gap-1.5 pt-1">
                {COUNT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCount(preset)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      count === preset
                        ? 'bg-primary-100 text-primary-700'
                        : 'border border-ink-200 text-ink-500 hover:bg-ink-50'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </span>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
              {t('adminPromosPrefix')}
              <input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="BUSM"
                className="input-field"
              />
            </label>
          </div>
        ) : (
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
            {t('adminPromosCustomCode')}
            <input
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value)}
              placeholder={t('adminPromosCustomCodePlaceholder')}
              className="input-field"
            />
          </label>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
            {t('adminPromosLimit')}
            <input
              type="number"
              min={1}
              max={1000}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="input-field"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
            {t('adminPromosBatchLabel')}
            <input
              value={batchLabel}
              onChange={(e) => setBatchLabel(e.target.value)}
              placeholder={t('adminPromosBatchPlaceholder')}
              className="input-field"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
            {t('adminPromosExpiresDays')}
            <input
              type="number"
              min={1}
              value={expiresDays}
              onChange={(e) => setExpiresDays(e.target.value)}
              placeholder={t('adminPromosExpiresPlaceholder')}
              className="input-field"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-600 sm:col-span-2 lg:col-span-1">
            {t('adminPromosNote')}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('adminPromosNotePlaceholder')}
              className="input-field"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
            {t('adminPromosQrLocale')}
            <select
              value={createQrLocale}
              onChange={(e) => setCreateQrLocale(e.target.value === 'ar' ? 'ar' : 'en')}
              className="input-field"
            >
              <option value="ar">{t('adminPromosQrLocaleAr')}</option>
              <option value="en">{t('adminPromosQrLocaleEn')}</option>
            </select>
          </label>
          <div className="flex flex-col gap-1 text-xs font-medium text-ink-600 sm:col-span-2 lg:col-span-1">
            {t('adminPromosLinkPreview')}
            <span className="input-field break-all text-ink-500">{linkPreview}</span>
          </div>
        </div>

        {createError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{createError}</span>
          </div>
        )}
        {createdNotice && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <Check size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{t('adminPromosCreatedNotice')}</span>
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => void submitCreate()}
            disabled={submitting || (mode === 'custom' && !normalizePromoCodeInput(customCode))}
            className="btn-primary"
          >
            {submitting
              ? t('adminPromosCreating')
              : mode === 'auto'
                ? t('adminPromosGenerateBtn')
                : t('adminPromosCreateSingleBtn')}
          </button>
        </div>
      </section>

      <section className="card space-y-3 p-4 sm:p-5">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            applyFilters()
          }}
        >
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs font-medium text-ink-600">
            <span className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-400"
                aria-hidden="true"
              />
              <input
                value={draft.q}
                onChange={(e) => setDraft((f) => ({ ...f, q: e.target.value }))}
                placeholder={t('adminPromosSearchPlaceholder')}
                className="input-field w-full ps-8"
              />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
            {t('adminPromosColStatus')}
            <select
              value={draft.status}
              onChange={(e) => setDraft((f) => ({ ...f, status: e.target.value }))}
              className="input-field"
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {t(option.key)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
            {t('adminPromosColBatch')}
            <select
              value={draft.batch}
              onChange={(e) => setDraft((f) => ({ ...f, batch: e.target.value }))}
              className="input-field"
            >
              <option value="">{t('adminPromosBatchAll')}</option>
              {(result?.batches ?? []).map((batch) => (
                <option key={batch} value={batch}>
                  {batch}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary h-9 px-3 text-sm">
              {t('adminPromosRefresh')}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(EMPTY_FILTERS)
                setApplied(EMPTY_FILTERS)
                setPage(1)
              }}
              className="rounded-lg border border-ink-200 px-3 text-sm text-ink-600 hover:bg-ink-100"
            >
              {t('adminPromosCancel')}
            </button>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void load()} className="btn-secondary h-9 px-3 text-sm">
            <RefreshCw size={14} aria-hidden="true" />
            {t('adminPromosRefresh')}
          </button>
          <button type="button" onClick={exportVisible} className="btn-secondary h-9 px-3 text-sm">
            <Download size={14} aria-hidden="true" />
            {t('adminPromosExportCsv')}
          </button>
          <button
            type="button"
            onClick={() => setQrCards(activeRows)}
            disabled={activeRows.length === 0}
            className="btn-secondary h-9 px-3 text-sm"
          >
            <Printer size={14} aria-hidden="true" />
            {t('adminPromosPrintActive')}
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        <div className="min-h-0 overflow-auto rounded-xl border border-ink-200 sleek-scrollbar">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('adminPromosColCode')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('adminPromosColStatus')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('adminPromosColBatch')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('adminPromosColAccount')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('adminPromosColQuota')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('adminPromosColDates')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('adminPromosColActions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-ink-400">
                    {t('adminPromosLoading')}
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-ink-400">
                    {t('adminPromosEmpty')}
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => (
                  <PromoRow
                    key={row.id}
                    row={row}
                    t={t}
                    copiedKey={copiedKey}
                    onCopy={copyValue}
                    revokeConfirm={revokeConfirm}
                    onRevokeConfirm={setRevokeConfirm}
                    onRevoke={revoke}
                    onGrant={() => setGrantRow(row)}
                    onViewQr={() => setQrCards([row])}
                    statusLabel={statusLabel}
                    origin={origin}
                    qrLocale={createQrLocale}
                  />
                ))}
            </tbody>
          </table>
        </div>

        <footer className="flex items-center justify-between text-xs text-ink-500">
          <span>
            {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="rounded-lg border border-ink-200 px-2 py-1 disabled:opacity-40"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="rounded-lg border border-ink-200 px-2 py-1 disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </footer>
      </section>

      {grantRow && (
        <GrantDialog
          row={grantRow}
          onClose={() => setGrantRow(null)}
          onGranted={() => {
            setGrantRow(null)
            void load()
          }}
        />
      )}
      </div>

      {qrCards.length > 0 && (
        <PromoQrModal cards={qrCards} initialLocale={createQrLocale} onClose={() => setQrCards([])} />
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink-900">{value}</p>
    </div>
  )
}

interface PromoRowProps {
  row: AdminPromoItem
  t: ReturnType<typeof useTranslate>
  copiedKey: string | null
  onCopy: (key: string, value: string) => void
  revokeConfirm: string | null
  onRevokeConfirm: (code: string | null) => void
  onRevoke: (code: string) => void
  onGrant: () => void
  onViewQr: () => void
  statusLabel: (status: AdminPromoStatus) => string
  origin: string
  qrLocale: 'ar' | 'en'
}

function PromoRow({
  row,
  t,
  copiedKey,
  onCopy,
  revokeConfirm,
  onRevokeConfirm,
  onRevoke,
  onGrant,
  onViewQr,
  statusLabel,
  origin,
  qrLocale,
}: PromoRowProps) {
  const usedPct = row.heavyTasksLimit > 0 ? Math.min(100, Math.round((row.heavyTasksUsed / row.heavyTasksLimit) * 100)) : 0
  const signupUrl = buildSignupUrl(origin, qrLocale, row.code)

  return (
    <tr className="border-t border-ink-100 align-top">
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-semibold text-ink-900">{row.code}</span>
          <button
            type="button"
            onClick={() => onCopy('code:' + row.code, row.code)}
            aria-label={t('adminPromosCopyCode')}
            className="rounded-md p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            {copiedKey === 'code:' + row.code ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          </button>
          {row.status === 'active' && (
            <button
              type="button"
              onClick={onViewQr}
              aria-label={t('adminPromosViewQr')}
              className="rounded-md p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
            >
              <QrCode size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`badge ${statusClasses(row.status)}`}>{statusLabel(row.status)}</span>
          {row.isExpired && <span className="badge bg-amber-100 text-amber-700">{t('adminPromosExpiredTag')}</span>}
        </div>
      </td>
      <td className="px-3 py-2 text-ink-700">
        <div className="flex flex-col gap-0.5">
          {row.batchLabel && <span className="text-xs font-medium text-ink-700">{row.batchLabel}</span>}
          {row.note && <span className="text-xs text-ink-500">{row.note}</span>}
          {!row.batchLabel && !row.note && <span className="text-ink-400">—</span>}
        </div>
      </td>
      <td className="px-3 py-2 text-ink-700">
        <div className="flex flex-col gap-0.5">
          {row.redeemedEmail && <span className="text-xs text-ink-700">{row.redeemedEmail}</span>}
          {row.phoneNumber && <span className="text-xs text-ink-500">{row.phoneNumber}</span>}
          {!row.redeemedEmail && !row.phoneNumber && <span className="text-ink-400">—</span>}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex min-w-[8rem] flex-col gap-1">
          <span className="text-xs text-ink-700">
            {row.heavyTasksUsed} / {row.heavyTasksLimit}
          </span>
          <span className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
            <span className="block h-full rounded-full bg-primary-500" style={{ width: `${usedPct}%` }} />
          </span>
          <span className="text-[11px] text-ink-500">
            {row.remainingTasks} {t('adminPromosRemainingLabel')}
          </span>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-500">
        <div className="flex flex-col gap-0.5">
          <span>{formatDateTime(row.createdAt)}</span>
          {row.redeemedAt && <span>{formatDateTime(row.redeemedAt)}</span>}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col items-start gap-1.5">
          {row.status === 'active' && (
            <>
              <button
                type="button"
                onClick={() => onCopy('link:' + row.code, signupUrl)}
                className="text-xs font-medium text-primary-600 hover:underline"
              >
                {copiedKey === 'link:' + row.code ? t('adminPromosCopied') : t('adminPromosCopyLink')}
              </button>
              <button
                type="button"
                onClick={onViewQr}
                className="inline-flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-ink-900"
              >
                <QrCode size={13} aria-hidden="true" />
                {t('adminPromosViewQr')}
              </button>
              {revokeConfirm === row.code ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-ink-600">{t('adminPromosRevokeConfirm')}</span>
                  <button
                    type="button"
                    onClick={() => onRevoke(row.code)}
                    className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700"
                  >
                    {t('adminPromosRevoke')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRevokeConfirm(null)}
                    className="rounded-md border border-ink-200 px-2 py-0.5 text-xs font-medium text-ink-600 hover:bg-ink-50"
                  >
                    {t('adminPromosCancel')}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onRevokeConfirm(row.code)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  {t('adminPromosRevoke')}
                </button>
              )}
            </>
          )}
          {row.status === 'redeemed' && row.redeemedByWorkspaceId && (
            <>
              <button
                type="button"
                onClick={onGrant}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
              >
                <Gift size={13} aria-hidden="true" />
                {t('adminPromosGrantTasks')}
              </button>
              <Link
                href={`/admin/traces?workspaceId=${encodeURIComponent(row.redeemedByWorkspaceId)}${
                  row.redeemedEmail ? `&email=${encodeURIComponent(row.redeemedEmail)}` : ''
                }`}
                className="inline-flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-ink-900"
              >
                <ExternalLink size={13} aria-hidden="true" />
                {t('adminPromosViewTraces')}
              </Link>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

function GrantDialog({
  row,
  onClose,
  onGranted,
}: {
  row: AdminPromoItem
  onClose: () => void
  onGranted: () => void
}) {
  const t = useTranslate()
  const [extra, setExtra] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useDialog(true, onClose)

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/promos/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: row.redeemedByWorkspaceId ?? undefined, extra: Number(extra) || 0 }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error || t('errorGeneric'))
      onGranted()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('errorGeneric'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('adminPromosGrantTitle')}
        className="card modal-panel w-full max-w-md space-y-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink-900">{t('adminPromosGrantTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('adminPromosClose')}
            className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <p className="font-mono text-sm font-semibold text-ink-700">{row.code}</p>

        <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
          {t('adminPromosGrantExtraLabel')}
          <input
            type="number"
            min={1}
            max={1000}
            value={extra}
            onChange={(e) => setExtra(Number(e.target.value))}
            className="input-field"
          />
          <span className="flex flex-wrap gap-1.5 pt-1">
            {[1, 5, 10].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setExtra(preset)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  extra === preset
                    ? 'bg-primary-100 text-primary-700'
                    : 'border border-ink-200 text-ink-500 hover:bg-ink-50'
                }`}
              >
                +{preset}
              </button>
            ))}
          </span>
        </label>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary h-9 px-3 text-sm">
            {t('adminPromosCancel')}
          </button>
          <button type="button" onClick={() => void submit()} disabled={saving} className="btn-primary h-9 px-3 text-sm">
            {saving ? t('adminPromosCreating') : t('adminPromosGrantConfirm')}
          </button>
        </div>
      </section>
    </div>
  )
}