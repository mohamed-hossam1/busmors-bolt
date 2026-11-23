'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Compass,
  Flag,
  Gauge,
  Loader2,
  RefreshCw,
  Route,
  ShieldAlert,
  Sparkles,
  Target,
  User,
} from 'lucide-react'
import { useCopy } from '../../hooks/useCopy'
import { useI18n } from '../../context/I18nContext'
import type { AppKey } from '../../lib/i18n'
import { goalDefinition } from './discovery'
import { loadActiveRoadmap, setRoadmapStepStatus } from './api'
import type {
  RoadmapLoad,
  RoadmapStepRecord,
  RoadmapStepStatus,
} from './types'

const DONE_STATUSES: RoadmapStepStatus[] = ['completed', 'owner_reported', 'skipped', 'inapplicable']

function stepStatusKey(status: RoadmapStepStatus): AppKey {
  switch (status) {
    case 'running': return 'roadmapStatusRunning'
    case 'completed': return 'roadmapStatusCompleted'
    case 'owner_reported': return 'roadmapStatusOwnerReported'
    case 'skipped': return 'roadmapStatusSkipped'
    case 'blocked': return 'roadmapStatusBlocked'
    case 'inapplicable': return 'roadmapStatusInapplicable'
    default: return 'roadmapStatusReady'
  }
}

function stepStatusStyle(status: RoadmapStepStatus): string {
  if (status === 'completed' || status === 'owner_reported') return 'bg-emerald-50 text-emerald-700'
  if (status === 'blocked') return 'bg-red-50 text-red-700'
  if (status === 'running') return 'bg-sky-50 text-sky-700'
  if (status === 'skipped') return 'bg-slate-100 text-slate-600'
  if (status === 'inapplicable') return 'bg-ink-100 text-ink-600'
  return 'bg-ink-100 text-ink-700'
}

interface RoadmapPlanProps {
  onEditDiscovery: () => void
}

