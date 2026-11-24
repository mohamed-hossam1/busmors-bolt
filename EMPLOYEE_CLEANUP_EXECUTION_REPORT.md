# Busmora Employee Intelligence Cleanup — Execution Report

**Status:** Cleanup executed. No production database was touched. No backup was created. No commit or push was made.
**Date:** 2026-11-24
**Branch / HEAD:** `feat/chat-agent` @ `30c30b5` (unchanged)
**AI mode:** `AI_MODE=test` set in the local `.env` (only that line was changed; no credentials were read or exposed).
**Scope authority:** Owner-approved full Employee intelligence cleanup, final decisions D1–D8.

---

## 1. Executive summary

The retired Employee intelligence layer has been removed from the working tree:

- The entire `src/features/research/` directory (42 files) and `src/server/research/` directory (5 files) are gone.
- The deterministic Research Director, five workers, Employee skills, profiler, planning/tracks, modes, lexicon, source registry, entity logic, geography heuristics, rubric, evidence audit, pricing, stop rules, provider orchestration, report/PDF synthesis, OSM, official sources, duplicate router, and research tests are gone.
- The Content Writer, Campaign Planner, Performance Diagnosis, Director handoff, old Agent Canvas/storage, and intent-specific task generation are gone.
- The Orchestrator remains as the conversational/Brain entry point. Any task request returns a deterministic honest unavailability reply and never enqueues a task.
- The generic task lifecycle remains, but a claimed task is failed with `capability_unavailable`; it never calls `save_task_result` or `complete_task`.
- Roadmap Ask my Director and step-task delegation are disabled at the client and API boundary; wizard links and roadmap steps are cleaned up by the fail-fast path.
- Admin observability is preserved; the old Canvas renderer was replaced in the admin trace detail with a plain execution-event list.
- Raw Tavily/Exa/Firecrawl/Composio HTTP transports were relocated to `src/server/integrations/web-providers.ts` and remain server-only.
- A separate additive DB guard migration was prepared (not applied) that revokes direct task-enqueue/resume/answer/result-save/complete and Roadmap task-start RPCs from `authenticated`/`anon`, while service-role and the fail-fast path retain access.
- A local status-remediation script and two local DB acceptance checks were prepared (not executed: no local PostgreSQL).

Verification run: `tsc` 0, `lint` 0 errors, `typecheck:tests` 0, `test:unit` 22/22, `build` 0. `test:db:local` could not run (`DATABASE_URL` not set). E2E could not run (no E2E environment/stack). These are reported explicitly in section 10.

---

## 2. Exact files deleted

The following files were deleted from the working tree. They are all retired intelligence/execution code or tests exclusively covering it.

### Research implementation (42)

```
src/features/research/agents/audience-intelligence.ts
src/features/research/agents/benchmark-strategy.ts
src/features/research/agents/brand-positioning.ts
src/features/research/agents/common.ts
src/features/research/agents/competitor-intelligence.ts
src/features/research/agents/market-scout.ts
src/features/research/agents/skills/egypt-benchmark-strategy/SKILL.md
src/features/research/agents/skills/egypt-brand-positioning/SKILL.md
src/features/research/agents/skills/egypt-competitor-commercial/SKILL.md
src/features/research/agents/skills/egypt-customer-audience/SKILL.md
src/features/research/agents/skills/egypt-market-demand-scout/SKILL.md
src/features/research/agents/themes.ts
src/features/research/brain/proposals.ts
src/features/research/canvas/graph.ts
src/features/research/contracts.ts
src/features/research/deliverable/pdf.ts
src/features/research/director/brief.ts
src/features/research/director/director.ts
src/features/research/director/state.ts
src/features/research/ledger/ledger.ts
src/features/research/observability.ts
src/features/research/orchestrator/orchestrator.ts
src/features/research/policy.ts
src/features/research/providers/composio.ts
src/features/research/providers/egypt-official.ts
src/features/research/providers/firecrawl.ts
src/features/research/providers/health.ts
src/features/research/providers/normalize.ts
src/features/research/providers/osm.ts
src/features/research/providers/router.ts
src/features/research/providers/search.ts
src/features/research/providers/types.ts
src/features/research/references/entity-qualification.ts
src/features/research/references/entity-resolution.ts
src/features/research/references/geography.ts
src/features/research/references/lexicon.ts
src/features/research/references/pricing.ts
src/features/research/references/rubric.ts
src/features/research/references/source-registry.ts
src/features/research/synthesis/evidence-audit.ts
src/features/research/synthesis/markdown.ts
src/features/research/synthesis/report.ts
```

