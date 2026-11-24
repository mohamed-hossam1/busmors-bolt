'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Gauge,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import { useCopy } from '../../hooks/useCopy'
import {
  decideRoadmapRevision,
  evaluateCheckin,
  loadRoadmapHistory,
  proposeRoadmapRevision,
  recordRoadmapCheckin,
  type RoadmapCheckin,
  type RoadmapHistory,
  type RoadmapLearning,
} from './api'
import type { RoadmapVersionRecord } from './types'

const RECOMMENDATION_KEYS: Record<string, 'roadmapRecContinue' | 'roadmapRecAdjust' | 'roadmapRecPause' | 'roadmapRecChange'> = {
  continue: 'roadmapRecContinue',
  adjust: 'roadmapRecAdjust',
  pause: 'roadmapRecPause',
  change_direction: 'roadmapRecChange',
}

const CHECKIN_FIELDS = [
  'roadmapCheckinCompleted',
  'roadmapCheckinResults',
  'roadmapCheckinMetrics',
  'roadmapCheckinFailed',
  'roadmapCheckinUnexpected',
  'roadmapCheckinObstacles',
  'roadmapCheckinChanged',
] as const

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}
function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
}

export function RoadmapCheckinPanel({ roadmapId, versionId, onRecorded }: { roadmapId: string; versionId: string; onRecorded: () => void }) {
  const { t } = useCopy()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [error, setError] = useState('')
  const [checkin, setCheckin] = useState<RoadmapCheckin | null>(null)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const recorded = await recordRoadmapCheckin(roadmapId, versionId, answers)
      setCheckin(recorded)
      setEvaluating(true)
      const evaluated = await evaluateCheckin(recorded.id, recorded.version)
      setCheckin(evaluated.checkin)
      onRecorded()
    } catch (err) {
      const code = (err as { message?: string })?.message ?? ''
      setError(code.includes('STALE_VERSION') ? t('roadmapResearchStale') : t('roadmapActionFailed'))
    } finally {
      setBusy(false)
      setEvaluating(false)
    }
  }

  const evaluation = checkin ? rec(checkin.evaluation) : null
  const recommendation = checkin?.recommendation ?? ''

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink-900/30" role="dialog" aria-modal="true">
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <span className="brain-page-heading"><Gauge size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="workspace-heading text-lg">{t('roadmapCheckinTitle')}</h2>
            <p className="workspace-description text-sm">{t('roadmapCheckinQualitative')}</p>
          </div>
          <button type="button" onClick={onRecorded} aria-label={t('cancel')} className="text-ink-400 hover:text-ink-700"><X size={18} /></button>
        </div>

        {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}

        {!checkin ? (
          <>
            <div className="space-y-3">
              {CHECKIN_FIELDS.map((key) => (
                <label key={key} className="block text-xs font-medium text-ink-700">
                  {t(key)}
                  <textarea
                    value={answers[key] ?? ''}
                    onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))}
                    maxLength={2000}
                    className="input-field mt-1 min-h-20 resize-y"
                  />
                </label>
              ))}
            </div>
            <button type="button" disabled={busy} onClick={() => void submit()} className="btn-primary mt-4 min-h-10 disabled:opacity-60">
              {busy ? <><Loader2 size={14} className="animate-spin" /> {t('roadmapCheckinSaving')}</> : t('roadmapCheckinSubmit')}
            </button>
          </>
        ) : (
          <div className="space-y-4">
            {evaluating && <p className="flex items-center gap-2 text-sm text-ink-600"><Loader2 size={14} className="animate-spin" /> {t('roadmapCheckinSaving')}</p>}
            <section className="rounded-xl border border-primary-200 bg-primary-50/50 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-primary-800"><Sparkles size={15} /> {t('roadmapEvaluationTitle')}</h3>
              <Field label={t('roadmapEvaluationWorked')} items={list(evaluation?.worked)} />
              <Field label={t('roadmapEvaluationDidNotWork')} items={list(evaluation?.didNotWork)} />
              <Field label={t('roadmapEvaluationLearned')} items={list(evaluation?.learned)} />
              {typeof evaluation?.nextStep === 'string' && evaluation.nextStep && (
                <p className="mt-2 text-sm text-ink-800">{evaluation.nextStep}</p>
              )}
              {recommendation && RECOMMENDATION_KEYS[recommendation] && (
                <div className="mt-3 rounded-lg bg-white p-3">
                  <p className="text-xs uppercase tracking-wide text-ink-500">{t('roadmapEvaluationRecommendation')}</p>
                  <p className="mt-1 text-sm font-semibold text-ink-900">{t(RECOMMENDATION_KEYS[recommendation])}</p>
                  {typeof evaluation?.recommendationReason === 'string' && evaluation.recommendationReason && (
                    <p className="mt-1 text-xs leading-5 text-ink-600">{evaluation.recommendationReason}</p>
                  )}
                </div>
              )}
            </section>
            <button type="button" onClick={onRecorded} className="btn-secondary min-h-9">{t('roadmapResearchReturn')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

export function RoadmapAdjustPanel({ roadmapId, baseVersionId, roadmapVersion, onApplied }: { roadmapId: string; baseVersionId: string; roadmapVersion: number; onApplied: () => void }) {
  const { t } = useCopy()
  const [request, setRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!request.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await proposeRoadmapRevision({ roadmapId, baseVersionId, expectedRoadmapVersion: roadmapVersion, request: request.trim() })
      setRequest('')
      onApplied()
    } catch (err) {
      const code = (err as { message?: string })?.message ?? ''
      setError(code.includes('STALE_VERSION') ? t('roadmapResearchStale') : t('roadmapActionFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink-900/30" role="dialog" aria-modal="true">
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <span className="brain-page-heading"><Sparkles size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="workspace-heading text-lg">{t('roadmapAdjustTitle')}</h2>
            <p className="workspace-description text-sm">{t('roadmapAdjustHelp')}</p>
          </div>
          <button type="button" onClick={onApplied} aria-label={t('cancel')} className="text-ink-400 hover:text-ink-700"><X size={18} /></button>
        </div>
        {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
        <textarea
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          maxLength={4000}
          placeholder={t('roadmapAdjustPlaceholder')}
          className="input-field min-h-36 resize-y"
        />
        <button type="button" disabled={busy || !request.trim()} onClick={() => void submit()} className="btn-primary mt-4 min-h-10 disabled:opacity-60">
          {busy ? <><Loader2 size={14} className="animate-spin" /> {t('roadmapAdjustSubmitting')}</> : t('roadmapAdjustSubmit')}
        </button>
      </div>
    </div>
  )
}

interface RoadmapHistoryPanelProps {
  roadmapId: string
  roadmapVersion: number
  refreshSignal: number
  onRevisionApplied: () => void
}

export function RoadmapHistoryPanel({ roadmapId, roadmapVersion, refreshSignal, onRevisionApplied }: RoadmapHistoryPanelProps) {
  const { t } = useCopy()
  const [history, setHistory] = useState<RoadmapHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showVersions, setShowVersions] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setHistory(await loadRoadmapHistory(roadmapId))
    } catch {
      setError(t('roadmapActionFailed'))
    } finally {
      setLoading(false)
    }
  }, [roadmapId, t])

  useEffect(() => { void load() }, [load, refreshSignal])

  const decide = async (version: RoadmapVersionRecord, action: 'approve' | 'reject') => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await decideRoadmapRevision(version.id, roadmapVersion, action)
      await load()
      if (action === 'approve') onRevisionApplied()
    } catch (err) {
      const code = (err as { message?: string })?.message ?? ''
      setError(code.includes('STALE_VERSION') ? t('roadmapResearchStale') : t('roadmapActionFailed'))
    } finally {
      setBusy(false)
    }
  }

  if (loading && !history) {
    return <div className="card p-4 text-sm text-ink-600"><Loader2 size={14} className="inline animate-spin" /> {t('roadmapLoadingHistory')}</div>
  }
  if (!history) {
    return <div className="card p-4"><p role="alert" className="text-sm text-red-700">{error}</p></div>
  }

  const pending = history.pendingRevision
  const pendingDiff = pending ? rec(pending.diff) : null

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}

      {pending && (
        <section className="card border-primary-200 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle size={16} className="text-primary-600" />
            <h3 className="text-sm font-semibold text-ink-900">{t('roadmapRevisionPending')}</h3>
            <span className="badge bg-primary-100 text-primary-800">{t('roadmapViewVersion', { version: pending.version })}</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-ink-900">{pending.summary.title}</p>
          {typeof pendingDiff?.request === 'string' && pendingDiff.request && (
            <p className="mt-1 text-xs leading-5 text-ink-600">{pendingDiff.request}</p>
          )}
          <DiffList label={t('roadmapRevisionAdded')} items={list(pendingDiff?.added)} tone="emerald" />
          <DiffList label={t('roadmapRevisionModified')} items={list(pendingDiff?.modified)} tone="primary" />
          <DiffList label={t('roadmapRevisionRemoved')} items={list(pendingDiff?.removed)} tone="amber" />
          {typeof pendingDiff?.rationale === 'string' && pendingDiff.rationale && (
            <p className="mt-2 text-xs leading-5 text-ink-600">{t('roadmapRevisionRationale')}: {pendingDiff.rationale}</p>
          )}
          <p className="mt-2 text-xs text-ink-500">{history.pendingSteps.length} {t('roadmapSteps').toLowerCase()}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void decide(pending, 'approve')} className="btn-primary min-h-8 px-3 py-1 text-xs disabled:opacity-60">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} {t('roadmapRevisionApprove')}
            </button>
            <button type="button" disabled={busy} onClick={() => void decide(pending, 'reject')} className="btn-secondary min-h-8 px-3 py-1 text-xs disabled:opacity-60">{t('roadmapRevisionReject')}</button>
          </div>
        </section>
      )}

      <section className="card p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-700"><Sparkles size={15} className="text-primary-600" /> {t('roadmapLearningTitle')}</h3>
        {history.learning.length === 0 ? (
          <p className="mt-2 text-xs leading-5 text-ink-600">{t('roadmapNoLearning')}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {history.learning.map((entry) => <LearningItem key={entry.id} entry={entry} />)}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <button type="button" onClick={() => setShowVersions((value) => !value)} className="flex w-full items-center gap-2 text-start">
          <RefreshCw size={15} className="text-primary-600" />
          <span className="text-sm font-semibold text-ink-800">{t('roadmapVersionHistory')}</span>
          <span className="ms-auto text-xs text-ink-500">{history.versions.length}</span>
          <ChevronDown size={16} className={`transition ${showVersions ? 'rotate-180' : ''}`} />
        </button>
        {showVersions && (
          history.versions.length === 0 ? <p className="mt-2 text-xs text-ink-600">{t('roadmapNoHistory')}</p> : (
            <ul className="mt-3 space-y-2">
              {history.versions.map((version) => (
                <li key={version.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 p-3 text-sm">
                  <span className="badge bg-ink-100 text-ink-700">{t('roadmapViewVersion', { version: version.version })}</span>
                  {version.status === 'active' && <span className="badge bg-emerald-50 text-emerald-700">{t('roadmapCurrentVersion')}</span>}
                  <span className="min-w-0 flex-1 truncate text-ink-800">{version.summary.title}</span>
                </li>
              ))}
            </ul>
          )
        )}
      </section>
    </div>
  )
}

function Field({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-2">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <ul className="mt-1 space-y-1">
        {items.map((item, index) => <li key={index} className="text-sm leading-6 text-ink-800">{item}</li>)}
      </ul>
    </div>
  )
}

function DiffList({ label, items, tone }: { label: string; items: string[]; tone: 'emerald' | 'primary' | 'amber' }) {
  if (items.length === 0) return null
  const cls = tone === 'emerald' ? 'bg-emerald-50 text-emerald-800' : tone === 'amber' ? 'bg-amber-50 text-amber-800' : 'bg-primary-50 text-primary-800'
  return (
    <div className="mt-2">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <ul className="mt-1 flex flex-wrap gap-2">
        {items.map((item, index) => <li key={index} className={`rounded-full px-3 py-1 text-xs ${cls}`}>{item}</li>)}
      </ul>
    </div>
  )
}

function LearningItem({ entry }: { entry: RoadmapLearning }) {
  const { t } = useCopy()
  return (
    <li className="rounded-xl border border-ink-200 p-3">
      {entry.hypothesis && <p className="text-sm font-medium text-ink-900">{entry.hypothesis}</p>}
      {entry.experiment && <p className="mt-1 text-xs leading-5 text-ink-600">{t('roadmapLearningExperiment')}: {entry.experiment}</p>}
      {entry.actual_outcome && <p className="mt-1 text-xs leading-5 text-ink-600">{t('roadmapLearningOutcome')}: {entry.actual_outcome}</p>}
      <p className="mt-2 text-sm leading-6 text-ink-800">{entry.learning}</p>
      {entry.decision && <p className="mt-1 text-xs leading-5 text-ink-500">{t('roadmapRevisionRationale')}: {entry.decision}</p>}
    </li>
  )
}