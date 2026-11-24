/**
 * Specialist runtime (Research / Content / Marketing Analyst) — spec §4/§5/§6.
 *
 * One LLM-driven specialist per role using the shared agent loop with its
 * canonical prompt, its registered skills (lazy), and its tool allowlist.
 * Specialists never contact the user or delegate; they return a structured
 * result to the Director. Pure against injected deps for offline testing.
 */

import type { SpecialistRole } from './contracts'
import { EvidenceLedger, extractHttpUrls } from './evidence'
import { runAgentLoop, type AgentRuntimeDeps, type AgentRuntimeResult } from './runtime'
import { ROLE_SYSTEM_PROMPTS } from './prompts'

export interface SpecialistInput {
  goal: string
  scope: string
  contextBlock: string
  requestedLanguage?: string
  revisionContext?: {
    previousSummary: string
    defect: string
    desired: string
  }
  signal?: AbortSignal
}

export interface SpecialistDeps extends Omit<AgentRuntimeDeps, 'act'> {
  readSkill(id: string): Promise<{ id: string; version: string; contentHash: string; body: string } | null>
  executeTool(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; output?: unknown; error?: string }>
}

const SKILL_CATALOG: Record<SpecialistRole, { id: string; name: string; description: string }[]> = {
  research: [
    { id: 'market-research', name: 'Market Research', description: 'Market scope, demand, trends, size, barriers, opportunity.' },
    { id: 'competitor-intelligence', name: 'Competitor Intelligence', description: 'Discover, qualify and compare competitors and offerings.' },
    { id: 'audience-intelligence', name: 'Audience Intelligence', description: 'Buyer segments, needs, objections, behavior, voice of customer.' },
    { id: 'brand-positioning', name: 'Brand Positioning', description: 'Positioning evidence, alternatives, differentiation.' },
    { id: 'benchmark-intelligence', name: 'Benchmark Intelligence', description: 'Comparable industry references, metrics, practices.' },
  ],
  content: [
    { id: 'social-media-content', name: 'Social Media Content', description: 'Posts, captions, carousels, stories, platform-native organic creative.' },
    { id: 'conversion-copywriting', name: 'Conversion Copywriting', description: 'Ad, landing-page, email and sales-message copy.' },
    { id: 'content-planning-calendar', name: 'Content Planning & Calendar', description: 'Content themes, plans, cadence and coordinated campaign content.' },
    { id: 'brand-voice-egyptian-localization', name: 'Brand Voice & Egyptian Localization', description: 'Voice-sensitive, local, multilingual or bilingual writing.' },
    { id: 'creative-direction-visual-briefs', name: 'Creative Direction & Visual Briefs', description: 'Artwork concepts, layout guidance, carousel visuals and creative briefs.' },
    { id: 'video-scriptwriting', name: 'Video Scriptwriting', description: 'Reels, TikTok, Shorts and other video scripts/shot plans.' },
    { id: 'content-optimization-platform-adaptation', name: 'Content Optimization & Platform Adaptation', description: 'Targeted revision, repurposing, performance-informed alternatives.' },
  ],
  marketing_analyst: [
    { id: 'social-media-analytics', name: 'Social Media Analytics', description: 'Account reach, engagement, follower changes, views and message metrics.' },
    { id: 'content-performance-analysis', name: 'Content Performance Analysis', description: 'Post-level and creative format/topic outcomes.' },
    { id: 'campaign-performance-analysis', name: 'Campaign Performance Analysis', description: 'Campaign delivery, funnels, cost per result, attributed value.' },
    { id: 'kpi-evaluation', name: 'KPI Evaluation', description: 'Select, validate and calculate indicators.' },
    { id: 'marketing-problem-diagnosis', name: 'Marketing Problem Diagnosis', description: 'Decline, anomaly or bottleneck investigation.' },
    { id: 'comparative-analysis', name: 'Comparative Analysis', description: 'Periods, channels, segments, cohorts and supplied benchmarks.' },
    { id: 'performance-optimization', name: 'Performance Optimization', description: 'Prioritized improvement ideas and measurement/experiment design.' },
  ],
}

export interface SpecialistResult extends AgentRuntimeResult {
  role: SpecialistRole
  evidenceRefs: string[]
  limitations: string[]
}