### Research server (5)

```
src/server/research/ai-profiler.ts
src/server/research/pdf.ts
src/server/research/providers.ts
src/server/research/runner.ts
src/server/research/storage.ts
```

### Retired execution / intelligence (8)

```
src/components/chat/AgentCanvas.tsx
src/features/orchestrator/director-handoff.ts
src/features/roadmap/RoadmapResearchPanel.tsx
src/lib/chatCanvasStorage.ts
src/lib/deliverableMarkdown.ts
src/lib/deliverableRouting.ts
src/server/roadmap/proposal.ts
src/server/task-backend.ts
```

### Retired tests (5)

```
tests/research/intelligence.test.ts
tests/research/pricing.test.ts
tests/research/providers.test.ts
tests/research/qualification.test.ts
tests/research/report-integrity.test.ts
```

**Directories removed:** `src/features/research/` and `src/server/research/` no longer exist. `src/features/research/agents/skills/` is gone with its five Employee SKILL.md files. `.agents/skills/` was not touched.

---

## 3. Exact files modified

### 3.1 Modified by this cleanup

| File | Change |
|---|---|
| `src/config/ai-models.ts` | Removed `contentWriter`, `campaignPlanner`, `performanceAnalyst`, `researchDirector`, `researchSubagent`, `researchSynthesis`; removed the `openai/gpt-oss-20b` test fallback so test mode only allows Groq `openai/gpt-oss-120b` and Dahl `deepseek-ai/DeepSeek-V4-Flash-0731`; removed dead operation cases. |
| `src/server/ai/operations.ts` | Removed `route`, `clarify`, `research`, `copy`, `campaign`, `diagnose`, `analyze`, `research_profile`; kept `orchestrate`, `brain_answer`, `chat`, `title`, `roadmap*`; updated `validateOutput`. |
| `src/lib/agents.ts` | Reduced `AiOperation` to `chat`, `roadmap`, `roadmap_answer`, `roadmap_revision`, `roadmap_checkin`. |
| `src/server/ai-generate.ts` | Removed `analyze` from the JSON-mode allowlist. |
| `src/features/orchestrator/contracts.ts` | Removed `ResearchMode`, `isResearchMode`, `researchMode`, `auditor`/`synthesis` roles, and `directorHandoffMs`. |
| `src/features/orchestrator/decision.ts` | Removed `researchMode` normalization. |
| `src/features/orchestrator/prompt.ts` | Removed task execution promises and `researchMode`; added `capabilityUnavailableReply` EN/AR and honest unsupported instructions. |
| `src/features/orchestrator/gateway.ts` | Removed the Director handoff, `HandoffContext`/`HandoffResult`, and task enqueue. Task decisions now return an honest unavailability reply and never enqueue. |
| `src/server/orchestrator/gateway-server.ts` | Removed task submission/handoff wiring and `planDirectorHandoff` re-export; kept Brain reader, idempotency, metrics, trace. |
| `src/features/tasks/types.ts` | Reduced to a minimal `ExecutionTask`; removed research/result/checkpoint contracts and `ResearchArtifacts`/`ResearchMode` imports. |
| `src/server/task-executor.ts` | Replaced the route/generate/persist intelligence with a generic fail-fast: `stop_task(... 'failed', CAPABILITY_UNAVAILABLE)`, wizard-link failure, and roadmap-step restoration. Never calls `save_task_result`/`complete_task`. |
| `src/server/task-dispatcher.ts` | Removed the research-only batching. |
| `src/features/tasks/runner.ts` | Removed `submit`, `resume`, and `answer` client methods; kept `orchestrate`, `refresh`, `cancel`. |
| `src/app/api/tasks/route.ts` | `submit`/`resume`/`answer` return HTTP 409 `TASK_EXECUTION_UNAVAILABLE`; `orchestrate` never enqueues; `refresh`/`cancel` retained; minimal owner-scoped backend. |
| `src/features/roadmap/api.ts` | Removed `startQuestionResearch`, `clearResearchKey`, `loadQuestionResearch`, `decideQuestionResearch`, `startRoadmapStepTask`, `clearStepKey`, and the UUID helpers. |
| `src/features/roadmap/DiscoveryWizard.tsx` | Ask my Director now returns an honest unavailable message instead of calling the RPC. |
| `src/features/roadmap/RoadmapPlan.tsx` | Step-task delegation returns an honest unavailable message instead of calling the RPC. |
| `src/app/api/roadmap/route.ts` | `startStepTask` returns HTTP 409 `TASK_EXECUTION_UNAVAILABLE`. |
| `src/screens/EmployeePage.tsx` | Removed task/canvas/progress/deliverable-offer/continuation UI; kept chat, history, Brain-backed replies, historical message rendering, and Deliverables links. |
| `src/features/admin/AdminTraceDetail.tsx` | Replaced the old `AgentCanvas` execution graph with a plain execution-event list; admin metrics/timeline/final reply preserved. |
| `src/server/siteReader.ts` | Imports `firecrawlScrape` from `./integrations/web-providers`. |
| `src/app/[lang]/dictionaries/en.json`, `ar.json` | Added `quickHelp`/`quickBusiness`; no removed keys were deleted. |
| `package.json` | Removed `tests/research` from `test:unit`; added `tests/tasks`, `tests/publishing`; added `typecheck:tests`. |
| `scripts/local-migration-check.mjs` | Added the two new local DB acceptance checks. |
| `scripts/task-execution-db-check.sql` | Runs the generic lifecycle as `service_role` so the revoked authenticated RPCs do not block the check. |
| `e2e/specs/02-onboarding-crawl-brain.spec.ts` | Brain Q&A now asserts a chat reply instead of a task. |
| `e2e/specs/03-agents-orchestrator.spec.ts` | Rewritten for direct chat, honest unavailability, and 409 on submit. |
| `e2e/specs/04-deliverables-calendar.spec.ts` | Deliverables regression seeds a service-role fixture instead of generating a diagnosis; publishing test requires the fake provider. |
| `e2e/specs/05-failures-permissions-integrations.spec.ts` | Direct `enqueue_task` now asserts `42501`; API Origin test unchanged. |
| `e2e/support/tasks.ts` | Added `waitForAgentReply`; retained task helpers for historical reads. |