export default function RoadmapPlan({ onEditDiscovery }: RoadmapPlanProps) {
  const { t } = useCopy()
  const { locale } = useI18n()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<RoadmapLoad | null>(null)
  const [busyStep, setBusyStep] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const loaded = await loadActiveRoadmap()
      setData(loaded)
    } catch {
      setError(t('roadmapLoadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const version = data?.version
  const summary = version?.summary ?? {}
  const steps = data?.steps ?? []
  const goal = data?.roadmap ? goalDefinition(data.roadmap.goal, locale) : undefined

  const doneCount = useMemo(
    () => steps.filter((step) => DONE_STATUSES.includes(step.status)).length,
    [steps],
  )
  const progress = steps.length ? Math.round((doneCount / steps.length) * 100) : 0

  const changeStatus = async (step: RoadmapStepRecord, status: RoadmapStepStatus) => {
    if (busyStep) return
    setBusyStep(step.id)
    setError('')
    try {
      await setRoadmapStepStatus(step.id, status)
      setData((current) =>
        current
          ? { ...current, steps: current.steps.map((row) => (row.id === step.id ? { ...row, status } : row)) }
          : current,
      )
    } catch {
      setError(t('roadmapStepUpdateFailed'))
    } finally {
      setBusyStep(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-600">
        <Loader2 size={16} className="animate-spin" /> {t('roadmapLoading')}
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="card mx-auto max-w-xl p-6">
        <h1 className="text-lg font-semibold">{t('roadmapLoadFailed')}</h1>
        <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>
        <button type="button" onClick={() => void load()} className="btn-primary mt-4"><RefreshCw size={15} /> {t('retry')}</button>
      </div>
    )
  }

  if (!data?.roadmap) {
    return (
      <div className="card mx-auto max-w-xl p-6 text-center">
        <Route className="mx-auto text-ink-400" size={28} />
        <h1 className="mt-3 text-lg font-semibold">{t('roadmapNone')}</h1>
        <p className="mt-2 text-sm text-ink-600">{t('roadmapNoneDesc')}</p>
        <button type="button" onClick={onEditDiscovery} className="btn-primary mt-4">{t('roadmapStartDiscovery')}</button>
      </div>
    )
  }

  const diagnosis = summary.diagnosis
  const objective = summary.objective
  const metrics = summary.metrics ?? []
  const priorities = summary.priorities ?? []
  const risks = summary.risks ?? []
  const review = summary.review

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-start gap-3">
        <span className="brain-page-heading"><Compass size={22} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="workspace-heading">{summary.title || t('roadmapPlanTitle')}</h1>
            <span className="badge bg-emerald-50 text-emerald-700">{t('roadmapActiveBadge')}</span>
            {typeof data.roadmap.version === 'number' && (
              <span className="badge bg-ink-100 text-ink-600">{t('roadmapVersionLabel', { version: data.roadmap.version })}</span>
            )}
          </div>
          <p className="workspace-description">
            {goal?.label ?? data.roadmap.goal}
            {summary.goalLabel ? ` · ${summary.goalLabel}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onEditDiscovery} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">{t('roadmapEditDiscovery')}</button>
          <button type="button" onClick={() => void load()} className="btn-secondary min-h-9 px-3 py-1.5 text-xs"><RefreshCw size={13} /> {t('roadmapRefresh')}</button>
        </div>
      </header>

      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-700"><Target size={16} className="text-primary-600" /> {t('roadmapPrimaryObjective')}</h2>
          <p className="mt-2 text-lg font-semibold leading-snug text-ink-900">{objective?.statement || summary.summary || t('roadmapObjectiveUnknown')}</p>
          {objective?.proposed && <span className="badge mt-2 bg-amber-50 text-amber-800">{t('roadmapObjectiveProposed')}</span>}
          {objective?.rationale && <p className="mt-2 text-sm leading-6 text-ink-600">{objective.rationale}</p>}
          {summary.summary && objective?.statement && summary.summary !== objective.statement && (
            <p className="mt-2 text-sm leading-6 text-ink-600">{summary.summary}</p>
          )}
        </div>
        <div className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-700"><Gauge size={16} className="text-primary-600" /> {t('roadmapProgressLabel')}</h2>
          <p className="mt-2 text-3xl font-semibold text-ink-900">{progress}%</p>
          <p className="mt-1 text-xs text-ink-600">{t('roadmapProgressText', { done: doneCount, total: steps.length })}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          {review?.cadence && (
            <p className="mt-3 text-xs leading-5 text-ink-600">{t('roadmapReviewCadence')}: <span className="font-medium text-ink-800">{review.cadence}</span></p>
          )}
        </div>
      </section>

      {diagnosis && (
        <section className="card mb-4 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-700"><Sparkles size={16} className="text-primary-600" /> {t('roadmapDiagnosis')}</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {diagnosis.whatIsHappening && <Field label={t('roadmapWhatIsHappening')} value={diagnosis.whatIsHappening} />}
            {diagnosis.ownerBelief && <Field label={t('roadmapOwnerBelief')} value={diagnosis.ownerBelief} />}
            {diagnosis.directorHypothesis && <Field label={t('roadmapDirectorHypothesis')} value={diagnosis.directorHypothesis} />}
            {diagnosis.confidence && <Field label={t('roadmapConfidence')} value={diagnosis.confidence} />}
          </div>
          <ListField label={t('roadmapEvidence')} items={diagnosis.evidence} />
          <ListField label={t('roadmapAlternatives')} items={diagnosis.alternatives} />
          <ListField label={t('roadmapUnknowns')} items={diagnosis.unknowns} tone="amber" />
        </section>
      )}

      {metrics.length > 0 && (
        <section className="card mb-4 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-700"><Flag size={16} className="text-primary-600" /> {t('roadmapMetrics')}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pe-4 text-start font-medium">{t('roadmapMetricName')}</th>
                  <th className="py-2 pe-4 text-start font-medium">{t('roadmapMetricBaseline')}</th>
                  <th className="py-2 pe-4 text-start font-medium">{t('roadmapMetricTarget')}</th>
                  <th className="py-2 pe-4 text-start font-medium">{t('roadmapMetricMethod')}</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric, index) => (
                  <tr key={index} className="border-b border-ink-50 align-top">
                    <td className="py-2 pe-4 font-medium text-ink-900">{metric.name}</td>
                    <td className="py-2 pe-4 text-ink-600">{metric.baseline && metric.baseline !== 'unknown' ? metric.baseline : t('roadmapMetricUnknown')}</td>
                    <td className="py-2 pe-4 text-ink-600">{metric.target || '—'}</td>
                    <td className="py-2 pe-4 text-ink-600">{metric.method || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {priorities.length > 0 && (
        <section className="card mb-4 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-700"><Compass size={16} className="text-primary-600" /> {t('roadmapPriorities')}</h2>
          <ul className="mt-3 space-y-2">
            {priorities.map((item, index) => (
              <li key={index} className="rounded-xl bg-ink-50 p-3 text-sm">
                <span className="font-medium text-ink-900">{item.priority}</span>
                {item.why && <span className="mt-1 block text-xs leading-5 text-ink-600">{item.why}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {risks.length > 0 && (
        <section className="card mb-4 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-700"><ShieldAlert size={16} className="text-amber-600" /> {t('roadmapRisks')}</h2>
          <ul className="mt-3 space-y-2">
            {risks.map((item, index) => (
              <li key={index} className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-sm">
                <span className="font-medium text-amber-900">{item.risk}</span>
                {item.assumption && <span className="mt-1 block text-xs leading-5 text-amber-800">{t('roadmapAssumption')}: {item.assumption}</span>}
                {item.mitigation && <span className="mt-1 block text-xs leading-5 text-amber-800">{t('roadmapMitigation')}: {item.mitigation}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-700"><Route size={16} className="text-primary-600" /> {t('roadmapSteps')}</h2>
        {steps.length === 0 ? (
          <p className="mt-2 text-sm text-ink-600">{t('roadmapNoSteps')}</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {steps.map((step, index) => (
              <StepCard
                key={step.id}
                step={step}
                index={index}
                total={steps.length}
                busy={busyStep === step.id}
                onChange={changeStatus}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-sm leading-6 text-ink-800">{value}</p>
    </div>
  )
}

function ListField({ label, items, tone }: { label: string; items?: string[]; tone?: 'amber' }) {
  if (!items || items.length === 0) return null
  return (
    <div className="mt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <ul className="mt-1 flex flex-wrap gap-2">
        {items.map((item, index) => (
          <li
            key={index}
            className={`rounded-full px-3 py-1 text-xs ${tone === 'amber' ? 'bg-amber-50 text-amber-800' : 'bg-ink-100 text-ink-700'}`}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

interface StepCardProps {
  step: RoadmapStepRecord
  index: number
  total: number
  busy: boolean
  onChange: (step: RoadmapStepRecord, status: RoadmapStepStatus) => void
}

function StepCard({ step, index, total, busy, onChange }: StepCardProps) {
  const { t } = useCopy()
  const done = DONE_STATUSES.includes(step.status)
  const isDirector = step.responsibility === 'system' || step.execution_mode === 'director'

  return (
    <li className={`rounded-2xl border p-4 transition ${done ? 'border-emerald-200 bg-emerald-50/40' : 'border-ink-200 bg-white'}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${done ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-ink-300 text-ink-500'}`}>
          {done ? <CheckCircle2 size={14} /> : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-ink-400">{t('roadmapStepOf', { index: index + 1, total })}</span>
            <span className={`badge ${stepStatusStyle(step.status)}`}>
              {step.status === 'running' && <Loader2 size={11} className="animate-spin" />} {t(stepStatusKey(step.status))}
            </span>
            <span className="badge bg-ink-100 text-ink-600">
              {isDirector ? <><Sparkles size={11} /> {t('roadmapResponsibilitySystem')}</> : <><User size={11} /> {t('roadmapResponsibilityOwner')}</>}
            </span>
          </div>
          <h3 className="mt-1 text-base font-semibold text-ink-900">{step.title}</h3>
          {step.objective && <p className="mt-1 text-sm leading-6 text-ink-600">{step.objective}</p>}
          {step.rationale && <p className="mt-1 text-xs leading-5 text-ink-500">{step.rationale}</p>}
          {step.uncertainty && (
            <p className="mt-2 flex items-start gap-1 text-xs text-amber-800"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {step.uncertainty}</p>
          )}
          {step.external_approval && (
            <p className="mt-2 text-xs text-ink-500">{t('roadmapExternalApproval')}: {step.external_approval}</p>
          )}
          {step.checklist.length > 0 && (
            <ul className="mt-2 space-y-1">
              {step.checklist.map((item, itemIndex) => (
                <li key={itemIndex} className="flex items-start gap-2 text-xs leading-5 text-ink-600">
                  <Circle size={10} className="mt-1.5 shrink-0 text-ink-300" /> {item}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {step.effort && <span className="text-[11px] text-ink-400">{t('roadmapEffort')}: {step.effort}</span>}
          </div>

          {isDirector ? (
            <p className="mt-3 rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-800">{t('roadmapDirectorLedNote')}</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {step.status !== 'completed' && step.status !== 'owner_reported' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onChange(step, 'completed')}
                  className="btn-secondary min-h-8 px-3 py-1 text-xs disabled:opacity-60"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} {t('roadmapMarkComplete')}
                </button>
              )}
              {step.status !== 'blocked' && !done && (
                <button type="button" disabled={busy} onClick={() => onChange(step, 'blocked')} className="btn-secondary min-h-8 px-3 py-1 text-xs disabled:opacity-60">{t('roadmapMarkBlocked')}</button>
              )}
              {step.status !== 'skipped' && !done && (
                <button type="button" disabled={busy} onClick={() => onChange(step, 'skipped')} className="btn-secondary min-h-8 px-3 py-1 text-xs disabled:opacity-60">{t('roadmapSkip')}</button>
              )}
              {done && (
                <button type="button" disabled={busy} onClick={() => onChange(step, 'ready')} className="btn-secondary min-h-8 px-3 py-1 text-xs disabled:opacity-60">{t('roadmapReopen')}</button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}