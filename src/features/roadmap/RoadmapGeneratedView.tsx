'use client'

import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleHelp,
  Lightbulb,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { useCopy } from '../../hooks/useCopy'
import type { AppKey } from '../../lib/i18n'
import { updateRoadmapObjective } from './api'
import type {
  GeneratedAction,
  GeneratedMilestone,
  GeneratedPrimaryObjective,
  GeneratedPriority,
  GeneratedResponsibleParty,
  RoadmapLoad,
} from './types'

interface RoadmapGeneratedViewProps {
  data: RoadmapLoad
  locale: string
  regenerating?: boolean
  onBackToDiscovery: () => void
  onRegenerate: () => void
  onUpdated: (roadmap: RoadmapLoad['roadmap'], activeVersion: RoadmapLoad['activeVersion']) => void
}

const RESPONSIBLE_LABEL: Record<GeneratedResponsibleParty, AppKey> = {
  owner: 'respOwner',
  director: 'respDirector',
  joint: 'respJoint',
}

const PRIORITY_LABEL: Record<GeneratedPriority, AppKey> = {
  high: 'priorityHigh',
  medium: 'priorityMedium',
  low: 'priorityLow',
}

function responsibleLabel(role: GeneratedResponsibleParty, t: (key: AppKey) => string): string {
  return t(RESPONSIBLE_LABEL[role] ?? 'respOwner')
}

function priorityLabel(priority: GeneratedPriority, t: (key: AppKey) => string): string {
  return t(PRIORITY_LABEL[priority] ?? 'priorityMedium')
}