### 3.2 Pre-existing unrelated working-tree changes preserved (not touched)

The working tree already contained unrelated staged/unstaged work before this cleanup. It was preserved and not reverted, including:

`src/app/api/conversations/route.ts`, `src/app/auth/callback/route.ts`, `src/app/[lang]/page.tsx`, `src/components/brain/BrainGraph.tsx`, `src/components/EmptyState.tsx`, `src/features/marketing/ui/Navbar.tsx`, `src/hooks/useRedirectIfAuthenticated.ts`, `src/lib/authRouting.ts`, `src/screens/auth/NewPassword.tsx`, `src/screens/auth/SignIn.tsx`, `src/screens/Onboarding.tsx`, `src/server/admin/auth.ts`, `src/server/auth.ts`, `src/server/chat-title.ts`, `src/features/roadmap/plan-parse.ts` (untracked), `tests/roadmap/` (untracked), and the roadmap/auth/admin/dictionary staged work.

These files may appear as modified in `git status`; they were not changed by this cleanup.

---

## 4. Exact files created

```
src/server/integrations/web-providers.ts
tsconfig.test.json
tests/orchestrator/unavailable.test.ts
tests/tasks/unavailable.test.ts
tests/publishing/isolated.test.ts
tests/roadmap/discovery-disabled.test.ts
supabase/migrations/20261125000000_employee_intelligence_cleanup_guard.sql
scripts/employee-cleanup-guard-db-check.sql
scripts/employee-cleanup-remediation-db-check.sql
scripts/employee-cleanup-remediation.sql
```

