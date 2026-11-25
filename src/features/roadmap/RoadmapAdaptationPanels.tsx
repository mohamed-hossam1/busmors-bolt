'use client'

import { useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  History,
  Lightbulb,
  Plus,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { useCopy } from '../../hooks/useCopy'
import type { AppKey } from '../../lib/i18n'
import {
  approveRevision,
  createLearningLogEntry,
  promoteLearningToBrain,
  proposeRevision,
  rejectRevision,
  submitCheckin,
  type BrainPromotableCategory,
} from './api'
import type {
  DirectorRecommendation,
  RoadmapCheckinRecord,
  RoadmapLearningLogRecord,
  RoadmapLoad,
  RoadmapRevisionDiff,
  RoadmapRevisionRecord,
  RoadmapStepRecord,
} from './types'

type T = (key: AppKey, values?: Record<string, string | number>) => string

const REC_BADGE: Record<DirectorRecommendation, string> = {
  Continue: 'bg-emerald-50 text-emerald-700',
  Adjust: 'bg-amber-50 text-amber-800',
  Pause: 'bg-slate-100 text-slate-600',
  'Change direction': 'bg-sky-50 text-sky-700',
}

function recLabel(rec: DirectorRecommendation, t: T): string {
  switch (rec) {
    case 'Continue':
      return t('recContinue')
    case 'Adjust':
      return t('recAdjust')
    case 'Pause':
      return t('recPause')
    case 'Change direction':
      return t('recChangeDirection')
  }
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

function asDiff(value: RoadmapRevisionRecord['diff']): RoadmapRevisionDiff {
  const record = (value ?? {}) as Record<string, unknown>
  const arr = (input: unknown): RoadmapRevisionDiff['added'] =>
    Array.isArray(input) ? (input as RoadmapRevisionDiff['added']) : []
  return {
    added: arr(record.added),
    removedOrPostponed: arr(record.removedOrPostponed),
    modified: arr(record.modified),
    summaryChanges: Array.isArray(record.summaryChanges) ? (record.summaryChanges as string[]) : [],
  }
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4">
      <div className={`card my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} p-5`}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {subtitle && <p className="mt-1 text-xs leading-5 text-ink-600">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn-secondary min-h-8 px-2 py-1 text-xs" aria-label="Close">
            <X size={13} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <label className="block text-xs font-medium text-ink-700">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="input-field mt-1 w-full"
      />
    </label>
  )
}

export interface ReviewProgressModalProps {
  roadmapId: string
  locale: string
  checkins: RoadmapCheckinRecord[]
  onClose: () => void
  onSaved: () => void
}

/** Lightweight qualitative check-in modal + Director evaluation + history. */
export function ReviewProgressModal({ roadmapId, locale, checkins, onClose, onSaved }: ReviewProgressModalProps) {
  const [t] = useCopySafe()
  const [completed, setCompleted] = useState('')
  const [results, setResults] = useState('')
  const [didntWork, setDidntWork] = useState('')
  const [blockers, setBlockers] = useState('')
  const [businessChanges, setBusinessChanges] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [evaluation, setEvaluation] = useState<{ assessment: string; recommendation: DirectorRecommendation; rationale: string } | null>(null)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await submitCheckin({
        roadmapId,
        locale,
        completedSummary: completed,
        actualResults: results,
        whatDidntWork: didntWork,
        blockers,
        businessChanges,
      })
      setEvaluation(result.evaluation)
      setCompleted('')
      setResults('')
      setDidntWork('')
      setBlockers('')
      setBusinessChanges('')
      onSaved()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('reviewFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title={t('reviewModalTitle')} subtitle={t('reviewModalSubtitle')} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('reviewCompletedLabel')} value={completed} onChange={setCompleted} placeholder={t('reviewCompletedPlaceholder')} />
        <Field label={t('reviewResultsLabel')} value={results} onChange={setResults} placeholder={t('reviewResultsPlaceholder')} />
        <Field label={t('reviewDidntWorkLabel')} value={didntWork} onChange={setDidntWork} placeholder={t('reviewDidntWorkPlaceholder')} />
        <Field label={t('reviewBlockersLabel')} value={blockers} onChange={setBlockers} placeholder={t('reviewBlockersPlaceholder')} />
        <Field label={t('reviewBusinessChangesLabel')} value={businessChanges} onChange={setBusinessChanges} placeholder={t('reviewBusinessChangesPlaceholder')} />
        {error && <p role="alert" className="rounded-xl bg-red-50 p-2 text-xs text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary min-h-8 px-3 py-1 text-xs">{t('cancel')}</button>
          <button type="button" onClick={() => void submit()} disabled={busy} className="btn-primary min-h-8 px-3 py-1 text-xs">
            {busy ? <Spinner size={13} /> : <Sparkles size={13} />} {t('reviewSubmit')}
          </button>
        </div>

        {evaluation && (
          <div className="rounded-xl border border-primary-200 bg-primary-50/60 p-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-primary-900">{t('directorEvaluationTitle')}</p>
              <span className={`badge ${REC_BADGE[evaluation.recommendation]}`}>{recLabel(evaluation.recommendation, t)}</span>
            </div>
            <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-ink-500">{t('directorAssessmentLabel')}</p>
            <p className="text-sm leading-6 text-ink-800">{evaluation.assessment}</p>
            <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-ink-500">{t('directorRationaleLabel')}</p>
            <p className="text-sm leading-6 text-ink-700">{evaluation.rationale}</p>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-ink-900">{t('reviewHistoryTitle')}</p>
          {checkins.length === 0 ? (
            <p className="mt-1 text-xs text-ink-500">{t('reviewEmpty')}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {checkins.slice(0, 8).map((checkin) => (
                <li key={checkin.id} className="rounded-xl border border-ink-100 p-2">
                  <div className="flex items-center gap-2">
                    <span className={`badge ${REC_BADGE[checkin.director_recommendation]}`}>{recLabel(checkin.director_recommendation, t)}</span>
                    <span className="text-[11px] text-ink-400">{formatDate(checkin.created_at, locale)}</span>
                  </div>
                  {checkin.director_assessment && <p className="mt-1 text-xs leading-5 text-ink-700">{checkin.director_assessment}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

export interface AdjustRoadmapModalProps {
  roadmap: RoadmapLoad['roadmap']
  locale: string
  pendingRevision: RoadmapRevisionRecord | null
  onClose: () => void
  onApplied: (load: RoadmapLoad) => void
  onRejected: () => void
}

/** Free-text change request + proposed revision diff + approve/reject. */
export function AdjustRoadmapModal({ roadmap, locale, pendingRevision, onClose, onApplied, onRejected }: AdjustRoadmapModalProps) {
  const [t] = useCopySafe()
  const [request, setRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState<RoadmapRevisionRecord | null>(pendingRevision)
  const [diff, setDiff] = useState<RoadmapRevisionDiff>(pendingRevision ? asDiff(pendingRevision.diff) : { added: [], removedOrPostponed: [], modified: [], summaryChanges: [] })
  const [rationale, setRationale] = useState(pendingRevision?.rationale ?? '')

  const roadmapId = roadmap?.id ?? ''
  const expectedVersion = roadmap?.version ?? 1

  const propose = async () => {
    if (!request.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await proposeRevision(roadmapId, request.trim(), locale)
      setRevision(result.revision)
      setDiff(result.diff)
      setRationale(result.rationale)
      setRequest('')
    } catch (proposeError) {
      setError(proposeError instanceof Error ? proposeError.message : t('adjustFailed'))
    } finally {
      setBusy(false)
    }
  }

  const approve = async () => {
    if (!revision) return
    setBusy(true)
    setError('')
    try {
      const load = await approveRevision(revision.id, expectedVersion)
      onApplied(load)
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : t('revisionApplyFailed'))
      setBusy(false)
    }
  }

  const reject = async () => {
    if (!revision) return
    setBusy(true)
    setError('')
    try {
      await rejectRevision(revision.id)
      setRevision(null)
      setDiff({ added: [], removedOrPostponed: [], modified: [], summaryChanges: [] })
      setRationale('')
      onRejected()
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : t('revisionRejectFailed'))
      setBusy(false)
    }
  }

  const hasDiff = diff.added.length + diff.removedOrPostponed.length + diff.modified.length + diff.summaryChanges.length > 0

  return (
    <ModalShell title={t('adjustModalTitle')} subtitle={t('adjustModalSubtitle')} onClose={onClose} wide>
      <div className="space-y-4">
        {!revision && (
          <div className="space-y-2">
            <Field label={t('adjustRequestLabel')} value={request} onChange={setRequest} placeholder={t('adjustRequestPlaceholder')} rows={3} />
            <div className="flex justify-end">
              <button type="button" onClick={() => void propose()} disabled={busy || !request.trim()} className="btn-primary min-h-8 px-3 py-1 text-xs">
                {busy ? <Spinner size={13} /> : <Sparkles size={13} />} {t('adjustSubmit')}
              </button>
            </div>
          </div>
        )}

        {revision && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-ink-900">{t('revisionProposedTitle')}</p>
              <span className="badge bg-amber-50 text-amber-800">{t('revisionPendingBadge')}</span>
            </div>
            {rationale && (
              <div className="rounded-xl bg-ink-50 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{t('revisionRationaleLabel')}</p>
                <p className="mt-1 text-sm leading-6 text-ink-800">{rationale}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-ink-900">{t('diffCurrentVsProposed')}</p>
              {!hasDiff ? (
                <p className="mt-1 text-xs text-ink-500">{t('diffEmpty')}</p>
              ) : (
                <div className="mt-2 grid gap-3 md:grid-cols-3">
                  <DiffColumn title={t('diffAdded')} items={diff.added} tone="emerald" />
                  <DiffColumn title={t('diffRemoved')} items={diff.removedOrPostponed} tone="red" />
                  <DiffColumn title={t('diffModified')} items={diff.modified} tone="amber" />
                </div>
              )}
              {diff.summaryChanges.length > 0 && (
                <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-sky-800">{t('diffSummaryChanges')}</p>
                  <ul className="mt-1 list-disc ps-4 text-xs leading-5 text-ink-700">
                    {diff.summaryChanges.map((change, index) => <li key={index}>{change}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => void reject()} disabled={busy} className="btn-secondary min-h-8 px-3 py-1 text-xs">
                <X size={13} /> {t('discardRejectRevision')}
              </button>
              <button type="button" onClick={() => void approve()} disabled={busy} className="btn-primary min-h-8 px-3 py-1 text-xs">
                {busy ? <Spinner size={13} /> : <CheckCircle2 size={13} />} {t('approveApplyRevision')}
              </button>
            </div>
          </div>
        )}

        {error && <p role="alert" className="rounded-xl bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      </div>
    </ModalShell>
  )
}

function DiffColumn({
  title,
  items,
  tone,
}: {
  title: string
  items: RoadmapRevisionDiff['added']
  tone: 'emerald' | 'red' | 'amber'
}) {
  const toneClass = tone === 'emerald' ? 'border-emerald-200 bg-emerald-50/50' : tone === 'red' ? 'border-red-200 bg-red-50/50' : 'border-amber-200 bg-amber-50/50'
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-700">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-[11px] text-ink-400">—</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((item, index) => (
            <li key={item.key || index} className="text-xs leading-5 text-ink-800">
              <span className="font-medium">{item.title}</span>
              {item.change ? ` — ${item.change}` : item.why ? ` — ${item.why}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export interface VersionHistoryDrawerProps {
  versions: RoadmapLoad['versions']
  locale: string
  activeVersionId: string | null
  onClose: () => void
}

/** Read-only immutable version history. */
export function VersionHistoryDrawer({ versions, locale, activeVersionId, onClose }: VersionHistoryDrawerProps) {
  const [t] = useCopySafe()
  const ordered = useMemo(() => (versions ?? []).slice().sort((a, b) => b.version - a.version), [versions])
  return (
    <ModalShell title={t('versionHistoryTitle')} subtitle={t('versionHistorySubtitle')} onClose={onClose} wide>
      {ordered.length === 0 ? (
        <p className="text-xs text-ink-500">{t('versionEmpty')}</p>
      ) : (
        <ul className="space-y-3">
          {ordered.map((version) => {
            const summary = (version.summary ?? {}) as { primaryObjective?: { title?: string }; milestones?: unknown[] }
            const isActive = version.id === activeVersionId || version.status === 'active'
            const milestoneCount = Array.isArray(summary.milestones)
              ? summary.milestones.reduce<number>((total, milestone) => {
                  const actions = (milestone as { actions?: unknown[] }).actions
                  return total + (Array.isArray(actions) ? actions.length : 0)
                }, 0)
              : 0
            return (
              <li key={version.id} className="rounded-xl border border-ink-100 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1 text-sm font-semibold text-ink-900">
                    <History size={14} /> {t('versionLabel', { version: version.version })}
                  </span>
                  <span className={`badge ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {isActive ? t('versionActive') : t('versionArchived')}
                  </span>
                  <span className="text-[11px] text-ink-400">{formatDate(version.created_at, locale)}</span>
                </div>
                {summary.primaryObjective?.title && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink-700"><Target size={12} /> {summary.primaryObjective.title}</p>
                )}
                <p className="mt-1 text-[11px] text-ink-500">{t('versionMilestoneCount', { count: milestoneCount })}</p>
              </li>
            )
          })}
        </ul>
      )}
    </ModalShell>
  )
}

export interface LearningLogPanelProps {
  roadmapId: string
  locale: string
  steps: RoadmapStepRecord[]
  entries: RoadmapLearningLogRecord[]
  onChanged: () => void
}

const PROMOTABLE: BrainPromotableCategory[] = [
  'company_fact',
  'audience',
  'offering',
  'positioning',
  'channel',
  'brand_rule',
  'strategic_goal',
]

function categoryLabel(category: BrainPromotableCategory, t: T): string {
  return t(`category_${category}` as AppKey)
}

/** Roadmap-scoped learning log form + list + promote-to-Brain flow. */
export function LearningLogPanel({ roadmapId, locale, steps, entries, onChanged }: LearningLogPanelProps) {
  const [t] = useCopySafe()
  const [hypothesis, setHypothesis] = useState('')
  const [experiment, setExperiment] = useState('')
  const [expected, setExpected] = useState('')
  const [actual, setActual] = useState('')
  const [learning, setLearning] = useState('')
  const [decision, setDecision] = useState('')
  const [stepId, setStepId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [promoteFor, setPromoteFor] = useState<RoadmapLearningLogRecord | null>(null)

  const reset = () => {
    setHypothesis('')
    setExperiment('')
    setExpected('')
    setActual('')
    setLearning('')
    setDecision('')
    setStepId('')
  }

  const add = async () => {
    setBusy(true)
    setError('')
    try {
      await createLearningLogEntry({
        roadmapId,
        stepId: stepId || null,
        hypothesis,
        experiment,
        expectedOutcome: expected,
        actualOutcome: actual,
        learning,
        decision,
      })
      reset()
      onChanged()
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : t('learningFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2">
        <Lightbulb size={16} className="text-primary-700" />
        <h2 className="text-sm font-semibold text-ink-900">{t('learningLogTitle')}</h2>
      </div>
      <p className="mt-1 text-xs text-ink-500">{t('learningLogScopeNote')}</p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label={t('learningHypothesisLabel')} value={hypothesis} onChange={setHypothesis} placeholder={t('learningHypothesisPlaceholder')} />
        <Field label={t('learningExperimentLabel')} value={experiment} onChange={setExperiment} placeholder={t('learningExperimentPlaceholder')} />
        <Field label={t('learningExpectedLabel')} value={expected} onChange={setExpected} placeholder={t('learningExpectedPlaceholder')} />
        <Field label={t('learningActualLabel')} value={actual} onChange={setActual} placeholder={t('learningActualPlaceholder')} />
        <Field label={t('learningLearningLabel')} value={learning} onChange={setLearning} placeholder={t('learningLearningPlaceholder')} />
        <Field label={t('learningDecisionLabel')} value={decision} onChange={setDecision} placeholder={t('learningDecisionPlaceholder')} />
      </div>
      <label className="mt-3 block text-xs font-medium text-ink-700">
        {t('learningStepLabel')}
        <select value={stepId} onChange={(event) => setStepId(event.target.value)} className="input-field mt-1 w-full">
          <option value="">{t('learningStepNone')}</option>
          {steps.map((step) => (
            <option key={step.id} value={step.id}>{step.title}</option>
          ))}
        </select>
      </label>

      {error && <p role="alert" className="mt-2 rounded-xl bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || !hypothesis.trim() || !experiment.trim() || !learning.trim()}
          className="btn-primary min-h-8 px-3 py-1 text-xs"
        >
          {busy ? <Spinner size={13} /> : <Plus size={13} />} {t('learningAdd')}
        </button>
      </div>

      {entries.length > 0 && (
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-ink-100 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-ink-900">{entry.hypothesis}</p>
                {entry.promoted_proposal_id && (
                  <span className="badge bg-emerald-50 text-emerald-700">{t('proposedToBrainPending')}</span>
                )}
              </div>
              <p className="mt-1 text-xs leading-5 text-ink-600"><span className="font-medium">{t('learningExperimentLabel')}:</span> {entry.experiment}</p>
              {entry.actual_outcome && <p className="text-xs leading-5 text-ink-600"><span className="font-medium">{t('learningActualLabel')}:</span> {entry.actual_outcome}</p>}
              <p className="mt-1 text-xs leading-5 text-ink-800"><span className="font-medium">{t('learningLearningLabel')}:</span> {entry.learning}</p>
              {entry.decision && <p className="text-xs leading-5 text-ink-600"><span className="font-medium">{t('learningDecisionLabel')}:</span> {entry.decision}</p>}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-ink-400">{formatDate(entry.created_at, locale)}</span>
                {!entry.promoted_proposal_id && (
                  <button type="button" onClick={() => setPromoteFor(entry)} className="btn-secondary min-h-7 px-2 py-0.5 text-[11px]">
                    <ArrowRight size={11} /> {t('proposeToBrain')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {promoteFor && (
        <PromoteLearningModal
          entry={promoteFor}
          onClose={() => setPromoteFor(null)}
          onDone={() => {
            setPromoteFor(null)
            onChanged()
          }}
        />
      )}
    </section>
  )
}

function PromoteLearningModal({
  entry,
  onClose,
  onDone,
}: {
  entry: RoadmapLearningLogRecord
  onClose: () => void
  onDone: () => void
}) {
  const [t] = useCopySafe()
  const [category, setCategory] = useState<BrainPromotableCategory>('company_fact')
  const [title, setTitle] = useState(entry.hypothesis.slice(0, 150))
  const [summary, setSummary] = useState(entry.learning.slice(0, 6000))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await promoteLearningToBrain(entry.id, { category, title, summary })
      onDone()
    } catch (promoteError) {
      setError(promoteError instanceof Error ? promoteError.message : t('promoteFailed'))
      setBusy(false)
    }
  }

  return (
    <ModalShell title={t('promoteModalTitle')} subtitle={t('promoteModalSubtitle')} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-xs font-medium text-ink-700">
          {t('promoteCategoryLabel')}
          <select value={category} onChange={(event) => setCategory(event.target.value as BrainPromotableCategory)} className="input-field mt-1 w-full">
            {PROMOTABLE.map((value) => (
              <option key={value} value={value}>{categoryLabel(value, t)}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-ink-700">
          {t('promoteTitleLabel')}
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={150} className="input-field mt-1 w-full" />
        </label>
        <Field label={t('promoteSummaryLabel')} value={summary} onChange={setSummary} rows={3} />
        {error && <p role="alert" className="rounded-xl bg-red-50 p-2 text-xs text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary min-h-8 px-3 py-1 text-xs">{t('cancel')}</button>
          <button type="button" onClick={() => void submit()} disabled={busy || !title.trim() || !summary.trim()} className="btn-primary min-h-8 px-3 py-1 text-xs">
            {busy ? <Spinner size={13} /> : <Sparkles size={13} />} {t('promoteSubmit')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// useCopy returns the typed translator the rest of the dashboard uses.
function useCopySafe(): [T] {
  const { t } = useCopy()
  return [t as T]
}