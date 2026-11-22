import {
  emptyUsage,
  type BusinessProfile,
  type EvidenceObservation,
  type ResearchArtifacts,
  type ResearchBrief,
  type ResearchBudget,
  type ResearchMode,
  type ResearchTrack,
  type SourceRecord,
  type UsageRecord,
  type VisibleAgentEvent,
} from '../contracts'
import type { CandidateUrl } from '../providers/normalize'
import type { ProviderRouter } from '../providers/router'
import type { FreeTierLedger } from '../ledger/ledger'
import { InsufficientAllowanceError } from '../ledger/ledger'
import type { ResolvedEntity } from '../references/entity-resolution'
import { canonicalizeUrl } from '../providers/normalize'
import { ContentCache, EntityRegistry } from './state'
import { agentForTrack, buildBrief, planLayers, planTracks, runWithConcurrency, TRACK_LABELS } from './brief'

export interface WorkerResult {
  track: ResearchTrack
  summary: string
  entities: ResolvedEntity[]
  observations: EvidenceObservation[]
  sources: SourceRecord[]
  candidates: CandidateUrl[]
  usage: UsageRecord
  coverageGaps: string[]
  claims: WorkerClaim[]
}

export interface WorkerClaim {
  id: string
  statement: string
  statementAr: string | null
  kind: string
  confidence: 'hypothesis' | 'supported' | 'validated' | 'strong'
  evidenceIds: string[]
  sourceIds: string[]
  geography: string | null
  validFrom: string | null
  validUntil: string | null
  claimQuality: { score: number; coverage: 'full' | 'partial' | 'none'; reasons: string[] }
  conflicts: string[]
}

export interface WorkerContext {
  brief: ResearchBrief
  signal: AbortSignal
  ledger: FreeTierLedger
  router: ProviderRouter
  registry: EntityRegistry
  cache: ContentCache
  /** Completed tracks, so later specialists consume real prior artifacts. */
  prior: Map<ResearchTrack, WorkerResult>
  /** Wall-clock ceiling for this run, from the brief budget. */
  deadlineAt: number
  emit: EmitEvent
  record(event: Omit<VisibleAgentEvent, 'id' | 'seq'>): Promise<void>
}

export interface EmitEvent {
  (event: Omit<VisibleAgentEvent, 'id' | 'seq'>): Promise<VisibleAgentEvent>
}

export interface Subagent {
  name: string
  track: ResearchTrack
  role: 'subagent'
  skill: string
  run(context: WorkerContext, budget: ResearchBudget): Promise<WorkerResult>
}

export interface EventSink {
  append(event: Omit<VisibleAgentEvent, 'id' | 'seq'>): Promise<VisibleAgentEvent>
}

export interface DirectorResult {
  brief: ResearchBrief
  artifacts: ResearchArtifacts
  sources: SourceRecord[]
  observations: EvidenceObservation[]
  entities: ResolvedEntity[]
  claims: WorkerClaim[]
  events: VisibleAgentEvent[]
  consumption: UsageRecord
  partial: boolean
  skipped: ResearchTrack[]
  failed: ResearchTrack[]
  replans: string[]
}

export interface DirectorDeps {
  ledger: FreeTierLedger
  router: ProviderRouter
  workers: Subagent[]
  sink: EventSink
  canonicalize?: (url: string) => string
}

/**
 * Ticket 07: the Research Director. It builds a dynamic plan, allocates one shared
 * budget, runs up to three retrievals concurrently, shares the entity registry and
 * content cache, and records every step as a visible agent event.
 */
export class ResearchDirector {
  private readonly workers = new Map<ResearchTrack, Subagent>()

  constructor(private readonly deps: DirectorDeps) {
    for (const worker of deps.workers) this.workers.set(worker.track, worker)
  }

