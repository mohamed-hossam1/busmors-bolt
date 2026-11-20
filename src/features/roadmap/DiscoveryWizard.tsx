'use client'

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Route,
  Save,
  Sparkles,
} from 'lucide-react'
import { RoadmapSkeleton } from '../../components/skeletons'
import { useAuth } from '../../context/AuthContext'
import type { AnswerStatus } from '../../lib/contracts'
import type { BrainNode } from '../../lib/types'
import {
  DISCOVERY_GOALS,
  answerLabel,
  buildDiscoveryPlan,
  goalDefinition,
  isOpenStatus,
  isPositiveStatus,
} from './discovery'
import {
  loadDiscovery,
  loadDiscoveryFacts,
  loadDiscoveryQuestion,
  planDiscoveryDraft,
  saveDiscoveryAnswer,
  saveDiscoveryDraft,
  syncDiscoveryQuestions,
} from './api'
import type {
  DiscoveryAnswerValue,
  DiscoveryDraft,
  DiscoveryGoal,
  DiscoveryQuestion,
  DiscoveryQuestionOption,
} from './types'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface LocalAnswer {
  status: AnswerStatus
  value: DiscoveryAnswerValue | null
  provenance: Record<string, unknown>
}

function rpcCode(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '')
  }
  return ''
}

function statusLabel(status: AnswerStatus): string {
  if (status === 'answered') return 'Answered'
  if (status === 'confirmed') return 'Confirmed'
  if (status === 'unknown') return 'Unknown'
  if (status === 'skipped') return 'Skipped'
  if (status === 'not_applicable') return 'Not applicable'
  if (status === 'researching') return 'Researching'
  return 'Not answered'
}

function statusStyle(status: AnswerStatus): string {
  if (status === 'answered') return 'bg-primary-50 text-primary-700'
  if (status === 'confirmed') return 'bg-emerald-50 text-emerald-700'
  if (status === 'unknown') return 'bg-amber-50 text-amber-800'
  if (status === 'skipped') return 'bg-slate-100 text-slate-700'
  if (status === 'not_applicable') return 'bg-ink-100 text-ink-700'
  if (status === 'researching') return 'bg-sky-50 text-sky-700'
  return 'bg-ink-100 text-ink-600'
}

function isSavableAnswer(answer: LocalAnswer): boolean {
  if (answer.status === 'answered' || answer.status === 'confirmed') {
    if (answer.value?.text?.trim()) return true
    if (answer.value?.choice === '__other__') return false
    return Boolean(answer.value?.choice)
  }
  return true
}

function answerFor(question: DiscoveryQuestion, local: Record<string, LocalAnswer>): LocalAnswer {
  return local[question.id] ?? {
    status: question.status,
    value: question.value,
    provenance: question.provenance ?? {},
  }
}

interface QuestionCardProps {
  question: DiscoveryQuestion
  index: number
  total: number
  answer: LocalAnswer
  showOther: boolean
  editingReuse: boolean
  conflict: string | null
  onChoose: (question: DiscoveryQuestion, value: string) => void
  onOther: (question: DiscoveryQuestion, text: string) => void
  onText: (question: DiscoveryQuestion, text: string) => void
  onStatus: (question: DiscoveryQuestion, status: AnswerStatus) => void
  onEditReuse: (question: DiscoveryQuestion) => void
  onSave: (question: DiscoveryQuestion) => void
  onLoadLatest: (question: DiscoveryQuestion) => void
  onSaveMine: (question: DiscoveryQuestion) => void
}

