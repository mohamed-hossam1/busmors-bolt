# Busmora Employee Rebuild — Phase 0: Full Employee Intelligence Cleanup Plan

**Status:** Read-only planning deliverable, revised for owner decision overrides. No application code, schema, migration, record, or backup has been created or changed.
**Date:** 2026-11-24
**Authoritative product direction:** `BUSMORA_EMPLOYEE_MVP_SPEC.md`
**Supersedes:** the earlier "remove only the deterministic research pipeline" scope. The owner has rejected that scope.

---

## 1. Executive summary

The owner has directed a **Full Employee Intelligence Cleanup**. The objective is not to preserve a reduced research toolkit, and not to leave content/campaign/diagnosis as temporary implementations. It is to remove the entire legacy Employee intelligence layer and leave a clean, honest infrastructure baseline:

- **Removed completely:** the deterministic Research Director, all five workers, all Employee-specific skills, profiler, planning/tracks, Quick/Standard/Deep modes, query lexicon, source registry, entity qualification/resolution, geography heuristics, confidence rubric, evidence audit, pricing/comparison, research stop rules, research provider routing/orchestration, report synthesis/templates, PDF generation, OSM, standalone official sources, duplicate research orchestrator, and all obsolete research prompts/operations/contracts/configurations/tests.
- **Also removed:** Content Writer, Campaign Planner, and Performance Diagnosis as execution paths, including their prompts, AI operations, intent-specific generation inside the task executor, and obsolete execution contracts/tests.
- **No dormant reusable research toolkit.** No module is kept "because it might be useful later." No legacy directory, backup source directory, worktree archive, Git bundle, duplicate retired implementation, or disabled copy of obsolete intelligence is created.
- **Preserved infrastructure:** authentication/workspace isolation, RLS, database records and migration history, Business Brain and approvals, conversations/messages, Deliverables and immutable versions, Calendar/planned posts, Facebook connection/approval/scheduling/publishing, Composio publishing, AI gateway/provider configuration, raw Tavily/Exa/Firecrawl/Composio transports, onboarding/website crawling, generic task lifecycle/leases/checkpoints/cancellation/recovery, generic resource accounting, admin observability, and historical execution records.
- **Orchestrator:** the existing functional foundation is preserved (guardrails, Brain Q&A, idempotency, metrics, message/event recording). Its dependency on retired execution paths is removed. Conversational features and Brain Q&A may remain. Any unsupported task request receives an honest temporary unavailability response. No simulated success.
- **Roadmap:** Option A approved. Temporarily disable "Ask my Director" research. Preserve Roadmap data, versions, Discovery questions, and unrelated functionality. Prevent new research requests from entering the retired pipeline. Ensure tasks and question links do not remain stuck in `running`/`researching`.
- **Agent Canvas:** the old Employee Canvas execution representation is removed. Historical execution data is preserved. No new Canvas is built. Retired deterministic workers are not represented as AI agents.
- **Skills:** all Employee-specific skills are removed. Development/Coding Agent skills under `.agents/skills/` are not touched. No replacement marketing skills are authored; the owner/product architect will supply approved skills later.
- **Backup:** the owner does **not** authorize a new backup, archive, bundle, worktree archive, or compatibility copy. This creates an irreversible consequence for uncommitted retired code, reported in section 11. No Git history is rewritten.

### 1.1 Owner decision compliance matrix

| Owner instruction | Where addressed |
|---|---|
| Remove entire legacy intelligence implementation; no dormant toolkit | Sections 4, 5, 6 |
| Remove content/analysis execution paths; preserve downstream deliverable/post infrastructure | Sections 4, 5, 6, 8 |
| Preserve infrastructure, not intelligence | Sections 6, 8 |
| Orchestrator foundation preserved; no retired dependencies; honest unavailability | Sections 4.1, 8 (C1) |
| Roadmap Option A; no stuck tasks/links; no redesign | Sections 8 (C4–C6), 9.3, 14 |
| Remove old Canvas representation; no new Canvas; preserve historical data | Sections 4.6, 5, 8 (C9) |
| No new backup/archive/bundle/duplicate; report irreversible consequences | Section 11 |
| Remove Employee skills; do not touch dev skills; do not author replacements | Sections 4.2, 5, 8 (C10) |
| Revised deletion allowlist, preservation list, function-level changes, dependency analysis | Sections 4–8 |
| Safe pending/interrupted/queued/historical task handling; anti-bypass | Sections 8 (C2–C8), 9.3 |
| Type-checked tests; isolated publishing tests; no test concealment | Sections 13, 8 (C11) |
| Read-only planning; only update this document | This document |

### 1.2 Baseline verification (current tree, read-only)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0, warnings only |
| Unit | `npm run test:unit` | 41/42; pre-existing failure `shouldStop` at `tests/research/providers.test.ts:41` |
| Tests type-checked | `tsconfig.json` excludes `tests/` | **No.** The revised plan adds `tsconfig.test.json` and `typecheck:tests` (C11). |

---

## 2. Repository and Git snapshot

### 2.1 Identity

| Item | Value |
|---|---|
| Root | `/home/mohamed/Mohamed/busmora-bolt/busmors-bolt` |
| Branch | `feat/chat-agent` |
| HEAD | `30c30b569c9d16c74f4b65094e68c7c2cd398fee` |
| Upstream | `origin/feat/chat-agent`, ahead 19 |
| Source files | 259 `.ts`/`.tsx` under `src/` |
| Research files | 47 under `src/features/research` (42) + `src/server/research` (5) |
| Migrations | 48 |
| Tests | 23 under `tests/` + `e2e/` |

### 2.2 Working tree (verified 2026-11-24)

| Category | Count | Detail |
|---|---|---|
| Staged | 64 files | Includes 15 `src/features/research` files, 5 `tests/research` files, 3 `src/server/research` files, plus admin/roadmap/auth/chat-title work. |
| Unstaged | 5 files | `package.json`, `src/features/roadmap/types.ts`, `src/server/ai/operations.ts`, `src/server/roadmap/adapt.ts`, `src/server/roadmap/generator.ts`. |
| Untracked | 4 paths | `BUSMORA_EMPLOYEE_MVP_SPEC.md`, `EMPLOYEE_TECHNICAL_AUDIT.md`, `src/features/roadmap/plan-parse.ts`, `tests/roadmap/`. |

### 2.3 Uncommitted work: retired vs unrelated

The owner forbids deleting unrelated uncommitted work. This split is mandatory before any deletion.

| Category | Paths | Action |
|---|---|---|
| **Retired intelligence (may be deleted)** | All staged/unstaged changes under `src/features/research/**`, `src/server/research/**`, `tests/research/**`; `src/server/task-backend.ts`; the research branches in `src/server/task-executor.ts`, `src/server/task-dispatcher.ts`, `src/server/ai/operations.ts`, `src/config/ai-models.ts`, `src/lib/agents.ts`, `src/server/ai-generate.ts`, `src/screens/EmployeePage.tsx`; `src/features/roadmap/RoadmapResearchPanel.tsx`, `src/server/roadmap/proposal.ts`; the research client functions in `src/features/roadmap/api.ts`; the research test files. | Delete/rewrite per sections 4–5. These are the retired implementation. |
| **Unrelated uncommitted work (must be preserved)** | `src/features/roadmap/{DiscoveryWizard,RoadmapPlan,RoadmapReview,RoadmapResearchPanel? see note,api,types}.tsx/ts`, `src/server/roadmap/{adapt,generator,revisions}.ts`, `src/app/api/roadmap/route.ts`, `src/features/roadmap/plan-parse.ts` (untracked), `tests/roadmap/`, `src/app/[lang]/dictionaries/*`, `src/app/[lang]/page.tsx`, `src/components/EmptyState.tsx`, `src/components/brain/BrainGraph.tsx`, `src/features/marketing/ui/Navbar.tsx`, `src/hooks/useRedirectIfAuthenticated.ts`, `src/lib/authRouting.ts`, `src/lib/chat-title.ts`, `src/server/chat-title.ts`, `src/screens/auth/*`, `src/screens/Onboarding.tsx`, `src/server/auth.ts`, `src/server/admin/*`, `src/app/auth/callback/route.ts`, `src/app/api/admin/check/route.ts`, `src/app/api/conversations/route.ts`, `tests/admin/auth.test.ts`, `tests/chat/chat-title.test.ts`, `supabase/migrations/20261124001000_*.sql`, `20261124002000_*.sql`, and the unrelated hunks of `package.json`. | Preserve. Do not revert, stage over, or delete. `RoadmapResearchPanel.tsx` is retired (Ask my Director UI) and is the only roadmap file in the retired set; all other roadmap files are unrelated and preserved. |

### 2.4 Partial-commit fragility

| Issue | Evidence | Consequence |
|---|---|---|
| Untracked `plan-parse.ts` imported by tracked files | `src/server/roadmap/adapt.ts:6`, `generator.ts:6` | Committing the index alone breaks compilation. Preserve the file; do not delete it. |
| `adapt.ts` is `AM` | staged add + unstaged modify | Do not overwrite the working-tree version with the index. |
| `package.json` is `MM` | staged adds admin/chat test globs; unstaged adds roadmap glob | Preserve both; the cleanup will rewrite the test globs deliberately (C11). |
| `tests/roadmap/` untracked | `package.json` references it | Preserve; do not delete. |
| No secrets tracked | `.env` is ignored; `.env.example` has empty values | Do not add secrets to the plan or any new file. |

### 2.5 No-backup consequence

The owner has not authorized a backup. The retired uncommitted research code listed in 2.3 will be **permanently lost** when deleted. See section 11.1. If that is unacceptable, the only non-destructive option is for the owner to commit the current work to a new branch before execution; this plan does not do so.

---

## 3. Comparison against the new MVP specification

### 3.1 Target vs current

| MVP role | Current implementation | Required action |
|---|---|---|
| Orchestrator | `src/features/orchestrator/*`, `src/server/orchestrator/*` | **MODIFY**: keep guardrails/Brain/idempotency/metrics; remove task handoff; unsupported task requests get an honest reply. |
| Director | `src/server/task-executor.ts` | **REMOVE execution**: reduce to a generic fail-fast; no planning/generation. The Director will be built in a later phase. |
| Research Agent | entire `src/features/research` + `src/server/research` | **REMOVE** completely. No dormant toolkit. |
| Content Agent | `content_creation` / `campaign_planning` in task executor + `copy`/`campaign` operations | **REMOVE** completely. Downstream deliverable/post/version/approval/publishing infrastructure is preserved. |
| Marketing Analyst | `performance_diagnosis` in task executor + `diagnose` operation | **REMOVE** completely. |

### 3.2 Spec requirement vs current behavior

| MVP requirement | Current behavior | Action |
|---|---|---|
| One LLM-driven Research Agent with five skills | Five deterministic workers + templated report + OSM/official tools | Remove all; owner/architect supply skills later. |
| No fixed tracks/modes | `ALL_TRACKS`, `selectTracks`, `BUDGET_PROFILES`, `inferResearchMode` | Remove. |
| No hardcoded research planning/narratives | `brief.ts`, `synthesis/report.ts` | Remove. |
| No OSM/official | `providers/osm.ts`, `egypt-official.ts`, `osmNearby`, `officialPage` | Remove. |
| No duplicate routing/guardrails | `features/research/orchestrator/orchestrator.ts` | Remove; task executor no longer routes. |
| No unused operations/model configs | seven dead ops/models | Remove. |
| No content/campaign/diagnosis as temporary implementations | task executor generate branches + `copy`/`campaign`/`diagnose` | Remove. |
| Honest unsupported behavior | currently may generate content or research | Add deterministic unavailability response. |
| Canvas shows only real agents | auditor/synthesis/generic `Scrape` | Remove old Canvas; no new Canvas. |
| Roadmap preserved | Ask my Director depends on research | Option A: disable research, preserve data, fail links/steps cleanly. |
| Publishing regression tests isolated | e2e 05 may use a real page | Require isolated env/mocked Graph API. |