`src/server/integrations/web-providers.ts` contains only the raw `firecrawlScrape`, `tavilySearch`, `exaSearch`, `composioRun`, and `composioInstantPrice` HTTP transports. It is `server-only` and is not imported by any client component or public route.

---

## 5. Verification that retired intelligence is absent

All commands were run from the repository root.

| Check | Command | Result |
|---|---|---|
| No research imports | `grep -rn "features/research\|server/research" src` | no hits |
| No retired execution | `grep -rn "backend.research\|runMarketingResearch\|createResearchDirector\|explicitResearchRequest\|inferResearchMode\|routeRequest" src` | no hits |
| No retired AI operations | `grep -rn "'copy'\|'campaign'\|'diagnose'\|'research'\|'analyze'\|'clarify'\|'research_profile'\|'research_director'\|'research_subagent'\|'research_synthesis'" src/config/ai-models.ts src/server/ai/operations.ts src/lib/agents.ts` | no hits |
| No OSM/official | `grep -rn "osmNearby\|officialPage\|createOsmProvider\|createEgyptOfficialProvider" src` | no hits |
| No roadmap research panel/proposal | `grep -rn "startQuestionResearch\|RoadmapResearchPanel\|generateQuestionProposal" src` | no hits |
| No old canvas/storage | `grep -rn "AgentCanvas\|chatCanvasStorage" src` | no code hits; only marketing copy/dictionary strings remain (section 10) |
| Research directories absent | `test -d src/features/research` / `test -d src/server/research` | both absent |
| Source typecheck | `npx tsc --noEmit` | exit 0 |
| Production build | `npm run build` | exit 0 |

---

## 6. Verification of preserved infrastructure

| Area | Status | Evidence |
|---|---|---|
| Authentication / workspace isolation / RLS | Preserved | No auth, RLS, or migration files changed; build passes. |
| All 48 historical migrations | Preserved | `supabase/migrations/` untouched except the new additive `20261125000000` guard. |
| Business Brain and approvals | Preserved | `brain-tool.ts`, `BrainPage`, `ResearchProposalReview`, brain RPCs untouched. |
| Conversations and messages | Preserved | `api/conversations`, `chat-title`, message history untouched. |
| Deliverables and versions | Preserved | `DeliverablesPage`, `deliverable-offers`, DB tables/RPCs untouched; old research/content docs remain readable. |
| Calendar and planned posts | Preserved | `CalendarPage`, calendar components, `create_post`/`update_post` untouched. |
| Facebook / Composio publishing | Preserved | `src/server/publishing/**`, Facebook connection routes/cards untouched; fake-provider regression added. |
| AI gateway and provider config | Preserved | `ai-generate.ts`, `call-ai.ts`, provider dispatch/fallback/BYOK/key management retained; dead operations removed. |
| Raw Tavily/Exa/Firecrawl/Composio transports | Preserved | `src/server/integrations/web-providers.ts`, server-only; `siteReader` imports Firecrawl. |
| Onboarding and crawling | Preserved | `Onboarding`, `crawl.ts`, `siteReader.ts`, `crawlStorage.ts`, crawl prompts unchanged except the import path. |
| Generic task lifecycle / leases / checkpoints / recovery | Preserved | `task-dispatcher`, `task-executor` fail-fast, `features/tasks`, task RPCs; no intelligence. |
| Generic resource accounting | Preserved | DB tables/RPCs (`free_tier_allowance`, `provider_usage`, reserve/settle/release) untouched; research-specific `FreeTierLedger` class removed. |
| Admin observability | Preserved | `server/observability`, `server/admin`, `features/admin`, admin routes; trace detail now uses an event list. |
| Roadmap data/versions/Discovery | Preserved | Roadmap tables, RPCs, UI, and generation/revision/checkin untouched; Ask my Director and step tasks disabled. |
| Development skills | Preserved | `.agents/skills/` untouched (109 files). |
| Unrelated uncommitted work | Preserved | Roadmap/auth/admin/dictionary work left intact; only retired files changed. |