function QuestionCard({
  question,
  index,
  total,
  answer,
  showOther,
  editingReuse,
  conflict,
  onChoose,
  onOther,
  onText,
  onStatus,
  onEditReuse,
  onSave,
  onLoadLatest,
  onSaveMine,
}: QuestionCardProps) {
  const schema = question.schema
  const positive = isPositiveStatus(answer.status)
  const blocked = ['unknown', 'skipped', 'not_applicable', 'researching'].includes(answer.status)
  const reused = positive
    && answer.provenance?.kind === 'brain'
    && schema.reuse
    && !editingReuse
  const selectedOther = showOther || answer.value?.choice === '__other__'
  const textValue = answer.value?.text ?? ''
  const selectedChoice = answer.value?.choice

  return (
    <article className={`card p-5 transition sm:p-6 ${index === 0 ? 'border-primary-200' : ''}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="badge bg-ink-100 text-ink-700">Question {index + 1} of {total}</span>
        <span className={`badge ${statusStyle(answer.status)}`}>{statusLabel(answer.status)}</span>
        {reused && <span className="badge bg-emerald-50 text-emerald-700"><CheckCircle2 size={12} /> Already known</span>}
      </div>

      <h3 className="text-base font-semibold leading-snug text-ink-900">{schema.label}</h3>
      <p className="mt-2 text-sm leading-6 text-ink-600">{schema.why}</p>

      {blocked && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle size={16} /> {statusLabel(answer.status)}</p>
          <p className="mt-1 text-xs leading-5">
            {answer.status === 'researching'
              ? 'A linked research answer can return to this exact question later. Nothing has been treated as answered yet.'
              : 'This is stored as an explicit non-answer. It will not be reused as a positive fact in the plan.'}
          </p>
          {answer.status !== 'researching' && (
            <button type="button" onClick={() => onStatus(question, 'unanswered')} className="mt-3 text-xs font-semibold underline">
              Answer instead
            </button>
          )}
        </div>
      )}

      {reused && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-700" />
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Already known from your Brain</p>
            <span className="badge bg-white/70 text-emerald-800">v{schema.reuse?.version}</span>
          </div>
          <p className="mt-2 text-sm font-medium text-ink-900">{answerLabel(answer.value, schema) || 'Saved answer'}</p>
          <p className="mt-1 text-xs leading-5 text-emerald-900">
            Source: {schema.reuse?.title} · {schema.reuse?.verificationState ?? 'owner reported'}. Edit it if this goal needs a different answer.
          </p>
          <button type="button" onClick={() => onEditReuse(question)} className="mt-3 text-xs font-semibold text-emerald-900 underline">
            Edit this answer
          </button>
        </div>
      )}

      {!blocked && !reused && schema.type === 'choice' && (
        <div className="mt-4 space-y-2" role="radiogroup" aria-label={schema.label}>
          {(schema.options ?? []).map((option: DiscoveryQuestionOption) => {
            const selected = option.value === '__other__' ? selectedOther : selectedChoice === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChoose(question, option.value)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                  selected
                    ? 'border-primary-400 bg-primary-50 text-primary-900'
                    : 'border-ink-200 bg-white hover:border-primary-300'
                }`}
              >
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-primary-500 bg-primary-500 text-white' : 'border-ink-300 bg-white'}`}>
                  {selected && <Check size={12} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {option.label}
                    {option.source === 'brain' && <span className="badge bg-emerald-50 text-emerald-700">From your Brain</span>}
                  </span>
                  {option.detail && <span className="mt-0.5 block text-xs leading-5 text-ink-600">{option.detail}</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {!blocked && !reused && selectedOther && (
        <label className="mt-3 block text-xs font-medium text-ink-700">
          Your answer
          <input
            type="text"
            value={textValue}
            maxLength={300}
            onChange={(event) => onOther(question, event.target.value)}
            placeholder="Type a short answer"
            className="input-field mt-1"
          />
        </label>
      )}

      {!blocked && !reused && (schema.type === 'text' || schema.type === 'long_text') && (
        <label className="mt-4 block text-xs font-medium text-ink-700">
          Your answer
          {schema.type === 'long_text' ? (
            <textarea
              value={textValue}
              maxLength={2000}
              onChange={(event) => onText(question, event.target.value)}
              placeholder={schema.placeholder}
              className="input-field mt-1 min-h-28 resize-y"
            />
          ) : (
            <input
              type="text"
              value={textValue}
              maxLength={300}
              onChange={(event) => onText(question, event.target.value)}
              placeholder={schema.placeholder}
              className="input-field mt-1"
            />
          )}
        </label>
      )}

      {!blocked && !reused && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onSave(question)} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
            <Save size={13} /> Save answer
          </button>
          <span className="text-[11px] text-ink-500">Autosaves while you type.</span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
        <button
          type="button"
          aria-pressed={answer.status === 'unknown'}
          onClick={() => onStatus(question, 'unknown')}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${answer.status === 'unknown' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-ink-200 text-ink-600 hover:border-amber-300'}`}
        >
          Not sure
        </button>
        <button
          type="button"
          aria-pressed={answer.status === 'skipped'}
          onClick={() => onStatus(question, 'skipped')}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${answer.status === 'skipped' ? 'border-slate-400 bg-slate-100 text-slate-800' : 'border-ink-200 text-ink-600 hover:border-slate-300'}`}
        >
          Skip for now
        </button>
        <button
          type="button"
          aria-pressed={answer.status === 'not_applicable'}
          onClick={() => onStatus(question, 'not_applicable')}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${answer.status === 'not_applicable' ? 'border-ink-400 bg-ink-100 text-ink-800' : 'border-ink-200 text-ink-600 hover:border-ink-300'}`}
        >
          Not applicable
        </button>
        {positive && (
          <button type="button" onClick={() => onStatus(question, 'unanswered')} className="rounded-full border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:border-red-300 hover:text-red-700">
            Clear answer
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-5 text-ink-500">Unknown, skipped and not applicable stay separate. None becomes a positive fact in the plan.</p>

      {conflict && (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">This answer changed elsewhere</p>
          <p className="mt-1 text-xs leading-5">{conflict}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => onLoadLatest(question)} className="btn-secondary min-h-8 px-3 py-1 text-xs">Load latest</button>
            <button type="button" onClick={() => onSaveMine(question)} className="btn-secondary min-h-8 px-3 py-1 text-xs">Save mine over it</button>
          </div>
        </div>
      )}
    </article>
  )
}

export default function DiscoveryWizard() {
  const { settings } = useAuth()
  const hasWebsite = Boolean(settings?.company_url?.trim())

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState<DiscoveryDraft | null>(null)
  const [questions, setQuestions] = useState<DiscoveryQuestion[]>([])
  const [facts, setFacts] = useState<BrainNode[]>([])
  const [goalPicker, setGoalPicker] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState('')
  const [draftConflict, setDraftConflict] = useState('')
  const [conflict, setConflict] = useState<{ questionId: string; message: string } | null>(null)
  const [local, setLocal] = useState<Record<string, LocalAnswer>>({})
  const [editingReuse, setEditingReuse] = useState<Record<string, boolean>>({})
  const [otherMode, setOtherMode] = useState<Record<string, boolean>>({})
  const [showEarlier, setShowEarlier] = useState(false)
  const [preliminary, setPreliminary] = useState(false)
  const [planning, setPlanning] = useState(false)

  const questionsRef = useRef<DiscoveryQuestion[]>([])
  const draftRef = useRef<DiscoveryDraft | null>(null)
  const factsRef = useRef<BrainNode[]>([])
  const localRef = useRef<Record<string, LocalAnswer>>({})
  const pendingRef = useRef<Record<string, LocalAnswer>>({})
  const inFlightRef = useRef<Record<string, boolean>>({})
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const applyQuestions = useCallback((next: DiscoveryQuestion[]) => {
    questionsRef.current = next
    setQuestions(next)
  }, [])

  const applyLocal = useCallback((next: Record<string, LocalAnswer>) => {
    localRef.current = next
    setLocal(next)
  }, [])

  const removeLocal = useCallback((questionId: string) => {
    const next = { ...localRef.current }
    delete next[questionId]
    applyLocal(next)
  }, [applyLocal])

  const replaceQuestion = useCallback((saved: DiscoveryQuestion) => {
    applyQuestions(questionsRef.current.map((question) => question.id === saved.id ? saved : question))
  }, [applyQuestions])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    setDraftConflict('')
    try {
      const [loaded, brainFacts] = await Promise.all([loadDiscovery(), loadDiscoveryFacts()])
      factsRef.current = brainFacts
      setFacts(brainFacts)
      if (!loaded.draft) {
        draftRef.current = null
        setDraft(null)
        applyQuestions([])
        setGoalPicker(true)
        setLoading(false)
        return
      }

      let nextDraft = loaded.draft
      let nextQuestions = loaded.questions
      const definition = goalDefinition(loaded.draft.goal)
      if (!definition) {
        setDraft(loaded.draft)
        draftRef.current = loaded.draft
        applyQuestions(loaded.questions)
        setGoalPicker(true)
        setLoading(false)
        return
      }

      const plan = buildDiscoveryPlan({ goal: loaded.draft.goal, hasWebsite, facts: brainFacts })
      const active = loaded.questions.filter((question) => question.active).sort((a, b) => a.position - b.position)
      const samePlan = active.length === plan.length && plan.every((item, index) =>
        active[index]?.question_key === item.question_key
        && JSON.stringify(active[index]?.schema) === JSON.stringify(item.schema)
      )
      if (!samePlan) {
        const synced = await syncDiscoveryQuestions(nextDraft.id, nextDraft.version, plan)
        if (synced.draft) nextDraft = synced.draft
        nextQuestions = synced.questions
      }

      draftRef.current = nextDraft
      setDraft(nextDraft)
      applyQuestions(nextQuestions)
      setPreliminary(nextDraft.status === 'planned')
      setGoalPicker(false)
      applyLocal({})
    } catch (error) {
      setLoadError(rpcCode(error) === 'STALE_VERSION'
        ? 'This Discovery changed while it was loading. Reload to use the latest saved version.'
        : 'Your saved Discovery could not be loaded. Nothing was overwritten; retry when the connection is available.')
    } finally {
      setLoading(false)
    }
  }, [applyLocal, applyQuestions, hasWebsite])

  useEffect(() => {
    void load()
  }, [load])

  const selectGoal = async (goal: DiscoveryGoal) => {
    if (busy) return
    setBusy(true)
    setLoadError('')
    setDraftConflict('')
    setSaveError('')
    setNotice('')
    try {
      const existing = draftRef.current
      const saved = await saveDiscoveryDraft(goal, existing?.version ?? 0)
      const plan = buildDiscoveryPlan({ goal, hasWebsite, facts: factsRef.current })
      const synced = await syncDiscoveryQuestions(saved.id, saved.version, plan)
      if (!synced.draft) throw new Error('The saved Discovery draft was not returned.')
      const preserved = synced.questions.filter((question) => !question.active && isPositiveStatus(question.status)).length
      const changedGoal = Boolean(existing && existing.goal !== goal)
      draftRef.current = synced.draft
      setDraft(synced.draft)
      applyQuestions(synced.questions)
      applyLocal({})
      setEditingReuse({})
      setOtherMode({})
      setConflict(null)
      setSaveState('idle')
      setPreliminary(false)
      setGoalPicker(false)
      setNotice(changedGoal
        ? `Goal updated.${preserved ? ` ${preserved} earlier answer${preserved === 1 ? ' is' : 's are'} kept under Saved earlier answers.` : ''} Questions now match the new goal.`
        : 'Discovery started. Answers save as you go.')
    } catch (error) {
      if (rpcCode(error) === 'STALE_VERSION') {
        setDraftConflict('This Discovery changed in another tab. Reload the saved draft before changing the goal.')
      } else {
        setLoadError('The goal could not be saved. Your earlier answers are unchanged; retry.')
      }
    } finally {
      setBusy(false)
    }
  }

  const flushAnswer = useCallback(async function run(questionId: string) {
    if (inFlightRef.current[questionId]) return
    const answer = pendingRef.current[questionId]
    if (!answer) return
    const question = questionsRef.current.find((row) => row.id === questionId)
    if (!question || !isSavableAnswer(answer)) {
      delete pendingRef.current[questionId]
      return
    }
    delete pendingRef.current[questionId]
    inFlightRef.current[questionId] = true
    setSaveState('saving')
    setSaveError('')
    let rerun = false
    try {
      const saved = await saveDiscoveryAnswer(question.id, question.version, answer.status, answer.value, answer.provenance)
      if (pendingRef.current[questionId]) {
        rerun = true
      } else {
        const nextLocal = { ...localRef.current }
        delete nextLocal[questionId]
        applyLocal(nextLocal)
      }
      replaceQuestion(saved)
      setConflict((current) => current?.questionId === questionId ? null : current)
      if (rerun) setSaveState('saving')
      else setSaveState('saved')
    } catch (error) {
      const code = rpcCode(error)
      if (code === 'STALE_VERSION') {
        setConflict({
          questionId,
          message: 'This question was saved from another tab. Your answer is still here. Load the latest version to compare, or save yours over it explicitly.',
        })
        setSaveError('This answer changed elsewhere. Nothing was overwritten.')
      } else if (code === 'INACTIVE_QUESTION') {
        setSaveError('This question is no longer part of the current goal. Its saved answer was kept with the earlier goal.')
      } else {
        setSaveError('This answer could not be saved. It is still in the editor; try again when the connection is available.')
      }
      setSaveState('error')
    } finally {
      inFlightRef.current[questionId] = false
      if (rerun) void run(questionId)
    }
  }, [applyLocal, replaceQuestion])

  const queueAnswer = useCallback((question: DiscoveryQuestion, answer: LocalAnswer, delay = 0) => {
    const existingTimer = timersRef.current[question.id]
    if (existingTimer) {
      clearTimeout(existingTimer)
      delete timersRef.current[question.id]
    }
    applyLocal({ ...localRef.current, [question.id]: answer })
    pendingRef.current[question.id] = answer
    setSaveState('saving')
    if (delay > 0) {
      timersRef.current[question.id] = setTimeout(() => {
        delete timersRef.current[question.id]
        void flushAnswer(question.id)
      }, delay)
    } else {
      void flushAnswer(question.id)
    }
  }, [applyLocal, flushAnswer])

  const clearQueued = useCallback((questionId: string) => {
    const timer = timersRef.current[questionId]
    if (timer) {
      clearTimeout(timer)
      delete timersRef.current[questionId]
    }
    delete pendingRef.current[questionId]
  }, [])

  const choose = (question: DiscoveryQuestion, value: string) => {
    setEditingReuse((previous) => ({ ...previous, [question.id]: false }))
    if (value === '__other__') {
      clearQueued(question.id)
      setOtherMode((previous) => ({ ...previous, [question.id]: true }))
      applyLocal({
        ...localRef.current,
        [question.id]: { status: 'unanswered', value: null, provenance: { kind: 'owner' } },
      })
      return
    }
    setOtherMode((previous) => ({ ...previous, [question.id]: false }))
    queueAnswer(question, { status: 'answered', value: { choice: value }, provenance: { kind: 'owner' } })
  }

  const changeOther = (question: DiscoveryQuestion, text: string) => {
    setOtherMode((previous) => ({ ...previous, [question.id]: true }))
    setEditingReuse((previous) => ({ ...previous, [question.id]: false }))
    if (!text.trim()) {
      clearQueued(question.id)
      applyLocal({
        ...localRef.current,
        [question.id]: { status: 'unanswered', value: null, provenance: { kind: 'owner' } },
      })
      return
    }
    queueAnswer(question, {
      status: 'answered',
      value: { choice: '__other__', text },
      provenance: { kind: 'owner' },
    }, 700)
  }

  const changeText = (question: DiscoveryQuestion, text: string) => {
    setEditingReuse((previous) => ({ ...previous, [question.id]: false }))
    setOtherMode((previous) => ({ ...previous, [question.id]: false }))
    if (!text.trim()) {
      queueAnswer(question, { status: 'unanswered', value: null, provenance: { kind: 'owner' } }, 700)
      return
    }
    queueAnswer(question, { status: 'answered', value: { text }, provenance: { kind: 'owner' } }, 700)
  }

  const setStatus = (question: DiscoveryQuestion, status: AnswerStatus) => {
    setEditingReuse((previous) => ({ ...previous, [question.id]: false }))
    setOtherMode((previous) => ({ ...previous, [question.id]: false }))
    queueAnswer(question, { status, value: null, provenance: { kind: 'owner', statusSet: true } })
  }

  const editReuse = (question: DiscoveryQuestion) => {
    setEditingReuse((previous) => ({ ...previous, [question.id]: true }))
  }

  const saveQuestion = (question: DiscoveryQuestion) => {
    const answer = localRef.current[question.id]
    if (!answer) return
    queueAnswer(question, answer)
  }

  const saveAll = async () => {
    setSaveError('')
    const ids = new Set([...Object.keys(localRef.current), ...Object.keys(pendingRef.current)])
    for (const questionId of ids) {
      const answer = localRef.current[questionId] ?? pendingRef.current[questionId]
      if (answer && isSavableAnswer(answer)) pendingRef.current[questionId] = answer
    }
    await Promise.all(Object.keys(pendingRef.current).map((questionId) => flushAnswer(questionId)))
  }

  const loadLatest = async (question: DiscoveryQuestion) => {
    try {
      const latest = await loadDiscoveryQuestion(question.id)
      replaceQuestion(latest)
      removeLocal(question.id)
      setConflict(null)
      setSaveError('')
      setSaveState('saved')
    } catch {
      setSaveError('The latest saved version could not be loaded. Your answer is still here; retry.')
    }
  }

  const saveMine = async (question: DiscoveryQuestion) => {
    const answer = localRef.current[question.id]
    if (!answer) return
    setSaveState('saving')
    setSaveError('')
    try {
      const latest = await loadDiscoveryQuestion(question.id)
      const saved = await saveDiscoveryAnswer(latest.id, latest.version, answer.status, answer.value, answer.provenance)
      replaceQuestion(saved)
      removeLocal(question.id)
      setConflict(null)
      setSaveState('saved')
    } catch {
      setSaveError('Your answer could not be saved over the newer version. Nothing was overwritten; retry.')
      setSaveState('error')
    }
  }

  const continuePreliminary = async () => {
    if (!draftRef.current || planning) return
    setPlanning(true)
    setSaveError('')
    setDraftConflict('')
    try {
      await saveAll()
      if (Object.keys(localRef.current).length > 0) {
        setSaveError('Some answers are still unsaved. Save them before continuing with a preliminary plan.')
        return
      }
      const openKeys = questionsRef.current
        .filter((question) => question.active && isOpenStatus(question.status))
        .map((question) => question.question_key)
      const saved = await planDiscoveryDraft(draftRef.current.id, draftRef.current.version, openKeys)
      draftRef.current = saved
      setDraft(saved)
      setPreliminary(true)
      setNotice('Preliminary plan state saved. No Roadmap was generated or activated; open unknowns are recorded for the next step.')
    } catch (error) {
      if (rpcCode(error) === 'STALE_VERSION') {
        setDraftConflict('This Discovery changed in another tab. Reload the saved draft before continuing.')
      } else {
        setSaveError('The preliminary plan state could not be saved. Your answers are unchanged; retry.')
      }
    } finally {
      setPlanning(false)
    }
  }

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (Object.keys(localRef.current).length > 0) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const flushPending = () => {
      for (const questionId of Object.keys(pendingRef.current)) void flushAnswer(questionId)
    }
    window.addEventListener('beforeunload', warn)
    window.addEventListener('pagehide', flushPending)
    return () => {
      window.removeEventListener('beforeunload', warn)
      window.removeEventListener('pagehide', flushPending)
      for (const timer of Object.values(timersRef.current)) clearTimeout(timer)
    }
  }, [flushAnswer])

  const activeQuestions = useMemo(
    () => questions.filter((question) => question.active).sort((a, b) => a.position - b.position),
    [questions]
  )
  const earlierQuestions = useMemo(
    () => questions.filter((question) => !question.active && (isPositiveStatus(question.status) || ['unknown', 'skipped', 'not_applicable', 'researching'].includes(question.status))),
    [questions]
  )
  const positiveCount = activeQuestions.filter((question) => isPositiveStatus(answerFor(question, local).status)).length
  const openQuestions = activeQuestions.filter((question) => isOpenStatus(answerFor(question, local).status))
  const usedBrainIds = new Set(activeQuestions.map((question) => question.schema.reuse?.nodeId).filter(Boolean))
  const visibleFacts = facts.slice(0, 6)
  const localCount = Object.keys(local).length

  if (loading) return <RoadmapSkeleton />
  if (loadError && !draft) {
    return (
      <div className="card mx-auto max-w-xl p-6">
        <h1 className="text-lg font-semibold">Discovery could not be loaded</h1>
        <p role="alert" className="mt-2 text-sm text-red-700">{loadError}</p>
        <button type="button" onClick={() => void load()} className="btn-primary mt-4"><RefreshCw size={15} /> Retry</button>
      </div>
    )
  }

  const goal = draft ? goalDefinition(draft.goal) : undefined
  const saveLabel = saveState === 'saving'
    ? 'Saving…'
    : saveState === 'error'
      ? 'Save failed'
      : localCount > 0
        ? 'Unsaved changes'
        : saveState === 'saved'
          ? 'All answers saved'
          : 'Saved'

  if (!draft || goalPicker) {
    return (
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-center gap-3">
          <span className="brain-page-heading"><Route size={22} /></span>
          <div>
            <h1 className="workspace-heading">Roadmap</h1>
            <p className="workspace-description">Start with the outcome. Discovery adapts, saves, and reuses what your Brain already knows.</p>
          </div>
        </header>

        {loadError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{loadError}</p>}
        {notice && <p role="status" className="mb-4 rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{notice}</p>}
        {draftConflict && (
          <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>{draftConflict}</p>
            <button type="button" onClick={() => void load()} className="mt-3 underline">Reload saved draft</button>
          </div>
        )}

        <div className="mb-5 rounded-xl border border-primary-100 bg-primary-50/60 p-4 text-sm text-primary-900">
          <p className="flex items-center gap-2 font-medium"><Sparkles size={16} /> {hasWebsite ? 'Your Brain is available as context.' : 'No website needed.'}</p>
          <p className="mt-1 text-xs leading-5">
            {hasWebsite
              ? 'Approved facts can prefill an answer, and you can always edit them.'
              : 'Answer with what you know. The plan will use a real contact route instead of assuming a website.'}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {DISCOVERY_GOALS.map((item) => (
            <button
              key={item.value}
              type="button"
              disabled={busy}
              onClick={() => void selectGoal(item.value)}
              className="card flex items-start gap-4 p-5 text-left transition hover:border-primary-400 disabled:opacity-60"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Route size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink-900">{item.label}</span>
                <span className="mt-1 block text-sm leading-6 text-ink-600">{item.description}</span>
              </span>
              <ChevronRight size={17} className="mt-1 shrink-0 text-ink-400" />
            </button>
          ))}
        </div>

        {busy && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-ink-600"><Loader2 size={15} className="animate-spin" /> Saving your goal…</p>}
        {draft && goalPicker && (
          <button type="button" onClick={() => setGoalPicker(false)} className="btn-secondary mt-5">Back to the current goal</button>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-start gap-3">
        <span className="brain-page-heading"><Route size={22} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="workspace-heading">Discovery</h1>
          <p className="workspace-description">
            Goal: <span className="font-medium text-ink-900">{goal?.label ?? draft.goal}</span> · draft v{draft.version}
          </p>
        </div>
        <button type="button" onClick={() => setGoalPicker(true)} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">Change goal</button>
      </header>

      <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-white/95 p-3 backdrop-blur">
        <span role="status" className={`badge ${saveState === 'error' ? 'bg-red-50 text-red-700' : saveState === 'saving' ? 'bg-primary-50 text-primary-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {saveState === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} {saveLabel}
        </span>
        <span className="text-xs text-ink-500">{positiveCount} of {activeQuestions.length} answered</span>
        <button type="button" onClick={() => void saveAll()} disabled={saveState === 'saving'} className="btn-primary ms-auto min-h-9 px-3 py-1.5 text-xs">
          <Save size={13} /> Save answers
        </button>
      </div>

      {loadError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{loadError}</p>}
      {saveError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
      {draftConflict && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{draftConflict}</p>
          <button type="button" onClick={() => void load()} className="mt-3 underline">Reload saved draft</button>
        </div>
      )}
      {notice && <p role="status" className="mb-4 rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{notice}</p>}

      {preliminary && (
        <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <LockKeyhole size={17} className="text-amber-800" />
            <h2 className="font-semibold text-amber-900">Preliminary plan saved — not activated</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            No Roadmap was generated or activated. The next step will use {positiveCount} answered question{positiveCount === 1 ? '' : 's'} and mark {openQuestions.length} open unknown{openQuestions.length === 1 ? '' : 's'} instead of inventing answers.
          </p>
          {openQuestions.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {openQuestions.map((question) => (
                <li key={question.id} className="badge bg-white/70 text-amber-900">{question.schema.label} · {statusLabel(answerFor(question, local).status)}</li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setPreliminary(false)} className="btn-secondary mt-4 min-h-9 px-3 py-1.5 text-xs">Keep editing answers</button>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          {activeQuestions.map((question, index) => {
            const answer = answerFor(question, local)
            const questionConflict = conflict?.questionId === question.id ? conflict.message : null
            return (
              <QuestionCard
                key={question.id}
                question={question}
                index={index}
                total={activeQuestions.length}
                answer={answer}
                showOther={Boolean(otherMode[question.id])}
                editingReuse={Boolean(editingReuse[question.id])}
                conflict={questionConflict}
                onChoose={choose}
                onOther={changeOther}
                onText={changeText}
                onStatus={setStatus}
                onEditReuse={editReuse}
                onSave={saveQuestion}
                onLoadLatest={(item) => void loadLatest(item)}
                onSaveMine={(item) => void saveMine(item)}
              />
            )
          })}

          {earlierQuestions.length > 0 && (
            <section className="card mt-6 p-4">
              <button type="button" onClick={() => setShowEarlier((value) => !value)} className="flex w-full items-center gap-2 text-left">
                <ChevronDown size={16} className={`transition ${showEarlier ? 'rotate-180' : ''}`} />
                <span className="font-semibold">Saved earlier answers ({earlierQuestions.length})</span>
                <span className="ms-auto text-xs text-ink-500">Kept when the goal changed</span>
              </button>
              {showEarlier && (
                <div className="mt-4 space-y-3">
                  {earlierQuestions.map((question) => {
                    const answer = answerFor(question, local)
                    const branch = question.branch ? goalDefinition(question.branch) : undefined
                    return (
                      <div key={question.id} className="rounded-xl border border-ink-200 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{question.schema.label}</p>
                          <span className={`badge ${statusStyle(answer.status)}`}>{statusLabel(answer.status)}</span>
                          {branch && <span className="badge bg-ink-100 text-ink-600">{branch.label}</span>}
                        </div>
                        {answerLabel(answer.value, question.schema) && <p className="mt-1 text-sm text-ink-700">{answerLabel(answer.value, question.schema)}</p>}
                        <p className="mt-1 text-xs text-ink-500">This answer was not deleted. Switch back to its goal to use it again.</p>
                        {branch && branch.value !== draft.goal && (
                          <button type="button" onClick={() => void selectGoal(branch.value)} className="mt-2 text-xs font-semibold text-primary-700 underline">
                            Restore {branch.label}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="text-sm font-semibold">Progress</h2>
            <p className="mt-2 text-3xl font-semibold text-ink-900">{positiveCount}<span className="text-base font-normal text-ink-500"> / {activeQuestions.length}</span></p>
            <p className="mt-1 text-xs leading-5 text-ink-600">Answered or confirmed. Unknowns stay visible instead of being filled in.</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${activeQuestions.length ? Math.round((positiveCount / activeQuestions.length) * 100) : 0}%` }} />
            </div>
          </section>

          <section className="card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={15} className="text-primary-600" /> From your Brain</h2>
            {visibleFacts.length === 0
              ? <p className="mt-2 text-xs leading-5 text-ink-600">No eligible confirmed facts yet. Discovery will ask instead of assuming.</p>
              : (
                <ul className="mt-3 space-y-3">
                  {visibleFacts.map((fact) => (
                    <li key={fact.id} className="rounded-xl bg-ink-50 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-medium text-ink-900">{fact.title}</p>
                        {usedBrainIds.has(fact.id) && <span className="badge bg-emerald-50 text-emerald-700">Used</span>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-ink-600">{fact.summary}</p>
                      <p className="mt-1 text-[10px] text-ink-500">{fact.category.replaceAll('_', ' ')} · v{fact.version} · {fact.verification_state?.replaceAll('_', ' ') ?? 'owner reported'}</p>
                    </li>
                  ))}
                </ul>
              )}
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-semibold">Open unknowns</h2>
            {openQuestions.length === 0
              ? <p className="mt-2 text-xs leading-5 text-ink-600">Every active question has an answer or a confirmed reused fact.</p>
              : (
                <ul className="mt-2 space-y-2">
                  {openQuestions.map((question) => (
                    <li key={question.id} className="text-xs leading-5 text-ink-600">
                      <span className="font-medium text-ink-800">{question.schema.label}</span>
                      <span className={`badge ms-1 ${statusStyle(answerFor(question, local).status)}`}>{statusLabel(answerFor(question, local).status)}</span>
                    </li>
                  ))}
                </ul>
              )}
          </section>

          {!preliminary && (
            <section className="card p-4">
              <h2 className="text-sm font-semibold">Preliminary plan</h2>
              <p className="mt-2 text-xs leading-5 text-ink-600">
                You do not need every answer. A preliminary plan can use what is confirmed and disclose the rest as unknowns.
              </p>
              <button type="button" onClick={() => void continuePreliminary()} disabled={planning} className="btn-secondary mt-3 min-h-9 w-full px-3 py-1.5 text-xs">
                {planning ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : 'Continue with a preliminary plan'}
              </button>
              <p className="mt-2 text-[10px] leading-5 text-ink-500">This only saves plan readiness. It does not generate or activate a Roadmap.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