### 3.3 Clean baseline definition

The baseline contains **no operational legacy intelligence implementation**:

- Orchestrator can converse and answer from approved Business Brain facts.
- Any request that would require research, content generation, campaign planning, or performance diagnosis returns an explicit "this capability is being rebuilt" response.
- No task is enqueued for those requests; no deliverable/post is fabricated.
- Generic task infrastructure remains, but it cannot execute intelligence. Queued/running tasks are failed honestly; historical records remain readable.
- Roadmap Discovery remains usable except "Ask my Director," which is disabled with an honest message.
- The old Canvas is gone; historical events remain in DB/admin.
- No new agents or skills are implemented.

---

## 4. Complete KEEP / MODIFY / REMOVE / REBUILD / REVIEW inventory

Classification key:
- **KEEP** — preserve as-is.
- **MODIFY** — preserve the file, remove intelligence-specific behavior.
- **REMOVE** — delete; no relocation, no dormant copy.
- **REBUILD** — future phase, not this cleanup.
- **REVIEW** — blocked on an owner decision or insufficient evidence.

### 4.1 Orchestrator

| ID | Path / export | Class | Reason / notes |
|---|---|---|---|
| O1 | `src/features/orchestrator/gateway.ts` — `runOrchestrator`, `OrchestratorDeps`, `ChatMessage`, `OrchestratorMessageSource` | **MODIFY** | Keep injection guardrails, Brain path, idempotency, 70 ms metrics, message/event recording. Remove `planDirectorHandoff`, `handoffCheckpoint`, `TaskOrigin`, `submitTask`, `enqueueTask`, and the `path === 'task'` enqueue. If `decision.path === 'task'`, record orchestrator events and return a deterministic unavailability reply; never enqueue. |
| O2 | `src/features/orchestrator/contracts.ts` — `DirectorIntent`, `DIRECTOR_INTENTS`, `OrchestratorDecision`, `OrchestratorRoute`, `isDirectorIntent` | **MODIFY** | Remove the duplicate `ResearchMode` (lines 33, 132), the `researchMode` field (line 67), and `auditor`/`synthesis` roles (lines 49–51). Keep `marketing_research`/`content_creation`/`campaign_planning`/`performance_diagnosis` only as classification values if the prompt needs them to trigger the unavailability reply; otherwise reduce to `simple_answer` + an `unsupported` classification. |
| O3 | `src/features/orchestrator/decision.ts` — `normalizeDecision` | **MODIFY** | Remove `researchMode` from both return objects and the normalizer. |
| O4 | `src/features/orchestrator/guardrails.ts` — `evaluateGuardrails`, `buildRefusalReply` | **KEEP** | Authoritative security guardrail. Single guardrail after the duplicate is deleted. |
| O5 | `src/features/orchestrator/prompt.ts` — `orchestratePrompt`, `DIRECT_DEFAULT_REPLY` | **MODIFY** | Remove all task intents and `researchMode`. The prompt should classify only conversational/Brain requests and task requests that must receive the unavailability response. Do not instruct the model to produce content/campaign/diagnosis/research. |
| O6 | `src/features/orchestrator/director-handoff.ts` | **REMOVE** | The old task handoff. Director handoff will be implemented in a later phase. |
| O7 | `src/features/orchestrator/brain-tool.ts` — `retrieveBrain`, `scoreFact`, `shortSnippet`, `BrainFact`, `BrainReader`, `BrainRow` | **KEEP** | Brain Q&A is preserved. |
| O8 | `src/server/orchestrator/gateway-server.ts` — `runOrchestratorRequest`, `createMessageSource` | **MODIFY** | Remove any task-submission dependency; keep Brain reader and idempotency. |
| O9 | `src/server/orchestrator/model.ts` — `callOrchestratorModel` | **KEEP** | Calls `generateAi` with `orchestrate`/`brain_answer`. No research coupling. |
| O10 | `src/features/research/orchestrator/orchestrator.ts` | **REMOVE** | Duplicate router and guardrails. Deleted with `src/features/research`. |

### 4.2 Research implementation (all removed)

| ID | Path / export | Class | Reason |
|---|---|---|---|
| R1 | `src/features/research/director/director.ts` | **REMOVE** | Deterministic Research Director. |
| R2 | `src/features/research/director/brief.ts` | **REMOVE** | Tracks, layers, dependency chain, mode budgets. |
| R3 | `src/features/research/director/state.ts` | **REMOVE** | Worker state. |
| R4 | `src/features/research/agents/market-scout.ts` | **REMOVE** | Deterministic worker. |
| R5 | `src/features/research/agents/competitor-intelligence.ts` | **REMOVE** | Deterministic worker. |
| R6 | `src/features/research/agents/audience-intelligence.ts` | **REMOVE** | Deterministic worker. |
| R7 | `src/features/research/agents/brand-positioning.ts` | **REMOVE** | Deterministic worker. |
| R8 | `src/features/research/agents/benchmark-strategy.ts` | **REMOVE** | Deterministic worker. |
| R9 | `src/features/research/agents/common.ts` | **REMOVE** | Worker helpers and stop rules. No relocation. |
| R10 | `src/features/research/agents/themes.ts` | **REMOVE** | Worker heuristic. |
| R11–R15 | `src/features/research/agents/skills/*/SKILL.md` (5 files) | **REMOVE** | Employee-specific skills. Do not author replacements. |
| R16 | `src/features/research/policy.ts` | **REMOVE** | Mode budgets, track weights, research stop/allowlist policy. No dormant toolkit. |
| R17 | `src/features/research/observability.ts` | **REMOVE** | Research trace sink. Generic `src/server/observability` is preserved. |
| R18 | `src/features/research/ledger/ledger.ts` | **REMOVE** | Research-specific `FreeTierLedger`. Generic DB accounting/RPCs are preserved (section 6.9). |
| R19 | `src/features/research/providers/router.ts` | **REMOVE** | Research provider orchestration. |
| R20 | `src/features/research/providers/search.ts` | **REMOVE** | Research adapter. Raw Tavily/Exa transports are preserved separately (R44). |
| R21 | `src/features/research/providers/firecrawl.ts` | **REMOVE** | Research adapter. Raw Firecrawl transport preserved separately. |
| R22 | `src/features/research/providers/composio.ts` | **REMOVE** | Research adapter. Raw Composio transport preserved separately. |
| R23 | `src/features/research/providers/normalize.ts` | **REMOVE** | Evidence normalization. |
| R24 | `src/features/research/providers/types.ts` | **REMOVE** | Research provider interfaces. |
| R25 | `src/features/research/providers/health.ts` | **REMOVE** | Research provider health. |
| R26 | `src/features/research/providers/osm.ts` | **REMOVE** | Excluded by MVP. |
| R27 | `src/features/research/providers/egypt-official.ts` | **REMOVE** | Excluded by MVP. |
| R28 | `src/features/research/references/entity-qualification.ts` | **REMOVE** | Explicitly listed by owner. |
| R29 | `src/features/research/references/entity-resolution.ts` | **REMOVE** | Explicitly listed by owner. |
| R30 | `src/features/research/references/geography.ts` | **REMOVE** | Geography research heuristics. |
| R31 | `src/features/research/references/lexicon.ts` | **REMOVE** | Query lexicon. |
| R32 | `src/features/research/references/pricing.ts` | **REMOVE** | Research pricing/comparison. |
| R33 | `src/features/research/references/rubric.ts` | **REMOVE** | Confidence rubric/scoring. |
| R34 | `src/features/research/references/source-registry.ts` | **REMOVE** | Source registry. |
| R35 | `src/features/research/synthesis/evidence-audit.ts` | **REMOVE** | Evidence audit/analytical logic. |
| R36 | `src/features/research/synthesis/report.ts` | **REMOVE** | Report synthesis/templates. |
| R37 | `src/features/research/synthesis/markdown.ts` | **REMOVE** | Report markdown. |
| R38 | `src/features/research/brain/proposals.ts` | **REMOVE** | Research-to-Brain proposal logic. Historical `research_proposals` rows remain in DB. |
| R39 | `src/features/research/deliverable/pdf.ts` | **REMOVE** | Research PDF generation. |
| R40 | `src/server/research/runner.ts` | **REMOVE** | Research runner. |
| R41 | `src/server/research/ai-profiler.ts` | **REMOVE** | Research profiler. |
| R42 | `src/server/research/pdf.ts` | **REMOVE** | Research PDF renderer. |
| R43 | `src/server/research/storage.ts` | **REMOVE** | Research persistence. Historical rows remain in DB; no TS module retained. |
| R44 | `src/server/research/providers.ts` | **MODIFY / RELOCATE TRANSPORTS ONLY** | This file mixes raw HTTP transports with research helpers. Move only `firecrawlScrape`, `tavilySearch`, `exaSearch`, `composioRun`, `composioInstantPrice` to `src/server/integrations/web-providers.ts`. Delete `officialPage` and `osmNearby`. Delete the old file. **This is the only relocation; it preserves explicitly approved raw infrastructure, not intelligence logic.** |
| R45 | `src/features/research/contracts.ts` | **REMOVE** | Obsolete research contracts. Minimum read compatibility is provided by generic `src/lib/types.ts` / `src/lib/contracts.ts` and a reduced `src/features/tasks/types.ts`; no research types remain. |
| R46 | `src/features/research/canvas/graph.ts` | **REMOVE** | Old Canvas representation. Do not relocate. |
| R47 | `src/features/research/**` (remaining files) | **REMOVE** | The entire directory is removed. |

### 4.3 AI gateway, model configuration, provider adapters