---

## 7. Task and RPC bypass test results

### 7.1 Unit-level results (executed)

`npm run test:unit` → **22 pass / 0 fail**. Relevant new tests:

- `tests/orchestrator/unavailable.test.ts`
  - Task decision → `outcome='direct'`, `taskId=null`, honest reply, no Brain call, no task enqueue.
  - Arabic task request → Arabic unavailability reply.
  - Language selection.
- `tests/tasks/unavailable.test.ts`
  - Normal task → `stop_task` with `failed`, no `save_task_result`/`complete_task`.
  - `wizard_question` → `load_question_research` + `decide_question_research('fail')`.
  - `roadmap_step` → `set_roadmap_step_status('ready')`.
- `tests/publishing/isolated.test.ts`
  - Fake provider path records `fake_` provider id, no real network.
  - Fake provider refused when `NODE_ENV='production'`.
- `tests/roadmap/discovery-disabled.test.ts`
  - No `start_question_research`/`startRoadmapStepTask` in client; no `start_roadmap_step_task` RPC in route; panel/proposal absent.

### 7.2 API guards (code + e2e specs updated, e2e not run)

- `POST /api/tasks` `submit`, `resume`, `answer` → HTTP 409 `TASK_EXECUTION_UNAVAILABLE`.
- `POST /api/tasks` `orchestrate` → never enqueues; returns direct/Brain/unavailability.
- `POST /api/roadmap` `startStepTask` → HTTP 409.
- Roadmap client Ask my Director → no RPC call.
- E2E `03-agents-orchestrator.spec.ts` and `05-failures-permissions-integrations.spec.ts` updated to assert 409 and `42501`; **not executed** (no E2E environment).

### 7.3 Database guard (prepared, not applied, not executed)

`supabase/migrations/20261125000000_employee_intelligence_cleanup_guard.sql`:

- Revokes `EXECUTE` from `PUBLIC`, `authenticated`, and `anon` for:
  `enqueue_task`, `resume_task`, `answer_task_input`, `save_task_result`, `complete_task`, `start_question_research`, `start_roadmap_step_task`.
- Grants `EXECUTE` to `service_role`.
- Leaves `stop_task`, `recover_tasks`, `admit_task`, `checkpoint_task`, `claim_task`, `heartbeat_task`, `save_task_step`, and the roadmap decision/status functions available to the service role.
- **Not applied.** No production or shared database was contacted. `DATABASE_URL` is not configured, so `npm run test:db:local` exited 2 before running any check.

`scripts/employee-cleanup-guard-db-check.sql` is ready to assert `42501` for the revoked RPCs under the local harness. It was **not executed** for the same reason.

---

## 8. Local status-remediation test results

`scripts/employee-cleanup-remediation.sql` was prepared to:

- Fail `queued`/`running`/`awaiting_input` tasks with `stop_task(..., 'failed', ...)`.
- Fail `researching` question links with `decide_question_research(..., 'fail', ...)` (restoring the question).
- Restore only roadmap steps whose linked task is `failed`/`cancelled` to `ready`.
- Delete nothing.

`scripts/employee-cleanup-remediation-db-check.sql` seeds one of each state and asserts the transitions. It is registered in `scripts/local-migration-check.mjs`.

