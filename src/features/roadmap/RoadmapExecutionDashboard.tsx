'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  History,
  Lightbulb,
  Link2,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  SkipForward,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { useLocaleRouter } from '../../context/I18nContext'
import { useCopy } from '../../hooks/useCopy'
import type { AppKey } from '../../lib/i18n'
import { loadActiveRoadmap, performRoadmapStepAction, updateRoadmapObjective } from './api'
import {
  AdjustRoadmapModal,
  LearningLogPanel,
  ReviewProgressModal,
  VersionHistoryDrawer,
} from './RoadmapAdaptationPanels'
import type {
  GeneratedAction,
  GeneratedMilestone,
  GeneratedPrimaryObjective,
  RoadmapLoad,
  RoadmapStepRecord,
} from './types'
import {
  computeProgress,
  isContentActionKind,
  isDirectorActionKind,
  isReviewDue,
  resolveExecutionState,
  selectNextBestAction,
  type ExecutionState,
} from './progress'

interface RoadmapExecutionDashboardProps {
  data: RoadmapLoad
  locale: string
  regenerating?: boolean
  regenerateDisabled?: boolean
  regenerateNotice?: string | null
  onBackToDiscovery: () => void
  onRegenerate: () => void
  onUpdated: (roadmap: RoadmapLoad['roadmap'], activeVersion: RoadmapLoad['activeVersion']) => void
}

const STATE_BADGE: Record<ExecutionState, string> = {
  not_started: 'bg-ink-100 text-ink-600',
  in_progress: 'bg-sky-50 text-sky-700',
  waiting_for_owner: 'bg-amber-50 text-amber-800',
  waiting_for_director: 'bg-primary-50 text-primary-700',
  blocked: 'bg-red-50 text-red-700',
  completed: 'bg-emerald-50 text-emerald-700',
  skipped: 'bg-slate-100 text-slate-600',
}

function stateLabel(state: ExecutionState, t: (key: AppKey, values?: Record<string, string | number>) => string): string {
  return t(`execState_${state}` as AppKey)
}