| ID | Path / export | Class | Reason / notes |
|---|---|---|---|
| A1 | `src/server/ai-generate.ts` — `generateAi`, `resolveApiKeyForProvider`, `executeWithFallback`, `callProvider` | **MODIFY** | Keep provider dispatch/fallback/BYOK/key management. Remove `'diagnose'` and `'analyze'` from the jsonMode allowlist (line 150). Remove `ORCHESTRATOR_OPERATIONS` entries only if the operation is removed; `orchestrate` and `brain_answer` remain. |
| A2 | `src/server/call-ai.ts` — `callAi`, `callAiText` | **KEEP** | Thin client. |
| A3 | `src/server/ai/crawl-prompts.ts` — `CRAWL_PROMPTS`, `CrawlOperation` | **KEEP** | Onboarding crawl. |
| A4 | `src/server/ai/operations.ts` — `OPERATIONS`, `getSystemPrompt`, `validateOutput`, `validateOrchestratorDecision` | **MODIFY** | Remove `route`, `copy`, `campaign`, `diagnose`, `clarify`, `research`, `analyze`, `research_profile`. Keep `chat`, `title`, `roadmap`, `roadmap_answer`, `roadmap_revision`, `roadmap_checkin`. `validateOutput` drops the removed branches. `validateOrchestratorDecision` drops task intents only if the prompt drops them. |
| A5 | `src/config/ai-models.ts` — `PROD_AI_MODELS`, `TEST_AI_MODELS`, `getModelConfigForOperation` | **MODIFY** | Remove `router` cases for `route`/`clarify`/`research_profile`; `contentWriter` (`copy`); `campaignPlanner` (`campaign`); `performanceAnalyst` (`diagnose`); `researchDirector`, `researchSubagent`, `researchSynthesis` and their cases. Keep `orchestrator`, `fastChat`, `router` (roadmap answer/checkin), `roadmap`, `onboardingCrawl`. Remove the now-unused model entries `contentWriter`, `campaignPlanner`, `performanceAnalyst`, `researchDirector`, `researchSubagent`, `researchSynthesis`. |
| A6 | `src/lib/agents.ts` — `AiOperation` | **MODIFY** | Reduce to `'chat' | 'roadmap' | 'roadmap_answer' | 'roadmap_revision' | 'roadmap_checkin'` (plus `'title'` only if a caller uses it; verify `server/chat-title.ts`). Remove `route`, `clarify`, `research`, `copy`, `campaign`, `diagnose`, `analyze`, `research_profile`. |
| A7 | Provider keys `groq`, `dahl`, `sovereigneg`, `openai`, `google`, `openrouter`, `anthropic`, `custom` | **KEEP** | Reusable gateway. |
| A8 | `src/server/crawl.ts` | **KEEP** | Onboarding. Uses `extract`/`extract_ar`/`relate`; keep those operations/models. |
| A9 | `src/server/siteReader.ts` | **MODIFY** | Update import from `./research/providers` to `./integrations/web-providers`. Keep `firecrawlScrape` usage. |
| A10 | `src/server/crawlStorage.ts`, `src/lib/crawl*.ts` | **KEEP** | Onboarding crawl. |
| A11 | `src/server/integrations/web-providers.ts` (new) | **REBUILD / RELOCATE** | Raw `firecrawlScrape`, `tavilySearch`, `exaSearch`, `composioRun`, `composioInstantPrice`. No research types or evidence logic. This is the only new file. |

### 4.4 Task execution, persistence, checkpoints, recovery

| ID | Path / export | Class | Reason / notes |
|---|---|---|---|
| T1 | `src/server/task-executor.ts` — `runTask`, `TaskBackend`, `TaskFailure` | **MODIFY (reduce to fail-fast)** | Remove all imports from `features/research`, `lib/deliverableRouting`, `lib/deliverableMarkdown`, `lib/calendar`, `lib/agents`, `features/tasks/types` research types. Remove `route`, `generate`, `parseRoute`, `parsePosts`, `routeContext`, `aiFailure`, `promoteTaskIntent`, `questionProposal`, and all content/campaign/diagnosis/research branches. Keep the function name `runTask` as the generic lifecycle seam; it loads the task and calls `fail_task` with `failure_code='capability_unavailable'` and an honest message. It must never call `save_task_result` or `complete_task`. If `origin.kind === 'wizard_question'`, it also marks the question link failed (C5). If `origin.kind === 'roadmap_step'`, it restores the step status (C6). |
| T2 | `src/server/task-backend.ts` | **REMOVE** | All methods are intelligence-specific (`getContext`, `ai`, `research`, `questionProposal`). No generic lifecycle logic lives here. |
| T3 | `src/server/task-dispatcher.ts` — `dispatchTasks`, `PollState` | **MODIFY** | Keep lease/heartbeat/trace/cancellation/poll. Remove the research-only batching (lines 27–28). Use `queued.slice(0, 2)`. It will claim tasks and `runTask` fails them honestly. |
| T4 | `src/features/tasks/types.ts` | **MODIFY (reduce)** | Remove `import type { ResearchArtifacts, ResearchMode }`. Remove `RouteDecision`, `TaskOutput`, `TaskContext`, `TaskCheckpoint`, `ResearchRunResult`, `researchMode`, `research`. Keep a minimal `ExecutionTask` for reading historical rows: `id`, `workspace_id`, `conversation_id`, `type: string`, `status: TaskStatus`, `version`, `origin: TaskOrigin`, `user_request`, `result_summary`, `attempts`, `created_at`, `updated_at`, `run_id`, `runner_id`, `trace_id?`, `allowance?`, `consumption?`. Do not import research types. |
| T5 | `src/features/tasks/runner.ts` — `useTaskRunner`, `StartTaskInput`, `StartTaskResult` | **MODIFY** | Keep `refresh` and `cancel` for historical tasks. Remove or hard-disable `orchestrate`, `resume`, and `answer`; the server rejects them (C2). If `orchestrate` is kept for the chat entry point, it must only call the Orchestrator and must never create a task; the server guarantees this. |
| T6 | `src/features/tasks/TaskRunnerProvider.tsx` | **MODIFY** | Keep `tasks`, `refresh`, `cancel`, `error`. Remove `orchestrate`/`resume`/`answer` from the exposed runner or make them throw a typed `TASK_EXECUTION_UNAVAILABLE` error. |
| T7 | `src/app/api/tasks/route.ts` | **MODIFY** | `refresh` and `cancel` remain. `orchestrate` returns a direct/Brain/unavailability reply and never enqueues. `submit`, `resume`, and `answer` return HTTP 409 `{ error: 'TASK_EXECUTION_UNAVAILABLE', message: ... }`. `list` remains. |
| T8 | `src/server/deliverable-offers.ts` | **KEEP** | Downstream deliverable approval. No intelligence. |
| T9 | `src/features/tasks/runner.ts` + `TaskRunnerProvider.tsx` polling | **MODIFY** | Keep status polling for historical tasks; no new execution. |

### 4.5 Business Brain, Deliverables, Calendar, Facebook, Composio, Roadmap

| ID | Path / export | Class | Reason / notes |
|---|---|---|---|
| B1 | `src/features/orchestrator/brain-tool.ts` | **KEEP** | Brain Q&A. |
| B2 | `src/screens/BrainPage.tsx`, `src/components/brain/*`, `src/lib/brainApi.ts`, `src/lib/brainGraphLayout.ts` | **KEEP** | Brain data/approvals. `ResearchProposalReview` remains for historical `research_proposals`; it is a Brain approval UI, not research execution. |
| B3 | `src/features/research/brain/proposals.ts` | **REMOVE** | Research proposal generation. |
| B4 | `src/screens/DeliverablesPage.tsx`, `src/components/EmptyState.tsx`, `src/lib/types.ts` (`Deliverable`, `DeliverableVersion`) | **KEEP** | Deliverables and immutable versions. Historical `research_report`/`content_posts`/`content_calendar`/`performance_diagnosis` documents remain viewable. |
| B5 | `src/lib/deliverableMarkdown.ts` | **REMOVE** | Content-generation document builders. Only caller is `task-executor` (removed). |
| B6 | `src/lib/deliverableRouting.ts` | **REMOVE** | Intent-specific deliverable routing. Only caller is `task-executor` (removed). |
| B7 | `src/components/chat/DeliverableOfferCard.tsx` | **KEEP** | Generic approval UI for historical `deliverable_offer` messages. No intelligence. |
| B8 | `src/screens/CalendarPage.tsx`, `src/components/CalendarMonth.tsx`, `DayDetailModal.tsx`, `PostDetailModal.tsx`, `src/lib/calendar.ts` | **KEEP** | Calendar and planned posts. |
| B9 | `src/server/publishing/**`, `src/components/publishing/PublishingDecisionCard.tsx` | **KEEP** | Facebook/Composio publishing, approval, scheduling, duplicate-send prevention. |
| B10 | `src/app/api/connections/facebook/**`, `src/components/settings/FacebookConnectionCard.tsx`, `src/screens/SettingsPage.tsx` | **KEEP** | Facebook connection/OAuth. |
| B11 | `src/features/roadmap/**` (except R-panel and research client functions) | **KEEP / MODIFY** | Roadmap is out of scope. Preserve data/versions/Discovery. Disable Ask my Director and step-task delegation. |
| B12 | `src/features/roadmap/RoadmapResearchPanel.tsx` | **REMOVE** | UI for the disabled Ask my Director research flow. |
| B13 | `src/features/roadmap/api.ts` — `startQuestionResearch`, `clearResearchKey`, `loadQuestionResearch`, `decideQuestionResearch` | **REMOVE** | Research-specific client. Historical DB rows remain. |
| B14 | `src/features/roadmap/api.ts` — `startRoadmapStepTask`, `clearStepKey` | **MODIFY / REMOVE** | Step-task delegation depends on task execution. Disable with an honest error or remove. Keep all other roadmap actions. |
| B15 | `src/server/roadmap/proposal.ts` — `generateQuestionProposal` | **REMOVE** | Research-to-proposal intelligence. Only caller is `task-backend` (removed). |
| B16 | `src/server/roadmap/{adapt,generator,revisions}.ts`, `src/app/api/roadmap/route.ts`, `src/screens/RoadmapPage.tsx`, `src/components/roadmap/*` | **KEEP / MODIFY** | Preserve roadmap generation/revision/checkin. Guard `startStepTask` (C7). |
| B17 | `src/features/roadmap/DiscoveryWizard.tsx` | **MODIFY** | Remove the "Ask my Director" call and show an honest disabled state. Keep Discovery questions/drafts/answers. |
| B18 | `supabase/migrations/20261124000000_roadmap_generation.sql`, `20261124002000_roadmap_director_loop.sql`, `20261123120000_discovery_challenges.sql` | **KEEP** | Roadmap/Discovery schema and RPCs. No schema changes. |

### 4.6 Employee frontend, Canvas, observability

| ID | Path / export | Class | Reason / notes |
|---|---|---|---|
| F1 | `src/screens/EmployeePage.tsx` | **MODIFY (remove task/canvas)** | Remove `useTaskRunner`, `AgentCanvas`, `RoadmapResearchPanel`, `chatCanvasStorage`, `CanvasPreviewPost`, task progress, active task, deliverable-offer polling, and continuation origin. Keep chat, conversation history, Brain Q&A, and a link to Deliverables. The send path calls the Orchestrator; it may receive a direct/Brain/unavailability reply. Do not render a task card or simulate progress. |
| F2 | `src/components/chat/AgentCanvas.tsx` | **REMOVE** | Old Canvas execution representation. Do not build a new Canvas. |
| F3 | `src/lib/chatCanvasStorage.ts` | **REMOVE** | Canvas-only layout storage. `reactflow` remains a dependency for `BrainGraph`. |
| F4 | `src/components/chat/MarkdownContent.tsx`, `PostPreview.tsx`, `DeliverableOfferCard.tsx` | **KEEP** | Generic chat/deliverable/post rendering for historical messages. |
| F5 | `src/lib/chat-title.ts`, `src/server/chat-title.ts` | **KEEP** | Conversation title generation. |
| F6 | `src/features/notifications/NotificationCenter.tsx` | **KEEP** | Generic task notifications; historical tasks may still notify. |
| F7 | `src/server/observability/**` | **KEEP** | Generic trace collector. |
| F8 | `src/server/admin/**`, `src/features/admin/**`, `src/app/api/admin/**`, `src/app/[lang]/admin/**` | **KEEP** | Admin observability/security. Historical events remain visible. |
| F9 | `src/screens/auth/*`, `src/components/auth/*`, `src/app/auth/callback/route.ts`, `src/hooks/useRedirectIfAuthenticated.ts`, `src/lib/authRouting.ts`, `src/server/auth.ts` | **KEEP** | Authentication/workspace isolation. |
| F10 | `src/app/[lang]/dictionaries/{en,ar}.json` | **MODIFY (optional)** | Remove keys that are only used by deleted UI (e.g. `quickResearch`, `canvasTitle`, `taskEventsLoadFailed`) if no historical UI uses them. Keep historical labels if still rendered. Not a blocking change. |