  async run(input: {
    brief?: ResearchBrief
    request: string
    mode: ResearchMode
    profile: BusinessProfile
    signal: AbortSignal
  }): Promise<DirectorResult> {
    const brief = input.brief ?? buildBrief({ request: input.request, mode: input.mode, profile: input.profile })
    const plan = planTracks(brief)
    const layers = planLayers(plan)
    const events: VisibleAgentEvent[] = []
    const usage = emptyUsage()
    const sources = new Map<string, SourceRecord>()
    const observations: EvidenceObservation[] = []
    const claims: WorkerClaim[] = []
    const entities = new Map<string, ResolvedEntity>()
    const skipped: ResearchTrack[] = []
    const failed: ResearchTrack[] = []
    const replans: string[] = []
    const gaps: string[] = []

    const deadlineAt = Date.now() + Math.max(15, brief.budget.seconds) * 1000
    const directorInstance = crypto.randomUUID()
    const registry = new EntityRegistry()
    const cache = new ContentCache(this.deps.canonicalize ?? canonicalizeUrl)
    const prior = new Map<ResearchTrack, WorkerResult>()

    const emit = async (event: Omit<VisibleAgentEvent, 'id' | 'seq'>): Promise<VisibleAgentEvent> => {
      const stored = await this.deps.sink.append(event)
      events.push(stored)
      return stored
    }

    await emit({
      instanceId: directorInstance,
      correlationId: crypto.randomUUID(),
      parentInstanceId: null,
      type: 'agent_started',
      agentId: 'research_director',
      agentRole: 'director',
      label: 'Plan the research',
      status: 'running',
      publicMessage: `Planning a ${brief.mode} Egyptian research run across ${brief.tracks.length} track(s).`,
      parametersRedacted: { mode: brief.mode, tracks: brief.tracks, geography: brief.geography.label },
      sourceIds: [],
      consumption: emptyUsage(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      failureReason: null,
    })

    for (const layer of layers) {
      if (this.deps.ledger.exhausted) {
        for (const step of layer) {
          skipped.push(step.track)
          gaps.push(`Skipped ${TRACK_LABELS[step.track]}: the free-tier allowance is exhausted.`)
          await emit({
            instanceId: crypto.randomUUID(),
            correlationId: crypto.randomUUID(),
            parentInstanceId: null,
            type: 'agent_error',
            agentId: agentForTrack(step.track),
            agentRole: 'subagent',
            label: step.label,
            status: 'partial',
            publicMessage: `Skipped ${step.label}: no allowance left. Scope was reduced; no credits were purchased.`,
            parametersRedacted: { track: step.track, reason: 'insufficient_allowance' },
            sourceIds: [],
            consumption: emptyUsage(),
            startedAt: null,
            endedAt: new Date().toISOString(),
            failureReason: 'insufficient_allowance',
          })
        }
        break
      }

      if (this.shouldReduceScope(layer)) {
        const reason = `Allowance low after ${this.deps.ledger.snapshot.settledCalls} provider call(s): dropping ${layer.map(step => TRACK_LABELS[step.track]).join(', ')} from this run.`
        replans.push(reason)
        for (const step of layer) {
          skipped.push(step.track)
          gaps.push(`Replanned out of scope: ${TRACK_LABELS[step.track]} (${reason})`)
          await emit({
            instanceId: crypto.randomUUID(),
            correlationId: crypto.randomUUID(),
            parentInstanceId: null,
            type: 'agent_error',
            agentId: agentForTrack(step.track),
            agentRole: 'subagent',
            label: step.label,
            status: 'partial',
            publicMessage: `Reduced scope: ${step.label} did not run.`,
            parametersRedacted: { track: step.track, reason: 'low_allowance' },
            sourceIds: [],
            consumption: emptyUsage(),
            startedAt: null,
            endedAt: new Date().toISOString(),
            failureReason: 'reduced_scope',
          })
        }
        break
      }

      const results = await runWithConcurrency(layer.map(step => async () => {
        const worker = this.workers.get(step.track)
        const instanceId = crypto.randomUUID()
        const correlationId = crypto.randomUUID()
        if (!worker) {
          gaps.push(`${TRACK_LABELS[step.track]} has no worker registered.`)
          return { step, result: null }
        }
        await emit({
          instanceId,
          correlationId,
          parentInstanceId: directorInstance,
          type: 'delegation',
          agentId: worker.name,
          agentRole: 'subagent',
          label: step.label,
          status: 'running',
          publicMessage: `Delegating to ${worker.name} (${worker.skill}) with ${step.budget.calls} call(s).`,
          parametersRedacted: { track: step.track, budget: step.budget },
          sourceIds: [],
          consumption: emptyUsage(),
          startedAt: new Date().toISOString(),
          endedAt: null,
          failureReason: null,
        })
        try {
          const result = await worker.run({
            brief,
            signal: input.signal,
            ledger: this.deps.ledger,
            router: this.deps.router,
            registry,
            cache,
            prior,
            deadlineAt,
            emit,
            record: async event => { await emit(event) },
          }, step.budget)
          addUsage(usage, result.usage)
          prior.set(result.track, result)
          for (const source of result.sources) {
            const stored = cache.store(source)
            sources.set(stored.source.id, stored.source)
          }
          for (const entity of result.entities) {
            registry.add(entity)
            entities.set(entity.key, entity)
          }
          observations.push(...result.observations)
          claims.push(...result.claims)
          for (const gap of result.coverageGaps) if (!gaps.includes(gap)) gaps.push(gap)
          await emit({
            instanceId,
            correlationId,
            parentInstanceId: null,
            type: 'agent_completed',
            agentId: worker.name,
            agentRole: 'subagent',
            label: step.label,
            status: 'completed',
            publicMessage: result.summary,
            parametersRedacted: { track: step.track, sources: result.sources.length },
            sourceIds: result.sources.map(source => source.id),
            consumption: result.usage,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            failureReason: null,
          })
          return { step, result }
        } catch (error) {
          const message = error instanceof InsufficientAllowanceError
            ? 'The free-tier allowance was exhausted during this track. Partial results are kept.'
            : error instanceof Error ? error.message : 'The track failed.'
          failed.push(step.track)
          gaps.push(`${TRACK_LABELS[step.track]} failed: ${message}`)
          await emit({
            instanceId,
            correlationId,
            parentInstanceId: null,
            type: 'agent_error',
            agentId: worker.name,
            agentRole: 'subagent',
            label: step.label,
            status: 'failed',
            publicMessage: `${TRACK_LABELS[step.track]} stopped: ${message}`,
            parametersRedacted: { track: step.track },
            sourceIds: [],
            consumption: emptyUsage(),
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            failureReason: error instanceof Error ? error.message : 'unknown_error',
          })
          return { step, result: null }
        }
      }), 3)

      for (const entry of results) if (entry.result?.coverageGaps.length) {
        for (const gap of entry.result.coverageGaps) if (!gaps.includes(gap)) gaps.push(gap)
      }
    }

    const allSources = [...sources.values()]
    // Coverage gaps are declared limitations, not a failed run. Only skipped or
    // failed tracks make the result partial.
    const partial = skipped.length > 0 || failed.length > 0
    await emit({
      instanceId: directorInstance,
      correlationId: crypto.randomUUID(),
      parentInstanceId: null,
      type: 'agent_completed',
      agentId: 'research_director',
      agentRole: 'director',
      label: 'Complete the research run',
      status: partial ? 'partial' : 'completed',
      publicMessage: `${allSources.length} source(s), ${observations.length} observation(s), ${entities.size} entities. ${partial ? 'Partial coverage: see the coverage gaps.' : 'Full coverage for the requested tracks.'}`,
      parametersRedacted: { sources: allSources.length, tracks: brief.tracks, skipped: skipped.length },
      sourceIds: allSources.map(source => source.id),
      consumption: usage,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      failureReason: null,
    })

    return {
      brief,
      artifacts: {
        reportId: '',
        mode: brief.mode,
        tracks: brief.tracks.filter(track => !skipped.includes(track)),
        sourceIds: allSources.map(source => source.id),
        claimIds: claims.map(claim => claim.id),
        citationCoverage: 0,
        claimQuality: 0,
        coverageGaps: [...new Set(gaps)],
        budget: brief.budget,
        consumption: usage,
        blocked: allSources.filter(source => source.availability !== 'retrieved').length,
        pdf: null,
        reportJsonPath: '',
        reportHtmlPath: '',
        partial,
      },
      sources: allSources,
      observations,
      entities: [...entities.values()],
      claims,
      events,
      consumption: usage,
      partial,
      skipped,
      failed,
      replans,
    }
  }

  /** Reduce scope when the shared allowance is nearly gone. */
  private shouldReduceScope(layer: { track: ResearchTrack }[]): boolean {
    if (layer.length === 0) return false
    const snapshot = this.deps.ledger.snapshot
    const remainingCalls = snapshot.allowance.calls
    const needed = layer.length
    if (remainingCalls <= 0) return true
    return needed > remainingCalls
  }
}

/** A stub worker that proves the plan → execute → collect → budget loop. */
export function createStubSubagent(track: ResearchTrack, options: { summary?: string; consume?: boolean } = {}): Subagent {
  return {
    name: agentForTrack(track),
    track,
    role: 'subagent',
    skill: `egypt-${track.replace(/_/g, '-')}`,
    async run(context: WorkerContext, budget: ResearchBudget): Promise<WorkerResult> {
      await context.emit({
        instanceId: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
        parentInstanceId: null,
        type: 'tool_call',
        agentId: 'stub_tool',
        agentRole: 'tool',
        label: 'Stub retrieval',
        status: 'completed',
        publicMessage: 'Stub worker recorded a retrieval without a network call.',
        parametersRedacted: { budget: budget.calls },
        sourceIds: [],
        consumption: emptyUsage(),
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        failureReason: null,
      })
      let usage = { calls: 1, pages: 0, tokens: 0, credits: 0 }
      if (options.consume) {
        const reservation = await context.ledger.reserve('firecrawl', 'stub_call', { calls: 1, pages: 0, tokens: 0, credits: 1 })
        await context.ledger.settle(reservation.callId, usage)
      } else {
        usage = { calls: 0, pages: 0, tokens: 0, credits: 0 }
      }
      return {
        track,
        summary: options.summary ?? `${TRACK_LABELS[track]} stub completed with a ${budget.calls} call ceiling.`,
        entities: [],
        observations: [],
        sources: [],
        candidates: [],
        usage,
        coverageGaps: ['Stub worker: no public evidence retrieved in this test run.'],
        claims: [],
      }
    },
  }
}

export function addUsage(target: UsageRecord, addition: Partial<UsageRecord>): UsageRecord {
  target.calls += addition.calls ?? 0
  target.pages += addition.pages ?? 0
  target.tokens += addition.tokens ?? 0
  target.credits += addition.credits ?? 0
  return target
}