export async function runSpecialist(role: SpecialistRole, input: SpecialistInput, deps: SpecialistDeps): Promise<SpecialistResult> {
  const ledger = new EvidenceLedger()
  ledger.seedKnownUrls(extractHttpUrls(input.contextBlock))

  const act: AgentRuntimeDeps['act'] = async (action) => {
    switch (action.type) {
      case 'read_skill': {
        const skill = await deps.readSkill(action.skillId)
        if (!skill) return { ok: false, content: `Skill ${action.skillId} is not registered.` }
        return { ok: true, content: `Loaded skill ${skill.id} (v${skill.version}):\n${skill.body}` }
      }
      case 'tool_call': {
        const result = await deps.executeTool(action.tool, action.args)
        ledger.recordToolOutcome(action.tool, action.args, result.ok, result.output)
        return result.ok ? { ok: true, content: JSON.stringify(result.output ?? {}) } : { ok: false, content: result.error ?? 'tool failed' }
      }
      case 'ask_clarification':
        // Specialists request clarification THROUGH the Director; the loop returns
        // awaiting_input and the Director decides how to handle it.
        return { ok: true, content: 'Clarification/help requested through Director.' }
      case 'finish':
        return { ok: true, content: 'finish' }
      case 'answer':
        return { ok: true, content: 'answer' }
      default:
        return { ok: false, content: 'specialists may not delegate or revise other agents' }
    }
  }

  const taskText = input.revisionContext
    ? [
        input.goal,
        '',
        'Revision requested by Director:',
        `- Defect: ${input.revisionContext.defect}`,
        `- Desired correction: ${input.revisionContext.desired}`,
        `- Previous output excerpt:\n${input.revisionContext.previousSummary.slice(0, 1500)}`,
      ].join('\n')
    : input.goal

  const result = await runAgentLoop(
    {
      role,
      systemPrompt: ROLE_SYSTEM_PROMPTS[role],
      skillCatalog: SKILL_CATALOG[role],
      contextBlock: [
        input.contextBlock,
        input.scope ? `Assignment scope: ${input.scope}` : '',
        input.requestedLanguage ? `Requested output language: ${input.requestedLanguage}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      task: taskText,
      signal: input.signal,
      gateCompletion:
        role === 'research'
          ? ({ status, text }) => {
              const ungrounded = ledger.findUngroundedUrls(text)
              if (ungrounded.length > 0) {
                return `You cited URL(s) that were NOT retrieved by any search/scrape tool: ${ungrounded.join(', ')}. Only cite actual URLs returned by tavily_search, exa_search, or firecrawl_scrape. Verify them or remove unverified URLs and explain limitations honestly.`
              }
              if (status === 'completed' && !ledger.hasExternalEvidence()) {
                return 'No valid external evidence has been retrieved yet (failed or empty tool results do not qualify). Call tavily_search, exa_search, or firecrawl_scrape to gather real evidence, or call finish with status="partial" or "failed" explaining what could not be verified without fabricating sources.'
              }
              return null
            }
          : role === 'marketing_analyst'
            ? ({ status }) => {
                if (status === 'completed' && !ledger.hasCalculationProvenance()) {
                  return 'You must compute derived figures with the deterministic calculate or analyze_data tool so numbers have tool provenance. Call calculate/analyze_data for the metrics, or finish with status="partial" if required inputs are missing.'
                }
                return null
              }
            : ({ text }) => {
                const ungrounded = ledger.findUngroundedUrls(text)
                if (ungrounded.length > 0) {
                  return `Your output cites unretrieved URL(s): ${ungrounded.join(', ')}. Only cite verified workspace or retrieved URLs.`
                }
                return null
              },
      maxCompletionBlocks: 3,
    },
    { model: deps.model, act, now: deps.now },
  )

  const limitations: string[] = []
  const remainingUngrounded = ledger.findUngroundedUrls(result.summary)
  if (remainingUngrounded.length > 0) {
    limitations.push(`Contains unverified URL(s) not returned by retrieval tools: ${remainingUngrounded.join(', ')}`)
  }
  if (role === 'research' && !ledger.hasExternalEvidence()) {
    limitations.push('No non-empty external search or scrape evidence was retrieved.')
  }
  if (role === 'marketing_analyst' && !ledger.hasCalculationProvenance()) {
    limitations.push('No deterministic calculate/analyze_data tool provenance recorded.')
  }

  const finalStatus =
    remainingUngrounded.length > 0 && result.status === 'completed'
      ? 'partial'
      : role === 'research' && !ledger.hasExternalEvidence() && result.status === 'completed'
        ? 'partial'
        : role === 'marketing_analyst' && !ledger.hasCalculationProvenance() && result.status === 'completed'
          ? 'partial'
          : result.status

  return {
    ...result,
    status: finalStatus,
    role,
    evidenceRefs: [...ledger.retrievedUrls(), ...ledger.calculationSummaries()],
    limitations,
  }
}

export function specialistSkillCatalog(role: SpecialistRole) {
  return SKILL_CATALOG[role]
}