### 4.7 Database objects (no schema changes)

| ID | Object | Class | Notes |
|---|---|---|---|
| D1 | All 48 migrations | **KEEP** | No edit, squash, or deletion. |
| D2 | `tasks`, `task_results`, `task_events`, `task_steps`, `tasks.research_mode` | **KEEP** | Historical rows remain. `research_mode` stays nullable. |
| D3 | `research_reports`, `research_claims`, `research_proposals`, `sources`, `claim_sources`, `free_tier_allowance`, `provider_usage` | **KEEP** | Historical data remains. No new writes. |
| D4 | `agent_events`, `task_steps`, `orchestrator_runs` | **KEEP** | Historical execution records. |
| D5 | `deliverables`, `deliverable_versions`, `deliverable_offers` | **KEEP** | Historical deliverables/offers. |
| D6 | `conversations`, `messages`, `conversation_events` | **KEEP** | Conversation history. |
| D7 | `brain_nodes`, `brain_edges`, `brain_proposals`, `brain_audit_log` | **KEEP** | Brain data/approvals. |
| D8 | `planned_posts`, `posts`, `publish_attempts`, `calendar_*`, `facebook_connections` | **KEEP** | Calendar/publishing. |
| D9 | `roadmaps`, `roadmap_steps`, `roadmap_versions`, `discovery_questions`, `question_research_links` | **KEEP** | Roadmap/Discovery. Status remediation only (section 9.3). |
| D10 | Research RPCs (`save_research_result`, `record_research_event`, `set_research_mode`, `reserve/settle/release_provider_call`, `research_policy_checks`, `decide_research_proposal`) | **KEEP** | Dormant; no code calls them. Do not drop. |
| D11 | Roadmap RPCs (`start_question_research`, `save_question_research_proposal`, `decide_question_research`, `load_question_research`, `start_roadmap_step_task`) | **KEEP** | Dormant/guarded. `decide_question_research` is used by C5. |
| D12 | Task RPCs (`enqueue_task`, `claim_task`, `heartbeat_task`, `persist_task_checkpoint`, `save_task_step`, `complete_task`, `fail_task`, `resume_task`, `recover_tasks`, `stop_task`, `save_task_result`, `answer_task_input`) | **KEEP** | Generic lifecycle. `fail_task` is used by the fail-fast; `save_task_result`/`complete_task` are not used for new tasks. |

### 4.8 Tests and scripts

| ID | Path | Class | Reason / notes |
|---|---|---|---|
| X1 | `tests/research/*.test.ts` (5 files) | **REMOVE** | Tests for deleted intelligence. Do not modify to conceal regressions. |
| X2 | `tests/admin/auth.test.ts` | **KEEP** | Admin auth. |
| X3 | `tests/chat/chat-title.test.ts` | **KEEP** | Chat title. |
| X4 | `tests/roadmap/plan-parse.test.ts` | **KEEP** | Roadmap plan parsing. |
| X5 | `e2e/specs/01-foundation.spec.ts`, `02-auth.spec.ts` | **KEEP** | Auth/foundation. |
| X6 | `e2e/specs/03-agents-orchestrator.spec.ts` | **MODIFY** | Remove research/content/campaign/diagnosis scenarios. Keep direct/Brain. Add an unavailability test: a task request creates no task, returns the honest reply, and renders no canvas/progress. |
| X7 | `e2e/specs/04-deliverables-calendar.spec.ts`, `05-publishing.spec.ts` | **MODIFY** | Keep deliverables/calendar. Publishing must run against an isolated env/mocked Graph API; never publish real Facebook content. |
| X8 | New `tests/orchestrator/unavailable.test.ts` | **REBUILD** | Task request → no task, honest reply, EN/AR. |
| X9 | New `tests/tasks/unavailable.test.ts` | **REBUILD** | `submit`/`resume`/`answer` rejected; fail-fast marks queued/running failed; wizard link failed; roadmap step restored. |
| X10 | New `tests/roadmap/discovery-disabled.test.ts` | **REBUILD** | Ask my Director disabled; no RPC call; Discovery question unchanged. |
| X11 | New `tests/publishing/isolated.test.ts` | **REBUILD** | Mock Graph API; assert `publish_attempts` in isolated DB; no real network. |
| X12 | `scripts/bench-orchestrator.ts` | **MODIFY** | Remove `researchMode` from fake decisions; `OPERATIONS.orchestrate` remains. |
| X13 | `scripts/local-migration-check.mjs`, `scripts/*-db-check.sql`, `scripts/local-pg.mjs`, `scripts/db-check.cjs` | **KEEP** | DB acceptance. |
| X14 | `scripts/prepare-e2e-build.mjs`, `scripts/ensure-e2e-artifacts.mjs`, `scripts/testing/*` | **KEEP** | E2E/test infrastructure. |
| X15 | `package.json` test scripts | **MODIFY** | Remove `tests/research/*.test.ts`; add `tests/orchestrator/*.test.ts`, `tests/tasks/*.test.ts`, `tests/roadmap/*.test.ts`, `tests/admin/*.test.ts`, `tests/chat/*.test.ts`, `tests/publishing/*.test.ts` as applicable. Add `typecheck:tests`. |
| X16 | `tsconfig.test.json` (new) | **REBUILD** | Include `tests/**/*.ts`, `e2e/**/*.ts`, `playwright.config.ts`, `src/**/*.ts(x)`. `noEmit`, `strict`. Add `typecheck:tests` script. |

### 4.9 Configuration and environment

| ID | Item | Class | Reason / notes |
|---|---|---|---|
| E1 | `.env.example` | **MODIFY** | Remove `RESEARCH_REPORT_DIR`, `CHROME_PATH` (PDF removed), `RESEARCH_TAVILY_KEY`, `RESEARCH_EXA_KEY` if unused. Keep `TAVILY_API_KEY`, `EXA_API_KEY`, `FIRECRAWL_API_KEY`, `COMPOSIO_API_KEY`, `COMPOSIO_PRICING_URL` for the raw transports and future agents. |
| E2 | AI provider keys (`AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `DAHL_*`, `SOVEREIGN_*`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`) | **KEEP** | Gateway. |
| E3 | Supabase env | **KEEP** | DB/auth. |
| E4 | Publishing env (`FACEBOOK_*`, `COMPOSIO_*`) | **KEEP** | Publishing. Regression tests must use isolated values. |
| E5 | `package.json` dependencies | **KEEP** | `reactflow` remains for BrainGraph. `@composio/core` remains for publishing. No dependency removal required. |

---

## 5. Exact proposed deletion allowlist

> **Condition:** execute only after owner approval, after the guards/fail-fast in section 8 are in place, and after the data-remediation plan in 9.3 is approved. Do not delete directories recursively; delete the listed files, then remove only verified-empty directories.

### 5.1 Entire retired research implementation (47 files)

```
src/features/research/contracts.ts
src/features/research/policy.ts
src/features/research/observability.ts
src/features/research/ledger/ledger.ts
src/features/research/director/director.ts
src/features/research/director/brief.ts
src/features/research/director/state.ts
src/features/research/agents/market-scout.ts
src/features/research/agents/competitor-intelligence.ts
src/features/research/agents/audience-intelligence.ts
src/features/research/agents/brand-positioning.ts
src/features/research/agents/benchmark-strategy.ts
src/features/research/agents/common.ts
src/features/research/agents/themes.ts
src/features/research/agents/skills/egypt-market-demand-scout/SKILL.md
src/features/research/agents/skills/egypt-competitor-commercial/SKILL.md
src/features/research/agents/skills/egypt-customer-audience/SKILL.md
src/features/research/agents/skills/egypt-brand-positioning/SKILL.md
src/features/research/agents/skills/egypt-benchmark-strategy/SKILL.md
src/features/research/orchestrator/orchestrator.ts
src/features/research/providers/router.ts
src/features/research/providers/search.ts
src/features/research/providers/firecrawl.ts
src/features/research/providers/composio.ts
src/features/research/providers/normalize.ts
src/features/research/providers/types.ts
src/features/research/providers/health.ts
src/features/research/providers/osm.ts
src/features/research/providers/egypt-official.ts
src/features/research/references/entity-qualification.ts
src/features/research/references/entity-resolution.ts
src/features/research/references/geography.ts
src/features/research/references/lexicon.ts
src/features/research/references/pricing.ts
src/features/research/references/rubric.ts
src/features/research/references/source-registry.ts
src/features/research/synthesis/evidence-audit.ts
src/features/research/synthesis/report.ts
src/features/research/synthesis/markdown.ts
src/features/research/brain/proposals.ts
src/features/research/deliverable/pdf.ts
src/features/research/canvas/graph.ts
src/server/research/runner.ts
src/server/research/ai-profiler.ts
src/server/research/pdf.ts
src/server/research/storage.ts
src/server/research/providers.ts
```

After the raw transports are moved (R44/A11), `src/server/research/` is empty and may be removed. `src/features/research/` is empty and may be removed.

### 5.2 Retired execution and intelligence files

```
src/server/task-backend.ts
src/features/orchestrator/director-handoff.ts
src/lib/deliverableMarkdown.ts
src/lib/deliverableRouting.ts
src/components/chat/AgentCanvas.tsx
src/lib/chatCanvasStorage.ts
src/features/roadmap/RoadmapResearchPanel.tsx
src/server/roadmap/proposal.ts
```

### 5.3 Retired tests

```
tests/research/intelligence.test.ts
tests/research/pricing.test.ts
tests/research/providers.test.ts
tests/research/qualification.test.ts
tests/research/report-integrity.test.ts
```

### 5.4 Directories that become empty (remove only after verification)

```
src/features/research/
src/server/research/
src/features/research/agents/skills/
```

Do **not** remove `src/features/roadmap/`, `src/features/tasks/`, `src/features/orchestrator/`, `src/features/admin/`, `src/server/publishing/`, `src/server/observability/`, or `src/server/admin/`.

### 5.5 Pre-deletion verification gates

```bash
# No importer of the retired research implementation
! grep -rn "features/research\|server/research" src --include='*.ts' --include='*.tsx' | grep -v '^src/features/research/\|^src/server/research/'

# No retired execution path
! grep -rn "backend.research\|runMarketingResearch\|createResearchDirector\|explicitResearchRequest\|inferResearchMode\|routeRequest" src

# No content/campaign/diagnosis operations
! grep -rn "'copy'\|'campaign'\|'diagnose'\|'research'\|'analyze'\|'clarify'\|'research_profile'\|'research_director'\|'research_subagent'\|'research_synthesis'" src/config/ai-models.ts src/server/ai/operations.ts src/lib/agents.ts

# No retired deliverable/canvas helpers
! grep -rn "deliverableMarkdown\|deliverableRouting\|chatCanvasStorage\|AgentCanvas" src

# No OSM/official
! grep -rn "osmNearby\|officialPage\|createOsmProvider\|createEgyptOfficialProvider" src

# No retired roadmap research client
! grep -rn "startQuestionResearch\|RoadmapResearchPanel\|generateQuestionProposal" src
```