function formatReviewDate(value: string | null, locale: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function RoadmapExecutionDashboard({
  data,
  locale,
  regenerating = false,
  regenerateDisabled = false,
  regenerateNotice = null,
  onBackToDiscovery,
  onRegenerate,
  onUpdated,
}: RoadmapExecutionDashboardProps) {
  const { t } = useCopy()
  const router = useLocaleRouter()
  const [view, setView] = useState<RoadmapLoad>(data)
  const [editing, setEditing] = useState(false)
  const [draftObjective, setDraftObjective] = useState<GeneratedPrimaryObjective | null>(null)
  const [savingObjective, setSavingObjective] = useState(false)
  const [error, setError] = useState('')
  const [busyStep, setBusyStep] = useState<string | null>(null)
  const [completionFor, setCompletionFor] = useState<string | null>(null)
  const [resultNote, setResultNote] = useState('')
  const [linkFor, setLinkFor] = useState<string | null>(null)
  const [linkDeliverableId, setLinkDeliverableId] = useState('')
  const [linkPostId, setLinkPostId] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    setView(data)
  }, [data])

  const { roadmap, activeVersion, steps, staleDependencies, linkedDeliverables, linkedPosts, versions, checkins, pendingRevision, learningLog } = view
  const plan = activeVersion?.summary ?? null

  const progress = useMemo(() => computeProgress(steps), [steps])
  const nextBest = useMemo(() => selectNextBestAction(steps), [steps])
  const reviewDue = useMemo(() => isReviewDue(roadmap?.next_review_at ?? null), [roadmap?.next_review_at])

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

  const reload = async () => {
    try {
      const fresh = await loadActiveRoadmap()
      if (fresh.roadmap) {
        setView(fresh)
        onUpdated(fresh.roadmap, fresh.activeVersion)
      }
    } catch {
      // Non-fatal: keep the current view; the next action will retry.
    }
  }

  const runAction = async (step: RoadmapStepRecord, action: Parameters<typeof performRoadmapStepAction>[1], payload: Record<string, unknown> = {}) => {
    if (busyStep) return
    setBusyStep(step.id)
    setError('')
    try {
      const result = await performRoadmapStepAction(step.id, action, crypto.randomUUID(), payload)
      if (action === 'run') {
        const href = result.employeeHref
          ? `${result.employeeHref}&autorun=1`
          : result.conversationId
            ? `/employee?conversationId=${result.conversationId}&autorun=1`
            : null
        if (href) {
          router.push(href)
          return
        }
      }
      setCompletionFor(null)
      setLinkFor(null)
      await reload()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('stepActionFailed'))
    } finally {
      setBusyStep(null)
    }
  }

  const openThread = (conversationId: string) => {
    router.push(`/employee?conversationId=${conversationId}`)
  }

  const beginEdit = () => {
    setDraftObjective({ ...plan.primaryObjective })
    setEditing(true)
    setError('')
  }

  const saveObjective = async () => {
    if (!draftObjective) return
    setSavingObjective(true)
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
      setSavingObjective(false)
    }
  }

  const objective = plan.primaryObjective
  const nextReview = formatReviewDate(roadmap.next_review_at, locale)

  const renderStepActions = (step: RoadmapStepRecord) => {
    const state = resolveExecutionState(step)
    const isDirector = isDirectorActionKind(step.action_kind)
    const isContent = isContentActionKind(step.action_kind)
    const busy = busyStep === step.id
    return (
      <div className="mt-3 space-y-2">
        {isDirector && state !== 'completed' && state !== 'skipped' && (
          <div className="flex flex-wrap items-center gap-2">
            {step.conversation_id && state === 'waiting_for_director' ? (
              <button type="button" onClick={() => openThread(step.conversation_id as string)} className="btn-primary min-h-8 px-3 py-1 text-xs">
                <Sparkles size={13} /> {t('openDirectorThread')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void runAction(step, 'run')}
                disabled={busy}
                className="btn-primary min-h-8 px-3 py-1 text-xs"
              >
                {busy ? <Spinner size={13} /> : <Sparkles size={13} />}
                {t((isContent ? 'createContentWithDirector' : 'runWithDirector') as AppKey)}
              </button>
            )}
            {step.conversation_id && state !== 'waiting_for_director' && (
              <button type="button" onClick={() => openThread(step.conversation_id as string)} className="btn-secondary min-h-8 px-3 py-1 text-xs">
                {t('openDirectorThread')}
              </button>
            )}
          </div>
        )}

        {state !== 'completed' && state !== 'skipped' && (
          <div className="flex flex-wrap items-center gap-2">
            {state === 'not_started' && (
              <button type="button" onClick={() => void runAction(step, 'start')} disabled={busy} className="btn-secondary min-h-8 px-3 py-1 text-xs">
                <Play size={12} /> {t('startStep')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setCompletionFor(completionFor === step.id ? null : step.id)
                setResultNote('')
                setLinkFor(null)
              }}
              disabled={busy}
              className="btn-primary min-h-8 px-3 py-1 text-xs"
            >
              <CheckCircle2 size={13} /> {t('markComplete')}
            </button>
            <button
              type="button"
              onClick={() => {
                setLinkFor(linkFor === step.id ? null : step.id)
                setLinkDeliverableId('')
                setLinkPostId('')
                setCompletionFor(null)
              }}
              disabled={busy}
              className="btn-secondary min-h-8 px-3 py-1 text-xs"
            >
              <Link2 size={12} /> {t('linkOutput')}
            </button>
            <button type="button" onClick={() => void runAction(step, 'block')} disabled={busy} className="btn-secondary min-h-8 px-3 py-1 text-xs">
              <Ban size={12} /> {t('blockStep')}
            </button>
            <button type="button" onClick={() => void runAction(step, 'skip')} disabled={busy} className="btn-secondary min-h-8 px-3 py-1 text-xs">
              <SkipForward size={12} /> {t('skipStep')}
            </button>
          </div>
        )}

        {(state === 'completed' || state === 'skipped') && (
          <button type="button" onClick={() => void runAction(step, 'revisit')} disabled={busy} className="btn-secondary min-h-8 px-3 py-1 text-xs">
            <RotateCcw size={12} /> {t('reopenStep')}
          </button>
        )}

        {completionFor === step.id && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="text-[11px] font-medium text-emerald-800">{t('completionRuleNote')}</p>
            <label className="mt-2 block text-xs font-medium text-ink-700">
              {t('resultNoteLabel')}
              <textarea
                value={resultNote}
                onChange={(event) => setResultNote(event.target.value)}
                rows={2}
                placeholder={t('resultNotePlaceholder')}
                className="input-field mt-1 w-full"
              />
            </label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => void runAction(step, 'complete', resultNote.trim() ? { resultNote: resultNote.trim() } : {})}
                disabled={busy}
                className="btn-primary min-h-8 px-3 py-1 text-xs"
              >
                {busy ? <Spinner size={13} /> : <CheckCircle2 size={13} />} {t('confirmComplete')}
              </button>
              <button type="button" onClick={() => setCompletionFor(null)} disabled={busy} className="btn-secondary min-h-8 px-3 py-1 text-xs">
                <X size={12} /> {t('cancel')}
              </button>
            </div>
          </div>
        )}

        {linkFor === step.id && (
          <div className="rounded-xl border border-primary-200 bg-primary-50/60 p-3">
            <p className="text-[11px] font-medium text-primary-800">{t('completionRuleNote')}</p>
            <label className="mt-2 block text-xs font-medium text-ink-700">
              {t('linkDeliverableId')}
              <input value={linkDeliverableId} onChange={(event) => setLinkDeliverableId(event.target.value)} className="input-field mt-1 w-full" />
            </label>
            <label className="mt-2 block text-xs font-medium text-ink-700">
              {t('linkPostId')}
              <input value={linkPostId} onChange={(event) => setLinkPostId(event.target.value)} className="input-field mt-1 w-full" />
            </label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  void runAction(step, 'link_output', {
                    linkedDeliverableId: linkDeliverableId.trim() || undefined,
                    linkedPostId: linkPostId.trim() || undefined,
                  })
                }
                disabled={busy || (!linkDeliverableId.trim() && !linkPostId.trim())}
                className="btn-primary min-h-8 px-3 py-1 text-xs"
              >
                {busy ? <Spinner size={13} /> : <Link2 size={12} />} {t('linkOutput')}
              </button>
              <button type="button" onClick={() => setLinkFor(null)} disabled={busy} className="btn-secondary min-h-8 px-3 py-1 text-xs">
                <X size={12} /> {t('cancel')}
              </button>
            </div>
          </div>
        )}

        {(linkedDeliverables?.length || linkedPosts?.length) ? (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-600">
            {linkedDeliverables?.map((doc) => (
              <button key={doc.id} type="button" onClick={() => router.push(`/deliverables?document=${doc.id}`)} className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-2 py-0.5 hover:border-primary-300">
                <FileText size={11} /> {doc.title}
              </button>
            ))}
            {linkedPosts?.map((post) => (
              <button key={post.id} type="button" onClick={() => router.push('/scheduling')} className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-2 py-0.5 hover:border-primary-300">
                <Calendar size={11} /> {post.platform} · {post.status}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  const renderActionCard = (action: GeneratedAction, step: RoadmapStepRecord | undefined) => {
    const state = step ? resolveExecutionState(step) : 'not_started'
    return (
      <li key={action.key} className="rounded-xl border border-ink-100 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-ink-900">{action.title}</p>
          <span className={`badge ${STATE_BADGE[state]}`}>{stateLabel(state, t)}</span>
          {step && <span className="badge bg-ink-50 text-ink-500">{t(`actionKind_${action.actionKind}` as AppKey)}</span>}
        </div>
        <p className="mt-1 text-xs leading-5 text-ink-600">{action.description}</p>
        {step ? renderStepActions(step) : <p className="mt-2 text-[11px] text-ink-400">—</p>}
      </li>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start gap-3">
        <span className="brain-page-heading"><Sparkles size={22} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="workspace-heading">{t('roadmapGeneratedTitle')}</h1>
          <p className="workspace-description">{t('roadmapGeneratedSubtitle', { goal: roadmap.goal, version: roadmap.version })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setReviewOpen(true)} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
            <CheckCircle2 size={13} /> {t('reviewProgress')}
          </button>
          <button type="button" onClick={() => setAdjustOpen(true)} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
            <Pencil size={13} /> {t('adjustRoadmap')}
          </button>
          <button type="button" onClick={() => setHistoryOpen(true)} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
            <History size={13} /> {t('versionHistory')}
          </button>
          <button type="button" onClick={onBackToDiscovery} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
            <ArrowLeft size={13} /> {t('backToDiscovery')}
          </button>
          <button type="button" onClick={onRegenerate} disabled={regenerating || regenerateDisabled} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
            {regenerating ? <Spinner size={13} /> : <RefreshCw size={13} />} {t('regenerateRoadmap')}
          </button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {regenerateNotice && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{regenerateNotice}</p>}

      {staleDependencies.length > 0 && (
        <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={17} className="text-amber-800" />
            <h2 className="font-semibold text-amber-900">{t('brainChangedTitle')}</h2>
          </div>
          <p className="mt-1 text-sm text-amber-900">{t('brainChangedDesc', { count: staleDependencies.length })}</p>
        </section>
      )}

      {reviewDue.due && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary-200 bg-primary-50 p-4">
          <Clock size={18} className="text-primary-700" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-primary-900">{t('dueReviewTitle')}</h2>
            <p className="text-xs text-primary-800">
              {reviewDue.daysOverdue > 0 ? t('dueReviewOverdue', { days: reviewDue.daysOverdue }) : t('dueReviewToday')}
              {nextReview ? ` · ${t('nextReviewLabel', { date: nextReview })}` : ''}
            </p>
          </div>
          <button type="button" onClick={() => setReviewOpen(true)} className="btn-secondary min-h-8 px-3 py-1 text-xs">{t('reviewProgress')}</button>
        </section>
      )}

      {/* Overview: diagnosis + objective + deterministic progress */}
      <section className="card p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-ink-50 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-500"><Lightbulb size={12} /> {t('perceivedProblem')}</p>
            <p className="mt-1 text-sm leading-6 text-ink-800">{plan.diagnosis.perceivedProblem}</p>
            <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-primary-700">{t('rootDiagnosis')}</p>
            <p className="mt-1 text-sm leading-6 text-ink-800">{plan.diagnosis.rootDiagnosis}</p>
          </div>
          <div className="rounded-xl bg-primary-50 p-3">
            <div className="flex items-center gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-primary-700"><Target size={12} /> {t('primaryObjectiveTitle')}</p>
              {!editing && (
                <button type="button" onClick={beginEdit} className="btn-secondary ms-auto min-h-7 px-2 py-0.5 text-[11px]">
                  <Pencil size={11} /> {t('editObjective')}
                </button>
              )}
            </div>
            {editing && draftObjective ? (
              <div className="mt-2 space-y-2">
                <input value={draftObjective.title} onChange={(e) => setDraftObjective({ ...draftObjective, title: e.target.value })} className="input-field w-full" />
                <textarea value={draftObjective.outcome} onChange={(e) => setDraftObjective({ ...draftObjective, outcome: e.target.value })} rows={2} className="input-field w-full" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => void saveObjective()} disabled={savingObjective} className="btn-primary min-h-8 px-3 py-1 text-xs">
                    {savingObjective ? <Spinner size={13} /> : <Save size={12} />} {t('saveObjective')}
                  </button>
                  <button type="button" onClick={() => { setEditing(false); setDraftObjective(null) }} disabled={savingObjective} className="btn-secondary min-h-8 px-3 py-1 text-xs">
                    <X size={12} /> {t('cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-base font-semibold text-ink-900">{objective.title}</p>
                <p className="mt-1 text-sm leading-6 text-ink-700">{objective.outcome}</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-ink-600">
            <span className="font-medium">{t('progressLabel')}</span>
            <span>{t('progressSummary', { completed: progress.completedCount, total: progress.activeTotal, percent: progress.percent })}</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      </section>

      {/* Next best action */}
      <section className="rounded-2xl border border-primary-200 bg-primary-50/70 p-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary-700" />
          <h2 className="text-sm font-semibold text-primary-900">{t('nextBestActionTitle')}</h2>
        </div>
        {nextBest ? (
          <div className="mt-2 flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-900">{nextBest.step.title}</p>
              <p className="text-[11px] text-ink-600">{nextBest.reason}</p>
            </div>
            <div>{renderStepActions(nextBest.step)}</div>
          </div>
        ) : (
          <p className="mt-1 text-sm text-ink-600">{t('nextBestActionEmpty')}</p>
        )}
      </section>

      {/* Milestones & actions */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t('milestonesTitle')}</h2>
        {plan.milestones.map((milestone: GeneratedMilestone, milestoneIndex: number) => {
          const milestoneSteps = steps.filter((step) => step.milestone_key === milestone.key)
          return (
            <div key={milestone.key} className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-xs font-semibold text-white">{milestoneIndex + 1}</span>
                <h3 className="text-sm font-semibold text-ink-900">{milestone.title}</h3>
                {milestone.sequenceLabel && <span className="badge bg-ink-100 text-ink-600">{milestone.sequenceLabel}</span>}
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-600">{milestone.description}</p>
              <ul className="mt-3 space-y-3">
                {milestone.actions.map((action) => renderActionCard(action, milestoneSteps.find((step) => step.step_key === action.key)))}
              </ul>
            </div>
          )
          })}
      </section>

      {/* Business learning log (Roadmap-scoped, separate from Business Brain) */}
      <LearningLogPanel
        roadmapId={roadmap.id}
        locale={locale}
        steps={steps}
        entries={learningLog ?? []}
        onChanged={() => void reload()}
      />

      {reviewOpen && (
        <ReviewProgressModal
          roadmapId={roadmap.id}
          locale={locale}
          checkins={checkins ?? []}
          onClose={() => setReviewOpen(false)}
          onSaved={() => void reload()}
        />
      )}

      {adjustOpen && (
        <AdjustRoadmapModal
          roadmap={roadmap}
          locale={locale}
          pendingRevision={pendingRevision ?? null}
          onClose={() => setAdjustOpen(false)}
          onApplied={(fresh) => {
            setView(fresh)
            onUpdated(fresh.roadmap, fresh.activeVersion)
            setAdjustOpen(false)
          }}
          onRejected={() => void reload()}
        />
      )}

      {historyOpen && (
        <VersionHistoryDrawer
          versions={versions ?? []}
          locale={locale}
          activeVersionId={activeVersion?.id ?? null}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  )
}