**Execution status:** Not executed. `npm run test:db:local` exited 2 with `DATABASE_URL is not set. See .env.example.` No database was modified. This is an explicitly unverified capability, not a pass.

---

## 9. Complete test commands and actual results

| Command | Actual result |
|---|---|
| `npx tsc --noEmit` | **exit 0** (no output) |
| `npm run lint` | **exit 0**; warnings only (pre-existing React/oxlint warnings; no errors) |
| `npm run typecheck:tests` | **exit 0** |
| `npm run test:unit` | **exit 0**; 22 tests, 22 pass, 0 fail |
| `npm run test:db:local` | **exit 2**; `DATABASE_URL is not set. See .env.example.` |
| `npm run build` | **exit 0** |
| `npm run test:e2e` | **not run**; no E2E Supabase/base URL/runtime environment configured |

Additional grep gates in section 5 all passed.

---

## 10. Remaining issues and unverified capabilities

| ID | Item | Impact | Required follow-up |
|---|---|---|---|
| U1 | `test:db:local` not run | The additive guard migration and remediation script are unverified against a real Postgres schema. | Run on an isolated local Postgres with `DATABASE_URL` set; then apply the guard migration only after separate approval. |
| U2 | E2E not run | Chat/unavailability, Deliverables fixture, Calendar, and publishing isolation are unverified end-to-end. | Run `npm run test:e2e` against a disposable project with `PUBLISHING_PROVIDER=fake`; never real Facebook. |
| U3 | DB guard not applied | Crafted direct RPC calls are still possible until the migration is applied. The API guards and fail-fast neutralize execution, but the DB grant remains. | Review and apply `20261125000000_employee_intelligence_cleanup_guard.sql` after local verification and owner approval. |
| U4 | Future agent runtime must re-grant RPCs | `enqueue_task`, `resume_task`, `answer_task_input`, `save_task_result`, `complete_task`, and the two Roadmap task-start RPCs are revoked from `authenticated` by the new migration. | Re-grant in the future agent-runtime migration when a real execution path exists. |
| U5 | Marketing copy still mentions "Agent Canvas" | `src/features/marketing/model/testimonials.ts`, `FeaturesInfiniteReach.tsx`, and dictionary strings describe a planned Agent Canvas. This is copy, not code. | Product/marketing owner decides whether to rewrite the copy; not changed here to avoid unrelated product edits. |
| U6 | Unexpected untracked assets | `ADMIN_OBSERVABILITY_AUDIT.md` and `public/skills/` (26 skill files) appeared in the working tree and were not authored by this cleanup. | Owner to confirm ownership; preserved untouched. `.agents/skills/` was not modified. |
| U7 | `submitTask`/`taskEvidence` e2e helpers remain | They are unused by the updated specs but harmless. | Remove in a later test cleanup if desired. |
| U8 | Roadmap behavior temporarily degraded | Ask my Director and step-task delegation are disabled; Discovery questions/answers and all other Roadmap actions remain. | Roadmap redesign phase must decide the replacement research flow. |
| U9 | No live AI/provider verification | This phase made zero live AI/Tavily/Exa/Firecrawl/Composio calls. Mocked tests do not prove live compatibility. | Verify provider/model compatibility in a later phase with an approved budget. |
| U10 | `task-executor` link/step cleanup depends on the owner-scoped backend | The API-triggered `after(dispatchTasks)` uses the owner's token, so `auth.uid()` is correct. A future background dispatcher using only a service token would need a per-task user claim for link/step cleanup. | Document when adding a background dispatcher. |

---

## 11. AI provider calls and external tool calls

**Expected: zero. Actual: zero.**

- No calls to Groq, Dahl, SovereignEG, OpenAI, Google, OpenRouter, Anthropic, Tavily, Exa, Firecrawl, or Composio were made.
- `npm run build`, `tsc`, `lint`, `typecheck:tests`, and `test:unit` are offline.
- The publishing unit test uses `fakeProvider` and a fake DB; it performs no network I/O.
- `AI_MODE=test` is set; the only test-mode models are Groq `openai/gpt-oss-120b` and Dahl `deepseek-ai/DeepSeek-V4-Flash-0731`. The `openai/gpt-oss-20b` test fallback was removed. SovereignEG is excluded in test mode by the existing gateway.