### 5.6 Explicitly NOT in the allowlist

- `.agents/skills/**` — development/Coding Agent skills. **Do not touch.**
- `src/server/integrations/web-providers.ts` — raw transports preserved.
- `src/server/observability/**`, `src/server/admin/**`, `src/features/admin/**`.
- `src/server/publishing/**`, `src/app/api/connections/facebook/**`.
- `src/features/roadmap/**` except `RoadmapResearchPanel.tsx` and the research/step-task client functions.
- `src/server/roadmap/**` except `proposal.ts`.
- `src/features/tasks/**` (reduced), `src/server/task-executor.ts` (reduced), `src/server/task-dispatcher.ts` (modified).
- `src/screens/DeliverablesPage.tsx`, `src/screens/CalendarPage.tsx`, `src/screens/BrainPage.tsx`.
- All migrations and DB records.

---

## 6. Exact preservation list

### 6.1 Security and workspace isolation

- `src/server/auth.ts`, `src/app/auth/callback/route.ts`, `src/hooks/useRedirectIfAuthenticated.ts`, `src/lib/authRouting.ts`, `src/server/admin/auth.ts`, `src/server/admin/identity.ts`.
- All 48 migrations, RLS, `auth.uid()` checks, workspace-scoped RPCs.

### 6.2 Business Brain

- `src/features/orchestrator/brain-tool.ts`.
- `src/server/orchestrator/gateway-server.ts` Brain reader.
- `src/screens/BrainPage.tsx`, `src/components/brain/*` (including `ResearchProposalReview` for historical `research_proposals`), `src/lib/brainApi.ts`, `src/lib/brainGraphLayout.ts`.
- DB: `brain_nodes`, `brain_edges`, `brain_proposals`, `brain_audit_log`, `research_proposals`.

### 6.3 Conversations and messages

- `src/app/api/conversations/route.ts`, `src/lib/chat-title.ts`, `src/server/chat-title.ts`, `src/lib/types.ts` (`ChatMessage`, `MessageRole`, `MessageType`).
- DB: `conversations`, `messages`, `conversation_events`, `agent_events`, `orchestrator_runs`.

### 6.4 Deliverables and immutable versions

- `src/screens/DeliverablesPage.tsx`, `src/components/chat/DeliverableOfferCard.tsx`, `src/server/deliverable-offers.ts`, `src/lib/types.ts` (`Deliverable`, `DeliverableVersion`).
- DB: `deliverables`, `deliverable_versions`, `deliverable_offers`.
- Historical `research_report`/`content_posts`/`content_calendar`/`performance_diagnosis` documents remain viewable.

### 6.5 Calendar and planned posts

- `src/screens/CalendarPage.tsx`, `src/components/CalendarMonth.tsx`, `DayDetailModal.tsx`, `PostDetailModal.tsx`, `src/lib/calendar.ts`, `src/components/chat/PostPreview.tsx`.
- DB: `planned_posts`, `posts`, `calendar_*`.

### 6.6 Facebook and Composio publishing

- `src/server/publishing/**`, `src/components/publishing/PublishingDecisionCard.tsx`.
- `src/app/api/connections/facebook/**`, `src/components/settings/FacebookConnectionCard.tsx`, `src/screens/SettingsPage.tsx`.
- DB: `facebook_connections`, `posts`, `publish_attempts`; publishing RPCs.

### 6.7 AI gateway and provider configuration

- `src/server/ai-generate.ts` (trimmed), `src/server/call-ai.ts`, `src/server/ai/crawl-prompts.ts`, `src/server/crawl.ts`, `src/config/ai-models.ts` (trimmed), `src/lib/agents.ts` (trimmed).
- Provider keys and fallback/BYOK/key-management.

### 6.8 Raw Tavily, Exa, Firecrawl, Composio transports

- `src/server/integrations/web-providers.ts` (new): `firecrawlScrape`, `tavilySearch`, `exaSearch`, `composioRun`, `composioInstantPrice`.
- `src/server/siteReader.ts` imports `firecrawlScrape` from the new module.
- No research adapters, evidence normalization, or provider health logic.

### 6.9 Onboarding and website crawling

- `src/screens/Onboarding.tsx`, `src/server/crawl.ts`, `src/server/siteReader.ts`, `src/server/crawlStorage.ts`, `src/lib/crawl.ts`, `src/lib/crawlContent.ts`, `src/lib/crawlConstants.ts`, `src/app/api/crawl/route.ts`.
- DB: `sources`, `source_claims`, `brain_nodes` (crawler-approved).

### 6.10 Generic task lifecycle

- `src/server/task-executor.ts` (fail-fast), `src/server/task-dispatcher.ts`, `src/features/tasks/{types,runner,TaskRunnerProvider}` (reduced), `src/app/api/tasks/route.ts` (guarded).
- DB: `tasks`, `task_results`, `task_events`, `task_steps`; task RPCs. Leases, heartbeats, checkpoints, cancellation, recovery remain available for historical/generic use, but no intelligence executes.

### 6.11 Generic resource accounting

- DB: `free_tier_allowance`, `provider_usage`; `reserve_provider_call`, `settle_provider_call`, `release_provider_call`, `research_policy_checks`; task `allowance`/`consumption` columns.
- The research-specific `FreeTierLedger` class is removed. No caller remains. If the owner requires a generic ledger class now, that is a separate future implementation, not preservation of old code.

### 6.12 Admin observability

- `src/server/observability/**`, `src/server/admin/**`, `src/features/admin/**`, `src/app/api/admin/**`, `src/app/[lang]/admin/**`.
- DB: `agent_events`, `task_steps`, admin trace tables/RPCs.

### 6.13 Roadmap

- `src/features/roadmap/**` except `RoadmapResearchPanel.tsx` and the research/step-task client functions.
- `src/server/roadmap/{adapt,generator,revisions}.ts`, `src/app/api/roadmap/route.ts` (guarded), `src/screens/RoadmapPage.tsx`, `src/components/roadmap/*`.
- DB: roadmap/Discovery tables/RPCs. Option A: no new Ask my Director research; no redesign.

### 6.14 Unrelated product functionality

- Auth screens, settings, navbar, home, onboarding, admin, notifications, Brain, Calendar, Deliverables, publishing, roadmap (non-research).

---

## 7. File-level and function-level dependency analysis

### 7.1 External importers of the retired research implementation

| Module | Imported by |
|---|---|
| `features/research/contracts` | `features/orchestrator/director-handoff.ts`, `features/tasks/types.ts`, `server/task-backend.ts`, `server/task-executor.ts` |
| `features/research/orchestrator/orchestrator` | `server/task-executor.ts` |
| `features/research/director/director` | `server/research/storage.ts`, `features/research/synthesis/evidence-audit.ts`, `features/research/brain/proposals.ts` |
| `features/research/synthesis` | `server/research/runner.ts`, `server/research/storage.ts` |
| `features/research/providers` | `server/research/runner.ts`, `server/research/providers.ts`, `server/siteReader.ts` (only `firecrawlScrape`) |
| `features/research/canvas/graph` | `components/chat/AgentCanvas.tsx` |
| `server/research/providers` | `server/siteReader.ts` (only `firecrawlScrape`) |
| `server/research/runner` | `server/task-backend.ts` |
| `server/research/ai-profiler` | `server/task-backend.ts`, `server/research/runner.ts` |
| `server/research/pdf` | `server/research/runner.ts` |
| `server/roadmap/proposal` | `server/task-backend.ts` |

### 7.2 Per-removal dependency matrix

| Removal | Direct importers | Runtime callers | Shared types | API routes | DB RPCs | UI | Tests | Required replacement/isolation |
|---|---|---|---|---|---|---|---|---|
| `features/research/**` | task-executor, task-backend, director-handoff, tasks/types, AgentCanvas, siteReader (firecrawl only) | task executor generate/research | `ResearchArtifacts`, `ResearchMode`, `WorkerClaim`, `EventSink`, `ResearchReport`, `ResearchProposal` | `/api/tasks` | `save_research_result`, `record_research_event`, `reserve/settle/release_provider_call` | canvas, deliverable card | `tests/research/*`, e2e 03 | Delete all; reduce tasks types; remove task-backend; remove canvas; relocate raw transports; reduce task executor to fail-fast. |
| `server/research/**` | task-backend, runner (internal), siteReader (firecrawl) | task executor research | `BusinessProfile`, `ResearchRunResult` | `/api/tasks` | research RPCs | canvas/deliverable | e2e 03 | Delete; move raw transports to `server/integrations/web-providers.ts`. |
| `task-backend.ts` | task-executor, task-dispatcher (via `TaskBackend`) | task executor | `TaskBackend`, `TaskContext` | `/api/tasks` | research RPCs | none | e2e 03 | Remove; reduce `TaskBackend` to a minimal `rpc`/`list` interface or remove it from the fail-fast. |
| `director-handoff.ts` | gateway | orchestrate | `RouteDecision`, `DirectorHandoff` | `/api/tasks` `orchestrate` | `enqueue_task` | canvas | e2e 03 | Remove; gateway returns unavailability. |
| `deliverableMarkdown.ts` | task-executor | generate | `TaskOutput` | none | `save_task_result` | deliverable card | none | Remove; no new deliverables from tasks. |
| `deliverableRouting.ts` | task-executor | generate | `TaskIntent` | none | `save_task_result` | deliverable offer | none | Remove. |
| `AgentCanvas.tsx` | EmployeePage | canvas | `PersistedEvent`, `CanvasPreviewPost` | `/api/tasks` refresh | `agent_events` | canvas | e2e 03 | Remove; no new Canvas; historical events in DB/admin. |
| `chatCanvasStorage.ts` | AgentCanvas, EmployeePage | canvas | `Viewport`, `XYPosition` | none | none | canvas | none | Remove. |
| `RoadmapResearchPanel.tsx` | EmployeePage | wizard_question panel | `QuestionResearchLoad` | `start_question_research`, `decide_question_research` | `question_research_links` | panel | e2e 03 | Remove; disable Ask my Director. |
| `server/roadmap/proposal.ts` | task-backend | questionProposal | `QuestionProposal` | none | `save_question_research_proposal` | panel | none | Remove. |
| `startQuestionResearch` (client) | DiscoveryWizard, RoadmapResearchPanel | Ask my Director | `StartResearchResult` | `start_question_research` | `question_research_links` | wizard | e2e 03 | Remove/guard; show honest disabled state. |
| `startRoadmapStepTask` (client) | Roadmap UI | step delegation | `StartStepTaskResult` | `start_roadmap_step_task` | `roadmap_steps` | roadmap | e2e? | Guard/disable; restore step status. |

### 7.3 Function-level changes for partially retained files