function formatReviewDate(value: string | null, locale: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function RoadmapGeneratedView({
  data,
  locale,
  regenerating = false,
  onBackToDiscovery,
  onRegenerate,
  onUpdated,
}: RoadmapGeneratedViewProps) {
  const { t } = useCopy()
  const [view, setView] = useState<RoadmapLoad>(data)
  const [editing, setEditing] = useState(false)
  const [draftObjective, setDraftObjective] = useState<GeneratedPrimaryObjective | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setView(data)
  }, [data])

  const { roadmap, activeVersion, steps, staleDependencies } = view
  const plan = activeVersion?.summary ?? null

  if (!roadmap || !plan) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="card p-6">
          <h1 className="text-lg font-semibold">{t('roadmapTitle')}</h1>
          <p className="mt-2 text-sm text-ink-600">{t('noActiveRoadmap')}</p>
          <button type="button" onClick={onBackToDiscovery} className="btn-secondary mt-4">
            <ArrowLeft size={15} /> {t('backToDiscovery')}
          </button>
        </div>
      </div>
    )
  }

  const beginEdit = () => {
    setDraftObjective({ ...plan.primaryObjective })
    setEditing(true)
    setError('')
  }

  const cancelEdit = () => {
    setEditing(false)
    setDraftObjective(null)
  }

  const saveObjective = async () => {
    if (!draftObjective || !roadmap) return
    setSaving(true)
    setError('')
    try {
      const updated = await updateRoadmapObjective(roadmap.id, roadmap.version, draftObjective)
      setView((current) => ({ ...current, roadmap: updated.roadmap, activeVersion: updated.activeVersion }))
      onUpdated(updated.roadmap, updated.activeVersion)
      setEditing(false)
      setDraftObjective(null)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('objectiveSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const objective = plan.primaryObjective
  const nextReview = formatReviewDate(roadmap.next_review_at, locale)

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start gap-3">
        <span className="brain-page-heading"><Sparkles size={22} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="workspace-heading">{t('roadmapGeneratedTitle')}</h1>
          <p className="workspace-description">
            {t('roadmapGeneratedSubtitle', { goal: roadmap.goal, version: roadmap.version })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onBackToDiscovery} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
            <ArrowLeft size={13} /> {t('backToDiscovery')}
          </button>
          <button type="button" onClick={onRegenerate} disabled={regenerating} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
            {regenerating ? <Spinner size={13} /> : <RefreshCw size={13} />} {t('regenerateRoadmap')}
          </button>
        </div>
      </header>

      {staleDependencies.length > 0 && (
        <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={17} className="text-amber-800" />
            <h2 className="font-semibold text-amber-900">{t('brainChangedTitle')}</h2>
          </div>
          <p className="mt-1 text-sm text-amber-900">{t('brainChangedDesc', { count: staleDependencies.length })}</p>
          <ul className="mt-2 space-y-1">
            {staleDependencies.map((dependency) => (
              <li key={dependency.dependencyId} className="text-xs text-amber-900">
                · {t(`staleReason_${dependency.reason}` as AppKey)} (v{dependency.nodeVersion} → v{dependency.currentVersion})
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Business Diagnosis */}
      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Lightbulb size={15} className="text-primary-600" /> {t('diagnosisTitle')}</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-ink-50 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{t('perceivedProblem')}</p>
            <p className="mt-1 text-sm leading-6 text-ink-800">{plan.diagnosis.perceivedProblem}</p>
          </div>
          <div className="rounded-xl bg-primary-50 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-primary-700">{t('rootDiagnosis')}</p>
            <p className="mt-1 text-sm leading-6 text-ink-800">{plan.diagnosis.rootDiagnosis}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <DiagnosisList title={t('verifiedEvidence')} items={plan.diagnosis.supportingEvidence} tone="emerald" />
          <DiagnosisList title={t('hypotheses')} items={plan.diagnosis.hypotheses} tone="primary" />
          <DiagnosisList title={t('unknowns')} items={plan.diagnosis.unknowns} tone="amber" />
        </div>
      </section>

      {/* Primary Objective */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Target size={15} className="text-primary-600" /> {t('primaryObjectiveTitle')}</h2>
          {objective.isProposedTarget && <span className="badge bg-primary-50 text-primary-700">{t('proposedTargetBadge')}</span>}
          {!editing && (
            <button type="button" onClick={beginEdit} className="btn-secondary ms-auto min-h-8 px-2.5 py-1 text-xs">
              <Pencil size={12} /> {t('editObjective')}
            </button>
          )}
        </div>
        {editing && draftObjective ? (
          <div className="mt-3 space-y-3">
            <label className="block text-xs font-medium text-ink-600">
              {t('objectiveTitleLabel')}
              <input
                value={draftObjective.title}
                onChange={(event) => setDraftObjective({ ...draftObjective, title: event.target.value })}
                className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-ink-600">
              {t('objectiveOutcomeLabel')}
              <textarea
                value={draftObjective.outcome}
                onChange={(event) => setDraftObjective({ ...draftObjective, outcome: event.target.value })}
                rows={2}
                className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-ink-600">
              {t('objectiveTargetLabel')}
              <input
                value={draftObjective.proposedTarget ?? ''}
                onChange={(event) =>
                  setDraftObjective({ ...draftObjective, proposedTarget: event.target.value || null, isProposedTarget: false })
                }
                className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              />
            </label>
            {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => void saveObjective()} disabled={saving} className="btn-primary min-h-9 px-3 py-1.5 text-xs">
                {saving ? <Spinner size={13} /> : <Save size={13} />} {t('saveObjective')}
              </button>
              <button type="button" onClick={cancelEdit} disabled={saving} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
                <X size={13} /> {t('cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-base font-semibold text-ink-900">{objective.title}</p>
            <p className="mt-1 text-sm leading-6 text-ink-700">{objective.outcome}</p>
            {objective.proposedTarget && (
              <p className="mt-2 text-sm text-ink-600">
                {t('proposedTargetLabel')}: <span className="font-medium text-ink-900">{objective.proposedTarget}</span>
              </p>
            )}
          </div>
        )}
      </section>

      {/* Success Metrics */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold">{t('metricsTitle')}</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-start text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-start text-xs uppercase tracking-wide text-ink-500">
                <th className="py-2 pe-3 text-start font-medium">{t('metricName')}</th>
                <th className="py-2 pe-3 text-start font-medium">{t('metricBaseline')}</th>
                <th className="py-2 pe-3 text-start font-medium">{t('metricTarget')}</th>
                <th className="py-2 pe-3 text-start font-medium">{t('metricMethod')}</th>
                <th className="py-2 text-start font-medium">{t('metricReview')}</th>
              </tr>
            </thead>
            <tbody>
              {plan.metrics.map((metric) => (
                <tr key={metric.key} className="border-b border-ink-50 align-top">
                  <td className="py-2 pe-3 font-medium text-ink-900">{metric.name}</td>
                  <td className="py-2 pe-3 text-ink-700">
                    {metric.currentBaseline === 'unknown' ? (
                      <span className="badge bg-ink-100 text-ink-600">{t('unknownBaseline')}</span>
                    ) : (
                      metric.currentBaseline
                    )}
                  </td>
                  <td className="py-2 pe-3 text-ink-700">
                    {metric.target}
                    {metric.isProposedTarget && <span className="badge ms-1 bg-primary-50 text-primary-700">{t('proposedBadge')}</span>}
                  </td>
                  <td className="py-2 pe-3 text-ink-600">{metric.measurementMethod}</td>
                  <td className="py-2 text-ink-600">{metric.reviewTiming}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Strategic Priorities */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold">{t('prioritiesTitle')}</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <PriorityList title={t('focusFirst')} items={plan.priorities.focusFirst} tone="emerald" />
          <PriorityList title={t('intentionallyDeferred')} items={plan.priorities.intentionallyDeferred} tone="ink" />
        </div>
      </section>

      {/* Risks & Assumptions */}
      {plan.risksAndAssumptions.length > 0 && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold">{t('risksTitle')}</h2>
          <ul className="mt-3 space-y-2">
            {plan.risksAndAssumptions.map((risk, index) => (
              <li key={`${risk.kind}-${index}`} className="rounded-xl bg-ink-50 p-3">
                <div className="flex items-center gap-2">
                  <span className={`badge ${risk.kind === 'risk' ? 'bg-red-50 text-red-700' : 'bg-primary-50 text-primary-700'}`}>
                    {risk.kind === 'risk' ? t('riskKind') : t('assumptionKind')}
                  </span>
                  <p className="text-sm font-medium text-ink-900">{risk.statement}</p>
                </div>
                {risk.mitigation && <p className="mt-1 text-xs leading-5 text-ink-600">{t('mitigationLabel')}: {risk.mitigation}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Review Strategy */}
      <section className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
        <h2 className="text-sm font-semibold text-primary-800">{t('reviewStrategyTitle')}</h2>
        <p className="mt-1 text-sm text-primary-900">
          {t('reviewCadenceLabel', { cadence: t(`cadence_${plan.reviewCadence.frequency}` as AppKey) })}
          {nextReview && <> · {t('nextReviewLabel', { date: nextReview })}</>}
        </p>
        {plan.reviewCadence.rationale && <p className="mt-1 text-xs leading-5 text-primary-800">{plan.reviewCadence.rationale}</p>}
      </section>

      {/* Milestones & Actions */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t('milestonesTitle')}</h2>
        {plan.milestones.map((milestone, milestoneIndex) => (
          <MilestoneCard
            key={milestone.key}
            milestone={milestone}
            index={milestoneIndex}
            steps={steps}
            t={t}
          />
        ))}
      </section>
    </div>
  )
}

function DiagnosisList({ title, items, tone }: { title: string; items: string[]; tone: 'emerald' | 'primary' | 'amber' }) {
  const toneClass =
    tone === 'emerald' ? 'bg-emerald-50 text-emerald-800' : tone === 'amber' ? 'bg-amber-50 text-amber-800' : 'bg-primary-50 text-primary-800'
  return (
    <div className="rounded-xl bg-ink-50 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-ink-500">—</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((item, index) => (
            <li key={index} className="flex items-start gap-1.5 text-xs leading-5 text-ink-700">
              <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${toneClass.split(' ')[0]}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PriorityList({ title, items, tone }: { title: string; items: Array<{ title: string; why: string }>; tone: 'emerald' | 'ink' }) {
  return (
    <div className="rounded-xl bg-ink-50 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-ink-500">—</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item, index) => (
            <li key={index} className="flex items-start gap-2">
              <Check size={14} className={`mt-0.5 shrink-0 ${tone === 'emerald' ? 'text-emerald-600' : 'text-ink-400'}`} />
              <span>
                <span className="block text-sm font-medium text-ink-900">{item.title}</span>
                <span className="block text-xs leading-5 text-ink-600">{item.why}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MilestoneCard({
  milestone,
  index,
  steps,
  t,
}: {
  milestone: GeneratedMilestone
  index: number
  steps: RoadmapLoad['steps']
  t: (key: AppKey, values?: Record<string, string | number>) => string
}) {
  const milestoneSteps = steps.filter((step) => step.milestone_key === milestone.key)
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-xs font-semibold text-white">{index + 1}</span>
        <h3 className="text-sm font-semibold text-ink-900">{milestone.title}</h3>
        {milestone.sequenceLabel && <span className="badge bg-ink-100 text-ink-600">{milestone.sequenceLabel}</span>}
      </div>
      <p className="mt-2 text-sm leading-6 text-ink-600">{milestone.description}</p>
      <ul className="mt-3 space-y-3">
        {milestone.actions.map((action) => (
          <ActionCard key={action.key} action={action} step={milestoneSteps.find((step) => step.step_key === action.key)} t={t} />
        ))}
      </ul>
    </div>
  )
}

function ActionCard({
  action,
  step,
  t,
}: {
  action: GeneratedAction
  step: RoadmapLoad['steps'][number] | undefined
  t: (key: AppKey, values?: Record<string, string | number>) => string
}) {
  const status = step?.status ?? 'ready'
  return (
    <li className="rounded-xl border border-ink-100 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-ink-900">{action.title}</p>
        <span className="badge bg-primary-50 text-primary-700">{responsibleLabel(action.responsibleParty, t)}</span>
        <span className="badge bg-ink-100 text-ink-600">{priorityLabel(action.priority, t)}</span>
        <span className="badge bg-ink-50 text-ink-500">{t(`actionKind_${action.actionKind}` as AppKey)}</span>
        <span className="badge ms-auto bg-emerald-50 text-emerald-700">{t(`stepStatus_${status}` as AppKey)}</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-ink-600">{action.description}</p>
      <dl className="mt-2 grid gap-1 text-xs leading-5 text-ink-600 sm:grid-cols-2">
        <div>
          <dt className="font-medium text-ink-700">{t('expectedOutputLabel')}</dt>
          <dd>{action.expectedOutput}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink-700">{t('successCriteriaLabel')}</dt>
          <dd>{action.successCriteria}</dd>
        </div>
      </dl>
      {action.dependencies.length > 0 && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-500">
          <ChevronRight size={12} /> {t('dependenciesLabel')}: {action.dependencies.join(', ')}
        </p>
      )}
      {action.uncertainty && (
        <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
          <CircleHelp size={12} className="mt-0.5 shrink-0" /> {action.uncertainty}
        </p>
      )}
    </li>
  )
}