---

## 12. Git working-tree summary

- Branch: `feat/chat-agent`
- HEAD: `30c30b5` (unchanged; no commit)
- Staged + unstaged + untracked state: preserved except for the cleanup edits and deletions.
- Approximate counts from `git status --short`: **34 deleted paths, 33 modified paths, 16 untracked paths** (the modified count includes pre-existing unrelated work).
- No commit, push, reset, checkout, stash, rebase, or force operation was run.
- No backup, bundle, worktree archive, legacy directory, duplicate implementation, or disabled copy was created.
- The untracked `src/features/roadmap/plan-parse.ts` and `tests/roadmap/` were preserved.
- The untracked `BUSMORA_EMPLOYEE_MVP_SPEC.md`, `EMPLOYEE_TECHNICAL_AUDIT.md`, `EMPLOYEE_CLEANUP_PLAN.md`, `ADMIN_OBSERVABILITY_AUDIT.md`, and `public/skills/` were preserved.

---

## 13. Production database confirmation

**No production or shared database was modified.**

- No database URL or credentials were used by this phase.
- `npm run test:db:local` refused to run because `DATABASE_URL` is not set.
- No migration was applied.
- No `DROP`, `TRUNCATE`, or `DELETE` was executed.
- The only DB-related artifacts are new local SQL files and a new additive migration that has not been applied.

---

## 14. Backup confirmation

**No backup was created.**

- No `.scratch/cleanup-backup-*`, `repo.bundle`, `worktree.tgz`, legacy directory, or duplicate source tree exists.
- The owner explicitly declined a backup. The irreversible loss of uncommitted retired code was accepted under D1.

---

## 15. New agents, skills, or Canvas confirmation

- **No new agents** were implemented. The Orchestrator remains the only conversational entry point; task requests return an honest unavailability reply.
- **No replacement skills** were authored. The five Employee SKILL.md files were removed; `.agents/skills/` (development skills) was untouched. `public/skills/` was not authored or modified by this cleanup.
- **No new Canvas** was built. The old `AgentCanvas`, `chatCanvasStorage`, and `features/research/canvas/graph.ts` were removed; admin traces use a plain event list.

---

## Appendix A — Exact verification commands

```bash
npx tsc --noEmit
npm run lint
npm run typecheck:tests
npm run test:unit
npm run test:db:local   # exits 2: DATABASE_URL not set
npm run build

grep -rn "features/research\|server/research" src
grep -rn "backend.research\|runMarketingResearch\|createResearchDirector\|explicitResearchRequest\|inferResearchMode\|routeRequest" src
grep -rn "'copy'\|'campaign'\|'diagnose'\|'research'\|'analyze'\|'clarify'\|'research_profile'\|'research_director'\|'research_subagent'\|'research_synthesis'" src/config/ai-models.ts src/server/ai/operations.ts src/lib/agents.ts
grep -rn "startQuestionResearch\|RoadmapResearchPanel\|generateQuestionProposal" src
grep -rn "osmNearby\|officialPage\|createOsmProvider\|createEgyptOfficialProvider" src
```

## Appendix B — Deferred work

- Apply and locally verify `20261125000000_employee_intelligence_cleanup_guard.sql`.
- Run the two new local DB acceptance checks with `DATABASE_URL` set.
- Run the updated E2E suite against a disposable project with `PUBLISHING_PROVIDER=fake`.
- Decide the replacement Roadmap research flow (Option A temporary behavior is in place).
- Decide whether to rewrite marketing copy that references the old Agent Canvas.
- Build the new agent runtime and skills in a later approved phase.

---

**End of execution report. No production database was modified. No backup was created. No commit or push was made.**