| File | Remove | Keep |
|---|---|---|
| `src/features/orchestrator/gateway.ts` | `planDirectorHandoff`, `handoffCheckpoint`, `TaskOrigin`, `submitTask`, `enqueueTask`, `path==='task'` enqueue | guardrails, Brain path, idempotency, metrics, events, messages; add deterministic unavailability branch. |
| `src/features/orchestrator/contracts.ts` | `ResearchMode`, `isResearchMode`, `researchMode`, `auditor`/`synthesis` roles | decision shape, `isDirectorIntent`. |
| `src/features/orchestrator/decision.ts` | `researchMode` | normalizer. |
| `src/features/orchestrator/prompt.ts` | task intents, `researchMode`, research/content/campaign/diagnosis examples | conversational/Brain prompt; unsupported-task instruction. |
| `src/server/task-executor.ts` | all imports from research, `deliverableRouting`, `deliverableMarkdown`, `calendar`, `lib/agents`, research types; route/generate/parse/research/questionProposal branches | `runTask` fail-fast; `fail_task`; wizard/roadmap status handling; trace. |
| `src/server/task-dispatcher.ts` | research batching | lease/heartbeat/trace/cancel/poll; `slice(0,2)`. |
| `src/features/tasks/types.ts` | research imports/types, `RouteDecision`, `TaskOutput`, `TaskContext`, `TaskCheckpoint`, `ResearchRunResult`, `researchMode` | minimal `ExecutionTask`; keep `TaskStatus`/`TaskOrigin` imports. |
| `src/features/tasks/runner.ts` | `orchestrate`/`resume`/`answer` (or make them throw) | `refresh`, `cancel`, task list. |
| `src/app/api/tasks/route.ts` | `submit`/`resume`/`answer` execution | `refresh`, `cancel`, `list`; `orchestrate` returns direct/unavailability and never enqueues. |
| `src/server/ai/operations.ts` | `route`, `copy`, `campaign`, `diagnose`, `clarify`, `research`, `analyze`, `research_profile` | `chat`, `title`, `roadmap*`; validator updates. |
| `src/config/ai-models.ts` | dead cases and model entries | `orchestrator`, `fastChat`, `router`, `roadmap`, `onboardingCrawl`. |
| `src/lib/agents.ts` | dead union members | `chat`, `roadmap*`. |
| `src/server/ai-generate.ts` | `'diagnose'`, `'analyze'` from jsonMode | provider dispatch/fallback. |
| `src/screens/EmployeePage.tsx` | task/canvas/deliverable-offer/progress/continuation code | chat, conversation history, Brain Q&A, send to Orchestrator, link to Deliverables. |
| `src/features/roadmap/api.ts` | research + step-task functions | roadmap load/generate/status/checkin/revision functions. |
| `src/features/roadmap/DiscoveryWizard.tsx` | Ask my Director call/button | Discovery questions/drafts/answers. |
| `src/app/api/roadmap/route.ts` | `startStepTask` execution | `load`, `setStepStatus`, `generate`, `proposeRevision`, `evaluateCheckin`. |
| `src/server/siteReader.ts` | import from `./research/providers` | import from `./integrations/web-providers`; all crawl logic. |
| `src/server/roadmap/adapt.ts`, `generator.ts`, `revisions.ts` | none | roadmap generation/revision. |
| `src/lib/types.ts` | none (optional: trim unused `AgentEvent` if no consumer) | Brain, Deliverable, Post, Message types. |
| `src/lib/contracts.ts` | none | `TaskOrigin`, `TaskStatus`. |
| `src/features/admin/format.ts` | none | historical event mapping. |

---

## 8. Required compatibility changes

These are prerequisites for deletion. They are specified for the execution phase; none are implemented now.

| ID | Change | Files | Exact behavior |
|---|---|---|---|
| C1 | Honest unsupported-task response in the Orchestrator | `src/features/orchestrator/gateway.ts`, `prompt.ts`, new `src/features/orchestrator/unavailable.ts` (small message constants) | Export EN/AR `CAPABILITY_UNAVAILABLE` messages. If `decision.path === 'task'` (or the model classifies a task intent), record orchestrator events, record the user message, record the assistant reply, return `finish('direct','direct',null,messageId,reply,baseMetrics)`. Do **not** enqueue a task, create a deliverable, or write a post. |
| C2 | Task API anti-bypass | `src/app/api/tasks/route.ts` | `orchestrate`: never enqueue; return a direct/Brain/unavailability reply. `submit`: 409 `{error:'TASK_EXECUTION_UNAVAILABLE'}`. `resume`: 409. `answer`: 409. `cancel`: keep. `refresh`: keep. `list`: keep. Add a server-side assertion that no `enqueue_task` call occurs in the orchestrate path. |
| C3 | Task fail-fast | `src/server/task-executor.ts`, `src/server/task-dispatcher.ts`, `src/features/tasks/types.ts` | `runTask` loads the task and calls `fail_task` with `failure_code='capability_unavailable'`, `message='Employee intelligence is being rebuilt. This capability is temporarily unavailable.'`, and `result_summary` equal to the same message. Never call `save_task_result`, `complete_task`, or any generation function. The dispatcher still claims/heartbeats/cancels. |
| C4 | Roadmap Ask my Director disabled | `src/features/roadmap/api.ts`, `DiscoveryWizard.tsx`, `EmployeePage.tsx`, `RoadmapResearchPanel.tsx` | Remove `startQuestionResearch`/`clearResearchKey`/`loadQuestionResearch`/`decideQuestionResearch` and the panel. In `DiscoveryWizard`, replace the "Ask my Director" action with a disabled state and an honest message. Do not call `start_question_research`. |
| C5 | Wizard-question task/link cleanup | `src/server/task-executor.ts` | If `task.origin.kind === 'wizard_question'` and the task is failed: fetch the `question_research_links` row for `origin.researchLinkId`, call `decide_question_research` with `p_action='fail'`, `p_expected_version=link.version`, `p_note='Employee intelligence is being rebuilt.'`. This restores the Discovery question's previous status and marks the link `failed`. Then `fail_task`. |
| C6 | Roadmap step-task cleanup | `src/server/task-executor.ts`, `src/app/api/roadmap/route.ts` | `startStepTask` returns 409 before calling `start_roadmap_step_task`. If a crafted call creates a `roadmap_step` task, `runTask` fails it and restores the step status to `planned` (or the previous status recorded in `audit_log`) with an audit entry `roadmap.step_unavailable`. Do not leave `roadmap_steps.status='running'`. |
| C7 | Raw transport relocation | New `src/server/integrations/web-providers.ts`; `src/server/research/providers.ts`; `src/server/siteReader.ts` | Move only `firecrawlScrape`, `tavilySearch`, `exaSearch`, `composioRun`, `composioInstantPrice`. Delete `officialPage`, `osmNearby`. Update `siteReader` import. No research types, evidence normalization, or provider health. |
| C8 | Generic task client reduced | `src/features/tasks/runner.ts`, `TaskRunnerProvider.tsx`, `EmployeePage.tsx` | Keep `refresh`, `cancel`, task list. Remove or hard-disable `orchestrate`, `resume`, `answer`. EmployeePage no longer renders task progress, canvas, or deliverable offers; it renders chat/Brain and links to Deliverables. |
| C9 | Remove old Canvas | `src/components/chat/AgentCanvas.tsx`, `src/lib/chatCanvasStorage.ts`, `src/screens/EmployeePage.tsx` | Delete the component and storage; remove imports/usage. Do not build a replacement. `reactflow` remains for `BrainGraph`. Historical events remain in `agent_events` and admin. |
| C10 | Skills boundary | `src/features/research/agents/skills/**` | Delete only the five Employee skill files. Do **not** touch `.agents/skills/**`. Do not author replacement skills. The future implementation only provides registration/dynamic loading. |
| C11 | Type-checked tests | New `tsconfig.test.json`; `package.json`; all tests | Add `typecheck:tests` (`tsc -p tsconfig.test.json --noEmit`). Include `tests/**/*.ts`, `e2e/**/*.ts`, `playwright.config.ts`, `src/**/*.ts(x)`. Remove `tests/research` globs; add the new test globs. Fix all type errors in retained tests. Do not weaken assertions to make them pass. |
| C12 | Publishing test isolation | `e2e/specs/05-publishing.spec.ts`, `scripts/*e2e*`, `.env.e2e*` | Use a dedicated Supabase project and a test Facebook app/page. Mock the Graph API at the `fetch` boundary or use a sandbox. Never use production credentials. Assert `publish_attempts` in the isolated DB. Fail the test if `NODE_ENV=production` or the page id matches production. |
| C13 | Data remediation for stuck records | Reviewed SQL/script in the execution phase (not now) | Mark queued/running/awaiting_input Employee tasks `failed` via `fail_task`; mark `researching` links `failed` via `decide_question_research`; restore `roadmap_steps` `running` to `planned`/previous status with audit. No deletes. Record previous status in `result_summary`/`audit_log` before updating. |
| C14 | `.env.example`/docs | `.env.example`, `PROJECT_CONTEXT.md`, `README.md` | Remove research/PDF-only vars; keep raw transport/provider/publishing vars. Document the temporary unavailability and Roadmap Option A. |
| C15 | Remove dead model operations | `src/config/ai-models.ts`, `src/server/ai/operations.ts`, `src/lib/agents.ts`, `src/server/ai-generate.ts`, `scripts/bench-orchestrator.ts` | Remove the operations and model entries listed in 4.3; remove `researchMode` from bench fakes. |

---

## 9. Database and user-data safety assessment

### 9.1 No schema changes

- All 48 migrations are preserved.
- No `DROP TABLE`, `TRUNCATE`, `DELETE`, or column removal.
- No migration is edited or squashed.
- Research tables/RPCs remain dormant.

### 9.2 No data deletion

- Historical research reports/claims/proposals/sources remain.
- Historical deliverables/versions/offers remain.
- Historical tasks/runs/checkpoints/events remain.
- Conversations/messages remain.
- Brain/Calendar/Publishing/Roadmap data remain.

### 9.3 Required status remediation (execution phase, separate approval)

The owner requires that affected tasks and question links do not remain stuck. This requires **status updates**, not deletes. It is a data change and must be separately approved and reviewed.

| Record | Current state | Target state | Method | Reversibility |
|---|---|---|---|---|
| Employee tasks `queued` | waiting | `failed` | `fail_task` with `capability_unavailable` | Previous status recorded in `result_summary`/`task_results`; can be restored manually. |
| Employee tasks `running` | active run | `failed` | `fail_task`; release lease | Run/checkpoint history remains; status can be restored manually. |
| Employee tasks `awaiting_input` | paused | `failed` | `fail_task`; no question answer | Previous status recorded; can be restored. |
| `question_research_links` `researching` | waiting on research | `failed` | `decide_question_research(p_action='fail')` | Restores Discovery question to previous status; audit records the failure. |
| `roadmap_steps` `running` with a failed task | waiting on task | `planned` (or previous status from `audit_log`) | `set_roadmap_step_status` or reviewed SQL; audit entry `roadmap.step_unavailable` | Previous status may be inferred from `audit_log`; if unavailable, set `planned` and record that assumption. |
| Historical `completed`/`failed`/`partial`/`cancelled` tasks | terminal | unchanged | none | N/A |
| `deliverable_offers` pending | historical | unchanged | none | N/A |

**No record is deleted.** The only irreversible part is that the exact previous status of a `roadmap_steps` row may not be recoverable if it was not audited; the remediation records the assumption.

### 9.4 Historical UI behavior

- Brain `ResearchProposalReview` remains for historical `research_proposals`.
- Deliverables page remains for historical `research_report`/`content_*`/`performance_diagnosis` documents.
- Admin traces remain for historical research events.
- The Employee Canvas is removed; historical events are visible only in admin/DB.
- Calendar/Publishing remain unchanged.

---

## 10. Cleanup execution order

### Phase 0 — Approval and record
1. Obtain owner approval for this plan, C13 data remediation, and the irreversible no-backup consequence.
2. Record `git rev-parse HEAD`, `git status --short`, and the baseline checks in the review ticket. Do **not** create a backup.
3. Confirm the retired/unrelated split in 2.3.

### Phase 1 — Tests first (type-checked)
1. Add `tsconfig.test.json` and `typecheck:tests`; confirm the current tests type-check or list the failures.
2. Add C1/C2/C3/C4/C5/C6 tests: unavailability response, anti-bypass, fail-fast, wizard-link failure, step restore, Discovery disabled.
3. Add C12 isolated publishing test (mock Graph API).
4. Remove `tests/research/*` only after the code they cover is deleted (or in the same phase).

### Phase 2 — Guards and fail-fast
1. C1: Orchestrator unavailability.
2. C2: tasks API anti-bypass.
3. C3: task executor fail-fast + minimal types.
4. C4–C6: Roadmap disable + link/step handling.
5. C7: relocate raw transports; update `siteReader`.
6. C8–C9: reduce task client; remove Canvas.
7. C10: delete Employee skills only.
8. C11/C15: type-check tests; remove dead operations/models.
9. Run `npx tsc --noEmit`, `npm run lint`, `npm run typecheck:tests`, `npm run test:unit`. All must pass before deletion.

### Phase 3 — Delete retired files
1. Run the 5.5 gates.
2. Delete 5.1, 5.2, 5.3.
3. Remove verified-empty directories in 5.4.
4. Run `npx tsc --noEmit`, `npm run lint`, `npm run typecheck:tests`, `npm run test:unit`.

### Phase 4 — Data remediation (separate approval)
1. Run the reviewed status-update script from 9.3.
2. Verify no `queued`/`running`/`awaiting_input` Employee tasks remain; no `researching` question links remain; no `running` roadmap steps remain.
3. Do not delete records.

### Phase 5 — Verification
1. `npx tsc --noEmit` → 0.
2. `npm run lint` → 0 errors.
3. `npm run typecheck:tests` → 0.
4. `npm run test:unit` → all pass.
5. `npm run test:db:local` → pass.
6. `npm run build` → pass.
7. Run the 5.5 gates.
8. Run e2e 01–05 (publishing isolated).
9. Stop and await approval. Do not commit or push.

---

## 11. Backup and rollback strategy (owner-directed: no backup)

### 11.1 No backup will be created

The owner has explicitly **not** authorized:
- legacy directories;
- backup source directories;
- worktree archives;
- Git bundles;
- duplicate retired implementations;
- disabled copies of obsolete intelligence modules.

This plan therefore creates **no backup, archive, bundle, worktree, or compatibility copy**.

### 11.2 Irreversible consequences (reported before execution)

| Consequence | Detail | Owner action if unacceptable |
|---|---|---|
| Uncommitted retired code is permanently lost | The staged/unstaged retired research/intelligence changes (15 `src/features/research` files, 5 `tests/research` files, 3 `src/server/research` files, plus task/ai/roadmap-research hunks) are not in HEAD. Deleting them cannot be undone without a backup. | Commit the current work to a **new branch** before execution (this does not rewrite history). The plan does not do this. |
| Status remediation loses exact previous state | `fail_task` and `decide_question_research` overwrite status. The previous status is recorded in `result_summary`/`audit_log` where possible; roadmap step previous status may be inferred. | Approve C13 and review the remediation script before running it. |
| No rollback for uncommitted deletions | Only committed files can be recovered from Git history. | Rely on the owner's new-branch commit, or accept the loss. |
| No Git history rewrite | The plan does not reset, rebase, amend, or force-push. | N/A. |
| No DB deletes | No records, migrations, user data, credentials, or unrelated uncommitted work are deleted. | N/A. |

### 11.3 Rollback rules

- Do **not** run `git reset --hard`, `git clean -fdx`, `git checkout -- .`, `git stash`, `git rebase`, or `git push --force`.
- For committed files, use `git revert <commit>` if a commit was approved.
- For uncommitted deletions, there is no rollback. This is the irreversible consequence above.
- For DB status remediation, restore from the recorded previous status/audit if needed; no data was deleted.

### 11.4 Unrelated work protection

- Do not delete or overwrite `src/features/roadmap/**` except `RoadmapResearchPanel.tsx` and the research/step-task client functions.
- Do not delete `src/features/roadmap/plan-parse.ts` (untracked) or `tests/roadmap/`.
- Do not revert the staged admin/auth/chat-title/roadmap work.
- Do not touch `.agents/skills/**`.

---

## 12. Clean baseline acceptance criteria

The cleanup is complete only when **all** are true.

### 12.1 No operational legacy intelligence

- [ ] `src/features/research/` does not exist.
- [ ] `src/server/research/` does not exist.
- [ ] `src/server/task-backend.ts` does not exist.
- [ ] `src/features/orchestrator/director-handoff.ts` does not exist.
- [ ] `src/lib/deliverableMarkdown.ts`, `deliverableRouting.ts`, `chatCanvasStorage.ts` do not exist.
- [ ] `src/components/chat/AgentCanvas.tsx` does not exist.
- [ ] `src/features/roadmap/RoadmapResearchPanel.tsx` does not exist.
- [ ] `src/server/roadmap/proposal.ts` does not exist.
- [ ] `tests/research/` does not exist.
- [ ] `grep -rn "features/research\|server/research" src` returns no hits.
- [ ] `grep -rn "backend.research\|runMarketingResearch\|createResearchDirector\|explicitResearchRequest\|inferResearchMode\|routeRequest" src` returns no hits.
- [ ] `grep -rn "'copy'\|'campaign'\|'diagnose'\|'research'\|'analyze'\|'clarify'\|'research_profile'\|'research_director'\|'research_subagent'\|'research_synthesis'" src/config/ai-models.ts src/server/ai/operations.ts src/lib/agents.ts` returns no hits.
- [ ] `grep -rn "osmNearby\|officialPage\|createOsmProvider\|createEgyptOfficialProvider" src` returns no hits.
- [ ] `grep -rn "startQuestionResearch\|RoadmapResearchPanel\|generateQuestionProposal" src` returns no hits.
- [ ] `grep -rn "deliverableMarkdown\|deliverableRouting\|chatCanvasStorage\|AgentCanvas" src` returns no hits.

### 12.2 Honest unsupported behavior

- [ ] A task request returns a deterministic unavailability reply and creates **no** task.
- [ ] `POST /api/tasks` `submit`, `resume`, and `answer` return 409 `TASK_EXECUTION_UNAVAILABLE`.
- [ ] A claimed task is marked `failed` with `capability_unavailable`; never `completed`/`partial`.
- [ ] No deliverable, post, or calendar draft is created for an unsupported request.
- [ ] No "success" text is shown for an unimplemented capability.

### 12.3 Roadmap Option A

- [ ] "Ask my Director" is disabled in the UI and does not call `start_question_research`.
- [ ] `startStepTask` is disabled/guarded and does not leave a step `running`.
- [ ] No `question_research_links` remain in `researching`.
- [ ] No `roadmap_steps` remain in `running` due to a failed task.
- [ ] Roadmap data, versions, Discovery questions, and unrelated actions remain.

### 12.4 Canvas

- [ ] The old Canvas component and storage are removed.
- [ ] No new Canvas is built.
- [ ] Retired workers are not rendered as AI agents.
- [ ] Historical `agent_events` remain in DB/admin.

### 12.5 Preservation

- [ ] Authentication/workspace isolation/RLS unchanged.
- [ ] All 48 migrations present and unmodified.
- [ ] Brain data/approvals unchanged.
- [ ] Conversations/messages unchanged.
- [ ] Deliverables/versions unchanged.
- [ ] Calendar/planned posts unchanged.
- [ ] Facebook/Composio publishing unchanged.
- [ ] AI gateway/provider config unchanged except removed dead operations.
- [ ] Raw Tavily/Exa/Firecrawl/Composio transports preserved.
- [ ] Onboarding/crawling works.
- [ ] Generic task lifecycle/leases/checkpoints/cancellation/recovery remains.
- [ ] Generic resource accounting DB/RPCs remain.
- [ ] Admin observability remains.
- [ ] Historical execution records remain.

### 12.6 Build and tests

- [ ] `npx tsc --noEmit` → 0.
- [ ] `npm run lint` → 0 errors.
- [ ] `npm run typecheck:tests` → 0.
- [ ] `npm run test:unit` → all pass.
- [ ] `npm run test:db:local` → pass.
- [ ] `npm run build` → pass.
- [ ] Publishing tests run isolated; no real Facebook content.

### 12.7 No data loss

- [ ] No `DROP TABLE`, `TRUNCATE`, or `DELETE`.
- [ ] No migration edited/removed.
- [ ] No unrelated uncommitted work deleted.
- [ ] No backup/archive/bundle/worktree created.

---

## 13. Regression tests required after cleanup

### 13.1 Automated

```bash
npx tsc --noEmit
npm run lint
npm run typecheck:tests
npm run test:unit
npm run test:db:local
npm run build

# No retired intelligence
! grep -rn "features/research\|server/research" src
! grep -rn "backend.research\|runMarketingResearch\|createResearchDirector\|explicitResearchRequest\|inferResearchMode\|routeRequest" src
! grep -rn "'copy'\|'campaign'\|'diagnose'\|'research'\|'analyze'\|'clarify'\|'research_profile'\|'research_director'\|'research_subagent'\|'research_synthesis'" src/config/ai-models.ts src/server/ai/operations.ts src/lib/agents.ts
! grep -rn "osmNearby\|officialPage\|createOsmProvider\|createEgyptOfficialProvider" src
! grep -rn "startQuestionResearch\|RoadmapResearchPanel\|generateQuestionProposal" src
! grep -rn "deliverableMarkdown\|deliverableRouting\|chatCanvasStorage\|AgentCanvas" src
```

### 13.2 Unit tests

| Test | Purpose |
|---|---|
| `tests/orchestrator/unavailable.test.ts` | Task request → no task, EN/AR honest reply, no deliverable/post. |
| `tests/tasks/unavailable.test.ts` | `submit`/`resume`/`answer` 409; fail-fast marks queued/running failed; wizard link failed; roadmap step restored. |
| `tests/roadmap/discovery-disabled.test.ts` | Ask my Director disabled; no RPC; Discovery question unchanged. |
| `tests/publishing/isolated.test.ts` | Mock Graph API; isolated DB; no real Facebook publish. |
| `tests/admin/auth.test.ts` | Admin auth. |
| `tests/chat/chat-title.test.ts` | Chat title. |
| `tests/roadmap/plan-parse.test.ts` | Roadmap plan parsing. |

### 13.3 End-to-end

| Spec | Expected |
|---|---|
| `01-foundation` | Unchanged; pass. |
| `02-auth` | Unchanged; pass. |
| `03-agents-orchestrator` | Direct/Brain pass. Research/content/campaign/diagnosis scenarios removed. Add: task request → no task, honest reply, no canvas/progress. |
| `04-deliverables-calendar` | Unchanged; pass. Historical deliverables/calendar remain. |
| `05-publishing` | Isolated env, mocked Graph API; no real Facebook content. |

### 13.4 Manual

1. Send a research/content/campaign/diagnosis request: honest unavailability; no task; no deliverable/post.
2. Open a historical conversation with task/canvas messages: chat history renders; no old canvas; historical deliverables remain in Deliverables.
3. Open Brain: historical research proposals reviewable.
4. Open Deliverables: historical research/content documents render.
5. Onboarding: crawl a site; raw Firecrawl transport works.
6. Roadmap: Discovery questions work; Ask my Director disabled; no stuck links/steps.
7. Facebook/Composio: isolated publishing regression only.
8. Admin: historical task traces remain visible.

### 13.5 Test integrity

- Remove tests only for removed features; do not delete assertions for retained features.
- Do not weaken thresholds or skip assertions to make tests pass.
- If a retained feature fails, fix it or report it; do not modify the test to conceal the regression.
- All tests must be type-checked via `typecheck:tests`.

---

## 14. Risks, unresolved dependencies, and remaining legacy intelligence

### 14.1 Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Irreversible loss of uncommitted retired code (no backup) | Certain | High | Owner commits to a new branch before execution, or accepts the loss. Reported in 11.2. |
| R2 | Roadmap step/question stuck if fail-fast misses a path | Medium | High | C5/C6 + C13 status remediation; verify no `running`/`researching` rows remain. |
| R3 | Crafted RPC calls (`enqueue_task`, `resume_task`, `start_question_research`, `start_roadmap_step_task`) bypass UI guards | Medium | High | Fail-fast catches all tasks; optional DB guards in a future migration; document residual risk. |
| R4 | Onboarding breaks if raw Firecrawl transport is not relocated correctly | Low | High | C7; run e2e 02 and a crawl smoke test. |
| R5 | Historical UI references deleted types/components | Medium | Medium | Remove/adjust EmployeePage, roadmap panel, deliverable helpers; run typecheck/build. |
| R6 | Tests not type-checked hide errors | High | Medium | C11 `tsconfig.test.json`; run `typecheck:tests`. |
| R7 | Publishing test accidentally hits real Facebook | Medium | High | C12 isolated env + mocked Graph API + production guard. |
| R8 | Historical `research_proposals`/`deliverables` UI breaks after type removal | Low | Medium | Keep `ResearchProposalReview` local row type; keep generic Deliverable types. |
| R9 | `research_mode`/`TaskIntent` removal breaks historical task reads | Medium | Low | Minimal `ExecutionTask` uses `type: string`; no research types. |
| R10 | Roadmap `proposal.ts` removal breaks an import | Low | Medium | Only `task-backend` imports it; both removed. Grep gate. |
| R11 | `package.json`/untracked `plan-parse.ts` partial commit | High | Medium | Preserve unrelated roadmap files; update test globs deliberately; do not revert. |
| R12 | DBA status remediation is a data change | Certain | Medium | Separate approval; reviewed script; no deletes; record previous status. |
| R13 | Model/provider liveness differs from assumptions | Medium | Medium | Do not change keys; future agent verifies capabilities. |
| R14 | Composio read/publishing operational status unknown | Medium | Medium | Keep raw transports; verify credentials in a non-production check. |

### 14.2 Remaining legacy intelligence code after cleanup

After the deletion allowlist and compatibility changes, the following remain and are **not** retired intelligence:

| Path | Why it remains | Is it operational intelligence? |
|---|---|---|
| `src/features/orchestrator/{gateway,contracts,decision,prompt,guardrails,brain-tool}.ts` | Owner-approved Orchestrator foundation. | No task execution; conversational/Brain only. |
| `src/server/orchestrator/{gateway-server,model}.ts` | Orchestrator transport/Brain reader. | No. |
| `src/server/task-executor.ts` | Generic fail-fast lifecycle. | No; it only fails tasks. |
| `src/server/task-dispatcher.ts` | Generic leases/heartbeats/cancellation. | No. |
| `src/features/tasks/{types,runner,TaskRunnerProvider}` | Generic status/cancel for historical tasks. | No. |
| `src/app/api/tasks/route.ts` | Generic task API with anti-bypass guards. | No. |
| `src/server/ai/{operations,ai-generate,call-ai,crawl-prompts}.ts`, `src/config/ai-models.ts`, `src/lib/agents.ts` | AI gateway, onboarding crawl, Roadmap ops, chat/title. | No Employee intelligence. |
| `src/server/integrations/web-providers.ts` | Raw Tavily/Exa/Firecrawl/Composio transports. | No; infrastructure only. |
| `src/server/observability/**`, `src/server/admin/**`, `src/features/admin/**` | Admin observability. | No. |
| `src/server/publishing/**` | Publishing. | No. |
| `src/features/roadmap/**`, `src/server/roadmap/**` | Roadmap (non-research). | No Employee intelligence; Roadmap generation/revision remains. |
| `src/lib/types.ts` | Historical data types. | No. |
| `src/features/admin/format.ts` | Historical event mapping. | No. |
| `src/screens/DeliverablesPage.tsx` | Historical deliverable filters. | No. |
| `src/app/[lang]/dictionaries/*` | UI strings for historical labels. | No. |

**Explicitly absent after cleanup:** `src/features/research/`, `src/server/research/`, `task-backend.ts`, `director-handoff.ts`, `deliverableMarkdown.ts`, `deliverableRouting.ts`, `AgentCanvas.tsx`, `chatCanvasStorage.ts`, `RoadmapResearchPanel.tsx`, `roadmap/proposal.ts`, `tests/research/`.

### 14.3 Human decisions required before execution

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **D-1** | Approve the no-backup irreversible loss of uncommitted retired code (11.2). | Accept loss / commit current work to a new branch first | Commit to a new branch if the retired work has any value; otherwise accept. |
| **D-2** | Approve C13 status remediation (updates, no deletes). | Approve / defer | Approve; without it, tasks/links remain stuck, violating the owner requirement. |
| **D-3** | Confirm removal of `FreeTierLedger` while keeping DB accounting. | Remove class / keep a generic ledger class | Remove the class (no caller); keep DB/RPC accounting. If a generic class is required now, it is a separate implementation task. |
| **D-4** | Confirm Roadmap `startRoadmapStepTask` is disabled (not redesigned). | Disable / keep with fail-fast only | Disable at the route/client; fail-fast is defense-in-depth. |
| **D-5** | Confirm old Canvas is removed entirely, not replaced with a placeholder. | Remove / minimal placeholder | Remove; no new Canvas. |
| **D-6** | Confirm historical `ResearchProposalReview` remains in Brain. | Keep / hide | Keep; historical approvals remain actionable. |
| **D-7** | Confirm publishing regression uses a mocked Graph API/isolated env. | Mock / dedicated test page | Mock the Graph API; never real publishing. |
| **D-8** | Confirm `enqueue_task`/`resume_task` residual RPC risk is acceptable or a DB guard migration is required. | Accept fail-fast / add DB guard migration | Add a DB guard in the execution phase if the owner wants defense-in-depth; it is a function change, not a redesign. |

---

## Appendix A — Verification evidence (file:line)

| Claim | Evidence |
|---|---|
| Research pipeline has no LLM calls | `grep -rn "generateAi|callAi|ai-generate|fetch(" src/features/research` → no hits. Only `src/server/research/ai-profiler.ts` calls `generateAi` (70, 95, 110). |
| Task executor research branch | `src/server/task-executor.ts:176-203`. |
| Task executor content/campaign/diagnosis generation | `src/server/task-executor.ts` imports `deliverableRouting` (7), `deliverableMarkdown` (8), `calendar` (9); generate branches for `content_creation`/`campaign_planning`/`performance_diagnosis`. |
| Duplicate research router | `src/features/research/orchestrator/orchestrator.ts:5,60,81,101`. |
| Seven dead model operations | `src/config/ai-models.ts:251-252,266-272`; `src/server/ai/operations.ts:17-21`; `src/lib/agents.ts:3`. |
| Content/analysis operations | `src/config/ai-models.ts:254-263` (`copy`, `campaign`, `diagnose`); `src/server/ai/operations.ts:13-15`; `src/lib/agents.ts:3`. |
| Roadmap research entry | `src/features/roadmap/api.ts:198` (`startQuestionResearch` → `start_question_research`); `DiscoveryWizard.tsx:51,729`; `EmployeePage.tsx:41,575`. |
| Roadmap step task entry | `src/features/roadmap/api.ts:302`; `src/app/api/roadmap/route.ts:47`. |
| Roadmap proposal | `src/server/roadmap/proposal.ts:60`; only `task-backend.ts:11,79`. |
| Old Canvas | `src/features/research/canvas/graph.ts:14,19-20,95-97,105`; `src/components/chat/AgentCanvas.tsx`; `src/lib/chatCanvasStorage.ts`. |
| Onboarding raw Firecrawl dependency | `src/server/siteReader.ts:4,296`; `src/server/crawl.ts:8`. |
| `enqueue_task` granted to authenticated | `supabase/migrations/20261124001000_conversation_title_no_raw_request.sql:40-41`. |
| `resume_task` granted to authenticated | `supabase/migrations/20261118028000_task_execution.sql:197-198`. |
| `decide_question_research` failure restores status | `supabase/migrations/20261124002000_roadmap_director_loop.sql:369-460`. |
| Untracked `plan-parse.ts` imported by tracked files | `git ls-files --error-unmatch` → not known; `src/server/roadmap/adapt.ts:6`; `generator.ts:6`. |
| Baseline typecheck/lint/unit | `npx tsc --noEmit` 0; `npm run lint` 0; `npm run test:unit` 41/42. |

## Appendix B — File-count summary after cleanup

| Area | Before | Removed | Retained |
|---|---|---|---|
| `src/features/research` | 42 | 42 (entire directory) | 0 |
| `src/server/research` | 5 | 5 (raw transports relocated to `src/server/integrations/web-providers.ts`) | 0 |
| `src/features/orchestrator` | 8 | 1 (`director-handoff.ts`) | 7 (modified) |
| `src/server` task/ai | — | `task-backend.ts` | task-executor/dispatcher reduced; AI ops/models trimmed |
| `src/lib` | — | `deliverableMarkdown.ts`, `deliverableRouting.ts`, `chatCanvasStorage.ts` | others |
| `src/components/chat` | — | `AgentCanvas.tsx` | MarkdownContent, PostPreview, DeliverableOfferCard |
| `tests/research` | 5 | 5 | 0 |
| `e2e` | 5 specs | 0 | 5 (03/05 modified) |
| Migrations | 48 | 0 | 48 |

## Appendix C — Glossary

- **Retired intelligence:** all Employee research/content/campaign/diagnosis execution logic, prompts, models, contracts, and tests.
- **Infrastructure:** auth, DB/RLS, Brain, conversations, deliverables, calendar, publishing, AI gateway, raw transports, onboarding, generic task lifecycle, resource accounting, admin observability, historical records.
- **Dormant:** a DB object or historical record with no code caller. Dormant data is preserved; dormant intelligence code is not.
- **Fail-fast:** the task executor marks a task `failed` with `capability_unavailable` instead of generating output.
- **Honest unavailability:** an explicit user-visible message that the capability is being rebuilt; no simulated success.

---

**End of revised plan. No code, schema, migration, record, or backup has been created or changed. Execution requires explicit owner approval, approval of C13 status remediation, and acknowledgement of the no-backup irreversible consequence in section 11.2.**