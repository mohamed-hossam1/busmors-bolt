# BUSMORA — Employee Rebuild: Master Implementation Plan

**Version:** 1.0 — 2026-11-24  
**Execution mode:** One continuous, sequential implementation assignment with automatic technical acceptance gates.  
**Required companion:** `BUSMORA_EMPLOYEE_MVP_SPEC.md` — latest full version, containing the five detailed agent designs and Section 13 (Admin & Employee Execution Observability).  
**Audience:** Coding Agent with repository access.  
**Current baseline:** Phase 0 source cleanup reported executed; database and E2E acceptance remain pending.  
**Objective:** Deliver the complete new Employee MVP, with real LLM-driven agents and inspectable execution from the original request to final result. This is an implementation instruction, not a request for another planning document.

---

## 1. Start here — authority and execution rules

Read `BUSMORA_EMPLOYEE_MVP_SPEC.md` in full before editing. Also read `EMPLOYEE_CLEANUP_EXECUTION_REPORT.md`, `ADMIN_OBSERVABILITY_AUDIT.md`, the latest cleanup plan if present, and project-specific repository instructions. Locate the 26 owner-supplied `SKILL.md` files. Use the actual repository as the implementation evidence; do not treat the reports as live verification. Record the current branch/HEAD, dirty tree, relevant files, migration inventory and pre-existing issues. The reported baseline is `feat/chat-agent` at `30c30b5`; verify rather than reset to it.

### 1.1 One assignment, sequential gates

The owner wants all phases executed in the same implementation assignment. **Do not stop after a successful phase just to request another approval.** Record the phase result and automatically continue to the next phase when its required acceptance criteria pass. This instruction supersedes previous instructions to seek manual approval between every ordinary implementation phase, solely for sequencing and the bounded test scenarios expressly authorized below. It does not change the product architecture, security controls, spend limits, test-mode model allowlist, or business-side approval rules in the MVP specification.

Execute in order. Implement and verify each phase before depending on it. Within a phase use independent work in parallel only when safe; do not parallelize dependent phases or allow concurrent edits to the same shared files without coordination. Fix defects within the current phase. Never bypass a failed gate, disable a test, fake an integration, relabel a mock as live, or claim that an unexecuted check passed. If a required gate remains blocked after reasonable diagnosis and local repair, stop the dependent implementation sequence, preserve work, and write the exact blocker and next command/action. No infinite retries.

A successful gate may allow explicitly optional or production-only capabilities to remain `NOT VERIFIED`, provided they are not required for the current gate, disabled or clearly reported where unavailable, and not presented as working. Distinguish technical acceptance from owner assessment of subjective marketing quality. At the end, supply evidence for owner review; do not invent owner approval.

### 1.2 Required source-of-truth checks

- Master specification defines roles, prompts, skills, tool permissions, outputs, Canvas, budgets and Admin. Read the canonical system prompts verbatim and use the supplied skill contents, not replacement prompts invented from this plan.
- Latest explicit owner decisions override older audit/research proposals: full legacy cleanup; no backups; Roadmap redesign deferred; 5 agents, 26 skills; no automatic sensitive RPC re-grants; one continuous implementation assignment; test mode restricted to Groq/Dahl.
- Verify that the master spec contains the detailed Orchestrator V2, Director V1, Research Agent V1, Content Agent V1, Marketing Analyst V1 and Section 13. If a required source or supplied skill is missing, locate it in the repository/owner-provided artifacts; do not silently reconstruct it from an obsolete document. Report a missing required input as a blocker before implementing the affected feature.
- If requirements conflict beyond the explicit sequencing override above, use the stricter security, approval, data and budget rule. Record the discrepancy. Do not redesign product decisions without owner authorization.

### 1.3 Non-negotiable boundaries

Preserve existing auth, workspace isolation, RLS, Business Brain and approvals, conversations, Deliverables and immutable versions, Calendar/post versions, Facebook/Composio publishing infrastructure, onboarding/crawling, historical database/migrations and execution records, generic task lifecycle, provider transport/gateway/accounting, admin infrastructure and unrelated uncommitted changes. Never delete historical records to simplify the rebuild. Add only necessary forward migrations; do not rewrite existing migrations. Do not restore removed legacy intelligence from Git or reconstruct its deterministic tracks, workers, modes, scoring, source/lexicon heuristics, pricing logic or templates. No legacy copy, archive, backup, bundle, WIP commit, commit, push, reset or history rewrite. No unrelated feature refactor.

Roadmap Ask my Director and step-task delegation remain disabled at UI, API and applicable RPC boundaries. Preserve existing Roadmap data, discovery, revisions and unrelated generation. Do not redesign Roadmap. Do not introduce separate Strategy, Publishing, Security, Auditor or other AI agents; no OSM, standalone Official Sources tool, separate Content Library, image/video generation, ad management or new scheduler. No arbitrary code execution by Employee agents.

Use isolated local/disposable test infrastructure only. Never apply migrations or remediation to production/shared databases; never deploy, publish/schedule real posts, contact customers, send emails/messages, buy data or run real ad changes as part of implementation/testing. Do not print or copy `.env` values, credentials, provider keys, auth headers or tokens. All existing keys may be configured and the owner has funded SovereignEG; that is not authorization to use it in test mode or spend production credits. Do not change account credentials. Keep `AI_MODE=test` in local `.env` and ensure mode enforced server-side; no live external requests during Phase 0.5/1.

---

## 2. Fixed architecture and configuration

### 2.1 Agent inventory

| Role | Skills | Responsibility | Production primary | Test primary | Temperature |
|---|---:|---|---|---|---:|
| Orchestrator | 0 | Conversation, Business Brain, safe routing and Director handoff | Groq `openai/gpt-oss-120b` | Groq `openai/gpt-oss-120b` | 0.2 |
| Director | 7 | Own task/strategy, execute small work, delegate and independently review | Dahl `deepseek-ai/DeepSeek-V4-Flash-0731` | Dahl same model | 0.3 |
| Research Agent | 5 | Evidence-led market, competitor, audience, positioning and benchmark research | SovereignEG `SovereignEG/Qwen3.8-27B-FP8` | Dahl same model | 0.3 |
| Content Agent | 7 | Creative text, plans, copy, visual briefs and scripts | SovereignEG `claude-haiku-5.5` | Groq `openai/gpt-oss-120b` | 0.7 |
| Marketing Analyst | 7 | Verified calculations, performance analysis and recommendations | SovereignEG `gpt-6-luna` | Dahl same model | 0.3 |

Exactly five LLM-driven roles. Orchestrator delegates to Director; Director alone delegates specialists. No specialist-to-specialist calls. Specialists return results/help requests through Director. No deterministic business intelligence pretending to be an agent. Deterministic code is required for security, validated tools/calculations, persistence, state, budgets and tracing — not for replacing marketing judgment. A model-driven action/result loop may use native tool calls or validated structured actions after compatibility verification.

Use `src/config/ai-models.ts` as the single source of truth, with exact role assignments, provider-compatible settings and fallback chains in the master spec. Resolve canonical IDs to actual provider adapter IDs explicitly. Never guess a proxy alias; do not substitute an unapproved model if a configured endpoint is incompatible. In `AI_MODE=test`, allow only the exact pairs Groq `openai/gpt-oss-120b` and Dahl `deepseek-ai/DeepSeek-V4-Flash-0731`, including BYOK/defaults/retries/fallbacks and non-Employee AI operations that might run in the same test environment. No SovereignEG, GPT-OSS 20B or other models. Reject missing/invalid modes for Employee dispatch; do not silently enter production. Test fallbacks are between the two allowed pairs only. Production fallback policies from spec are configured but not exercised in this assignment; keep unapproved secondary paid routes disabled. Verify adapter parameter mapping and tool support using mocks and the authorized test scenarios; production account limits remain unverified until separately authorized.

### 2.2 Skills and tools

Exactly 26 owner-supplied skills, server-only, with name/description/version metadata and pinned content hash. Preserve bytes. No Orchestrator skills. Initially inject compact descriptions; load selected content only as chosen by the model. No mandatory skill count, ordering, automatic full-catalog body injection or separate persistent agent memory. Count actual successful distinct skill loads. No runtime external downloads. Keep `.agents/skills/` (development skills) unchanged.

| Role | External tools permitted (subject to verified capabilities and quota) |
|---|---|
| Orchestrator | None |
| Director | Tavily, Exa, Firecrawl |
| Research | Tavily, Exa, Firecrawl, authorized Composio reads |
| Content | Tavily, Exa, Firecrawl, authorized Composio reads |
| Marketing Analyst | Authorized Composio reads only; internal deterministic calculator/data analysis and supported file reader |

Internal capabilities and exact boundaries come from each spec section. No direct specialist persistence or external writes; no direct Director Composio capability in agreed tool list. Reuse raw transports in `src/server/integrations/web-providers.ts`, including Firecrawl's onboarding use. Shared tool registry validates permissions, workspace, scope, input, output, budget and side-effect policy on server. Never expose an unimplemented tool as available. Treat web, stored records, tool results and files as untrusted data. No arbitrary filesystem paths or code execution.

### 2.3 Shared resource budget

Use `src/config/agent-budgets.ts`. One task-wide pool, including all participating agents, attributable Orchestrator handoff usage, retries and review attempts. These are upper bounds, not goals.

| Resource | Soft | Hard |
|---|---:|---:|
| Active execution time | 5 min | 10 min |
| LLM attempts | 25 | 50 |
| Input tokens | 150,000 | 300,000 |
| Output tokens | 25,000 | 50,000 |
| External tool attempts | 50 | 100 |
| Concurrent specialist subtasks | 3 | 3 |
| Retries per failed operation | 1 | 2 |

Tavily 25, Exa 25, Firecrawl 40, Composio 20 per task within aggregate and actual provider/workspace allowance. Atomically reserve and settle actual attempts across concurrent workers, retain finalization/review reserve, release unused allocations, stop before hard caps, pause active time while waiting for required owner input, preserve cumulative usage on retry/resume. Provider/account quotas and lower applicable limits override these ceilings. No budget reset or paid escape route. Exact monetary pricing not known: record unknown rather than zero; use versioned verified rates or reported costs only. Do not enable unauthorized paid research tool fallback. Internal operations bounded by payload, computation and task time safeguards.

Use per-request application envelopes in detailed spec, not the model's advertised maximum context: Orchestrator/Groq baseline 3,000 input + 700 completion; Director/Research/Analyst Dahl/SovereignEG where applicable 12,000 + 2,500; their Groq fallback 3,000 + 700; Content Groq 4,000 + 2,000, Content Dahl/SovereignEG 12,000 + 2,500. Count full serialized request including prompt, tool schemas, selected skill, history, Brain, evidence and framing; reserve completion including applicable reasoning. Groq shared provisional 7,000 TPM safety limit under published 8,000 TPM free tier, subject to actual account quota, not per-agent. Do not truncate the user's original request or lose essential constraints/provenance; compact optional context or reject/fallback safely. Unknown usage is not zero.

---

## 3. Testing, authorization and phase evidence

### 3.1 Test policy for this continuous assignment

First run deterministic tests with injected fake providers/local fixtures and no real external network dispatch. All gates require relevant source/test typecheck, lint (no new errors), unit/integration checks and database/E2E tests where the affected behavior requires them. Run final full build and regression suite. Do not merely check that code compiles. Keep fixtures clearly fictional or authorized/anonymized. Never silently substitute a production database. Use the actual scripts in `package.json` and report commands, exit codes and counts.

The owner's instruction to execute the entire plan authorizes the **single bounded test-mode representative scenario at each listed live gate** in section 4, after its offline tests pass. This replaces repeated manual live-test confirmation for those listed scenarios only. Use Groq/Dahl test models and actual account allowances, with a conservative sub-allocation within the shared budget. Use mocked publishing, fixture account/file data, and mocked external research in offline checks. For the Research Agent's listed live research scenario only, use the minimum necessary authorized free/within-allowance read calls to Tavily/Exa/Firecrawl for real evidence; other live scenarios should reuse evidence or mock external reads unless necessary and permitted by the spec. A test-mode LLM call may still consume quota or credits; do not exceed available authorized allowance. Composio live read is not required without verified connection/scope and approved non-sensitive test data. No real publishing. Do not call SovereignEG or run paid production model verification as part of this assignment.

At most one live execution per listed scenario (not one API call: a bounded agent loop may require several model calls). No automatic rerun of a live scenario after it fails, no extra probes/benchmarks just to fill coverage, no repeated full-agent run after a persistence failure. Permitted runtime retries/fallbacks within the same execution remain bounded by shared policy. Diagnose live failures offline; if further live execution is required, stop that dependent gate and document the exact requested authorization. If no quota, credentials or local test environment are available, report the blocker; do not call another paid provider or simulate a pass. Do not force all skills or tools to be used just for checklist coverage.

### 3.2 Reporting and checkpoints

Maintain `EMPLOYEE_IMPLEMENTATION_PROGRESS.md` from the start: current phase, PASS/BLOCKED/NOT VERIFIED, relevant file changes, exact commands/results, migrations applied locally, model/tool calls and actual usage/cost where known, trace/task IDs, coverage gaps, blockers, and next step. Persist phase reports as specified below. These are engineering documents, not backups or commits. After every successful gate automatically continue. If interrupted, resume from recorded phase and verify current state; never re-run successful paid tests unnecessarily. Do not declare final readiness while gates are unverified. Each phase's report must distinguish real LLM tests, real read-tool calls, mocked tests, static inspection and untested production behavior.

---

## 4. Implementation phases (execute in this order)

### Phase 0 — Full legacy Employee cleanup (reported executed; verify, do not repeat)

**Input:** `EMPLOYEE_CLEANUP_EXECUTION_REPORT.md`. The report states 60 retired files removed, 48 historical migrations retained, source and test typecheck/lint/build passed, 22/22 unit tests passed, zero live provider calls, no DB modification, no commit/push. Local DB and E2E were not executed. Verify this baseline against the actual working tree and the approved cleanup allowlist. Confirm retired research directories/workers, old task execution intelligence, old skills and Canvas are absent; raw provider transports and generic infrastructure preserved. Confirm Orchestrator's honest unavailability and task executor fail-fast remain until the relevant new functionality is accepted. Record discrepancies rather than performing a fresh broad deletion. If no discrepancy, carry Phase 0 forward as `SOURCE CLEANUP VERIFIED; ACCEPTANCE PENDING`.

**Gate:** clean legacy baseline, unrelated work intact, no new archive/backup, no restored old intelligence. Continue directly to 0.5.

### Phase 0.5 — Cleanup acceptance and secure local baseline

1. Provision isolated local PostgreSQL/Supabase and local app/E2E stack using repository tooling. Verify local destination identity before connecting; `DATABASE_URL` missing in report. Never point at configured shared/production project. If unavailable, report precise setup blocker rather than modifying remote DB.
2. Apply existing migrations including `20261125000000_employee_intelligence_cleanup_guard.sql` to isolated DB only. Run `npm run test:db:local`, `scripts/employee-cleanup-guard-db-check.sql`, `scripts/employee-cleanup-remediation-db-check.sql` through actual harness; execute `scripts/employee-cleanup-remediation.sql` only in isolated fixture environment. Assert queued/running/awaiting-input legacy tasks fail safely, affected Roadmap links/steps recover, no records deleted. Preserve historical data and approvals. Do not run remediation blindly in later phases against legitimate new tasks.
3. Verify direct RPC bypass protection: service-role controlled enqueue/resume/input/result/complete; anon/authenticated denial for sensitive RPCs; owner-scoped API and cross-workspace denial. Correct U4 of cleanup report: **no automatic re-grant to client roles**. Audit remaining lifecycle RPCs as needed; constrain all privileged transitions. Roadmap task-start RPCs stay disabled. Review additive migrations rather than edit historical SQL.
4. Run updated E2E regressions with fake AI and `PUBLISHING_PROVIDER=fake` in non-production test environment. Verify unavailability, Brain approval, Deliverables history, Calendar and publishing isolation. No actual Facebook call. Keep all existing unrelated test coverage.
5. Locate 26 supplied skills (reported `public/skills/`). Move to `src/server/employee/skills/{director,research,content,marketing-analyst}/<skill-id>/SKILL.md` or equivalent strictly server-only deployment-safe location. SHA-256 before/after, validate YAML and unique IDs; count 7/5/7/7; no Orchestrator skill. Preserve content byte-for-byte, remove public exposure, test old static URLs cannot serve skill files, verify future deployment packaging. Do not implement loader until Phase 1. Do not touch development `.agents/skills/`.
6. Verify `AI_MODE=test` with zero real provider calls in this phase. Rerun applicable static and unit checks.

**Gate:** actual local DB/guard/remediation and E2E tests pass, skill inventory and hashes match, isolation verified. If required infrastructure unavailable, BLOCKED; do not build on an unverified privilege boundary.  
**Report:** `EMPLOYEE_CLEANUP_ACCEPTANCE_REPORT.md`.

### Phase 1 — Shared Agent Runtime, tool/skill registries, budgets and Admin observability

Build generic infrastructure first; do not build role-specific intelligence yet. Keep unavailable production task entrypoints closed until Phase 4 validated. Use mock agents for runtime fixtures explicitly labeled as such.

**1A — Contracts and runtime:** typed agent definitions, allowed roles/model configuration, task/subtask/agent-instance IDs, parent relationships, bounded model-action-result loop, validation of structured actions or native tool calls, result/status contracts, context assembly, evidence and source references. Reuse tasks/dispatcher/leases/checkpoints/usage stores. Implement durable resume, cancellation/interrupt, clarification waiting, bounded retries and idempotent result persistence primitives. Distinguish child completion from overall task completion. Do not replace fail-fast with a live generic task path until end-to-end validation; use isolated internal harness first.

**1B — Gateway and accounting:** central configuration, actual serialized token accounting, shared atomic resource reservations, provider quotas/cost, test allowlist including fallback/BYOK, hard limits, finalization reserve, provider failure classification, safe context compaction. Reuse existing usage/RPCs when appropriate; verify free-tier constraints do not silently authorize paid research routes. Mock transport tests must prove actual dispatched provider/model matches the allowed route and no hidden fallback escapes. Do not call live model providers in this phase.

**1C — Registry and tools:** server-only skill discovery, validated metadata, hash/version pinning, deploy inclusion and lazy loading. Central registry/tool executor, allowlists, workspace/RLS/session checks, bounded payloads, error/result metadata. Reuse Brain, Deliverable, Calendar and task services; wrap raw search/scrape/read transports without duplicating provider implementations. Build safe internal calculator/data-analysis primitives (typed numeric operations, null handling, source IDs, deterministic calculations) and authorized bounded file reader if supported; no shell/eval, macros or arbitrary files. If a proposed optional file format or Composio action cannot be supported, expose only verified capabilities and document unavailable parts. Test actual calculator/data-analysis implementation against known inputs; do not fake numeric results. Reuse existing publishing services without exposing them to specialist tools.

**1D — Admin observability (mandatory, Section 13):** extend existing `src/server/observability/`, `src/server/admin/`, `src/features/admin/`, admin pages/APIs and `admin_traces`, `admin_trace_events`, `admin_trace_list`, `record_admin_trace`. No second logging system. Stable trace/agent instance/call/event IDs; actual model attempt events at dispatch boundary; tool invocation and transport retry correlation; agent lifecycle/skills/review/budget/clarification/approval/persistence events. Idempotent durable recording/checkpoints and accurate aggregation; logging failure never replays paid calls or side effects. Fix `checkIsAdminUser` to use server session. Authorize each admin read, add read auditing, sanitize recursively before storage/display, use scoped sanitized detailed capture in test; production safe defaults with full prompt capture off and detailed debug explicit/limited; no raw unredacted mode, private reasoning, credentials or unnecessary PII. Keep configurable bounded payload/retention policy, historical records, access-controlled lazy detail. Do not purge existing traces. Unknown/truncated/not-captured values labeled.

**Admin UI:** existing Trace List improved, Trace Detail Overview + expandable Execution Tree + actual Timeline + Inspector + Final Result. One distinct node for each physical LLM attempt and tool invocation (including repeated same tool), individual agent inputs/outputs, skill ID/version, permitted sanitized request/response, tool args/result, model/provider, timing, retry/fallback, usage/cost, budget and status. Distinguish actual delivered chat reply from generated output and persistence failure. Parallel time overlap visible, no summed duration pretending to be wall clock, no duplicated usage. Preserve legacy traces with explicit gaps. User Canvas consumes the same actual execution source through safe projection, never Admin payload access. Build shared projection/event contracts now; expand customer Canvas in Phase 4 and specialist phases.

**Gate:** comprehensive deterministic tests for real runtime control, allowlists, shared concurrency/reservations, context limits, fallback, failure/cancel/resume, security, skill loads, valid calculations, local DB and persistence primitives. Admin mock-fixture tests: nested repeated agents/tools, parallel branches, failed attempt/fallback, unknown cost, distinct input/output, sanitization, auth/read audit and lazy detail. Verify trace tree against real mock dispatch records, not fabricated production events. Zero real model/external calls.  
**Report:** `EMPLOYEE_PHASE_1_RUNTIME_ADMIN_REPORT.md`.

### Phase 2 — Orchestrator V2

Keep existing gateway foundation, idempotency, Brain access, conversation handling and guardrails. Implement approved canonical V2 prompt, zero skills, zero external tools, five logical internal capabilities (`read_business_brain`, `propose_brain_change`, `delegate_to_director`, `get_task_status`, `get_product_knowledge`), compact injected context and model settings. Respond to simple messages and Business Brain questions directly; propose every durable change through approval card; no direct mutation. Route substantive work with original request and relevant context to Director boundary; use mock/disabled Director until integration. No fake accepted task, no claims of unavailable capabilities. Respect Arabic/English and prompt injection defenses. Keep authorized backend as the only task-entry route.

**Offline gate:** direct/Brain responses, proposals add/edit/delete, duplicate/conflict handling, unapproved context, language, injection, unavailable Director, idempotency, token/provider policy, auth and actual trace.  
**Live gate 2:** one test-mode Orchestrator scenario with known fixture Brain context and representative conversational/knowledge routing, no external calls; inspect Admin input/output, actual Groq or eligible Dahl attempts, usage and status. Mock missing branches and delegation boundary; no extra calls to force coverage. Direct simple chat target one model call and 1–3 s is a performance target, not a guaranteed pass fabricated from estimates.  
**Gate:** tested role behavior and trace; no fake task creation.  
**Report:** `EMPLOYEE_PHASE_2_ORCHESTRATOR_REPORT.md`.

### Phase 3 — Director V1 (standalone)

Implement canonical Director prompt, seven dynamic skills, authorized direct focused research and internal tools, centralized delegation contract, adaptive task planning, clarification cards, shared allocation, review and output routing. Use mock specialist registry for standalone tests; clearly label any unavailable specialist. Director owns final strategy and task. No fixed skill chains, no compulsory delegation, no new strategist/auditor. Double Review: self-review direct work, independent accept/revise/reject for specialist outputs, focused bounded revisions. Persist only validated accepted outputs through controlled services; no unauthorized Brain write, real schedule/publish or spend.

**Offline gate:** direct advice, context and skills, mock sequential/parallel delegation, specialist help request, essential clarification/resume, evidence gaps, quality rejection/revision, resource reserve, partial/failure, versioned outputs and trace.  
**Live gate 3:** one standalone scenario from section 3.10 (Egyptian business campaign strategy, simple diagnosis and message improvement using fixture Brain/report/metrics); use limited current evidence only if permitted. Inspect actual Director model decisions, selected skill content, result and Admin trace. Specialists remain mock/unverified.  
**Gate:** Director standalone accepted technically, proper boundaries.  
**Report:** `EMPLOYEE_PHASE_3_DIRECTOR_REPORT.md`.

### Phase 4 — Orchestrator + Director integration and customer Canvas

Connect real Orchestrator handoff to actual Director runtime using authenticated backend. Re-enable only approved Employee task submit/resume/answer actions through guarded server API/RPC with validated user/task/workspace scope, idempotency and current state. Never re-grant sensitive client RPCs; Roadmap remains disabled. Replace fail-fast for supported new tasks only, preserve safe unavailability for unsupported capabilities and old/invalid tasks. Verify distinction between clarification, continuation, new task, cancellation and retry. Use existing Conversation/Task/Deliverable/Calendar/Brain records. Followups revise existing logical item with immutable new version; no duplicate save. Chat summary and links from confirmed persistence.

Rebuild the customer Agent Canvas from actual events, not old storage/graph. Actual hierarchy Orchestrator → Director → actual specialists only. Each invoked agent has at most one distinct-used Skills circle (left) and Tools circle (right), click names only, omit empty circles; truthful statuses, stable collision-free layout, retained current/historical real graph. No model, scrape, internal stage or individual tool-call nodes. Do not render retired deterministic workers as live AI. Canvas must not expose Admin payloads. Admin shows actual detailed nested execution.

**Offline gate:** real route wiring with mocked models, API/DB auth, direct task lifecycle, clarification, idempotent delivery/version, cancellation, UI/E2E Canvas and Admin consistency.  
**Live gate 4:** one actual two-agent scenario of a substantive strategy request that Director can handle without unavailable specialists. Inspect original query, Orchestrator handoff, Director input/output and actual final chat/Deliverable save in isolated DB; verify matching Canvas and Admin trace.  
**Gate:** real Orchestrator+Director end-to-end, supported routes only.  
**Report:** `EMPLOYEE_PHASE_4_CORE_INTEGRATION_REPORT.md`.

### Phase 5 — Research Agent V1 and integration

Implement one LLM-driven Research Agent, five owner-supplied skills, actual model-selected actions and evidence feedback. Tools Tavily/Exa/Firecrawl and verified authorized Composio reads only. Local language/geography and actual competitor/price qualification; evidence with original source, date/scope, units, retrieval status and claim linkage; distinguish proxy, source claim, observation, estimate, hypothesis, conflicting/unknown. No invented sources, market size, prices, fixed discovery counts, Quick/Standard/Deep, hardcoded tracks, static source whitelist or quality scores. Stop based on actual sufficiency, gap, diminishing value, budget or cancellation. Director handles research requests, clarifications and final acceptance. Do not implement direct report saves in specialist.

**Offline gate:** dynamic action feedback, source grounding, unavailable/blocked sources, social-only competitors, currency/price comparisons, duplicate source identity, incomplete evidence, conflicting facts, prompt injection, bounded tools, checkpoint/revision and Director handoff.  
**Live gate 5A (standalone):** one delegated Greater Cairo specialty coffee market scenario per spec section 4.9; use limited real permitted public search/read evidence, no invented results and no forced five skill reads. Inspect actual sources, queries/results and evidence. If no permitted read provider available, real external research remains blocked; do not claim it passed based on mock.  
**Live gate 5B (integration):** one actual Orchestrator→Director→Research request, reuse valid previously collected evidence when appropriate, no unnecessary re-research. Verify independent review and automatic versioned Deliverable and actual Canvas/trace; no automatic Brain changes.  
**Gate:** individual then integrated behavior, genuine source-backed research and complete trace.  
**Report:** `EMPLOYEE_PHASE_5_RESEARCH_REPORT.md`.

### Phase 6 — Content Agent V1 and integration

Implement canonical prompt and seven supplied skills. Dynamic creative decisions with approved Brain/brand, prior Deliverables and Calendar, relevant optional read-only tools; audience language/voice, creative concepts, captions/copy, content plans, visual briefs, scripts, revision/platform adaptation. No fabricated offers, assets, testimonials or performance. Text and briefs only; no media generation. Draft readiness, separate on-art/production notes, variants vs real posts, proposed local dates/timezone; no actual scheduling. Director independently reviews and saves accepted posts as Calendar drafts and plans/scripts/briefs as appropriate Deliverables. New version of same logical unsent draft on revision, stale approval invalidated; never silently change approved/published/scheduled external content. Existing exact-version owner approval and Facebook publishing pipeline unchanged.

**Offline gate:** brand/language, facts, missing assets, variants, plan/Calendar duplicates, post/deliverable routing, revision, approval invalidation, fake-provider publishing isolation, unsupported format/publish denial and trace.  
**Live gate 6A (standalone):** one fixture coffee business creative assignment per section 5.9 (new and revised captions, carousel outline, visual brief, short Reel script, English B2B variant, proposed timing); no real external publishing or unnecessary web calls.  
**Live gate 6B (integration):** one real Orchestrator→Director→Content task with isolated Brain/Calendar; verify draft and Deliverable persistence, review, no duplicate writes or actual schedule, trace and Canvas.  
**Gate:** standalone then integrated content behavior; existing approval/publishing semantics protected.  
**Report:** `EMPLOYEE_PHASE_6_CONTENT_REPORT.md`.

### Phase 7 — Marketing Analyst V1 and integration

Implement canonical prompt, seven supplied skills, verified read-only data access, deterministic calculations and structured analysis with provenance. Read actual metric definitions, account/period/attribution/currency and data grain. No Tavily/Exa/Firecrawl; external research via Director. Use Composio only if authorized read scopes/action verified; Facebook publishing connection is not analytics permission. Supported fixture/user attachments use validated file reader; no arbitrary code or raw unbounded spreadsheet in prompts. Null vs zero, zero denominators, deduplication, aligned comparisons, no summed unique reach, no fabricated benchmarks or causal conclusions. Marketing analysis only; no financial/accounting advisory, campaign writes or spending. Director owns decisions and report delivery.

**Offline gate:** numeric test oracles, file safety, missing fields, currency/attribution mismatch, duplicate/overlap, unsupported metrics, access denial, analytics without live connector, competing hypotheses, partial outputs and trace.  
**Live gate 7A (standalone):** one two-week synthetic coffee fixture per section 6.9; compare actual computed CTR 2% both weeks, CPC EGP 4 both, inquiry cost 16→13.71, inquiry-to-confirmed 40%→30%, confirmed-to-delivered 80%→66.67%, delivered-order cost 50→68.57, ROAS 5.0x→3.65x, deliveries −12.5%. Verify calculator outputs; no unsupported cause for fulfillment decline. These are fixture test oracles, not runtime canned answers.  
**Live gate 7B (integration):** one actual Orchestrator→Director→Analyst request over authorized fixture data; verify review, versioned report, trace and Canvas. If real analytics connection unavailable, label live account data access unverified; fixture analysis can pass, but do not advertise connected analytics until verified.  
**Gate:** trustworthy calculations, analysis and integration, clear capability limits.  
**Report:** `EMPLOYEE_PHASE_7_ANALYST_REPORT.md`.

### Phase 8 — Full multi-agent execution and regression

Validate all approved agents working together through real Director-owned orchestration. Use a compound marketing task with independent research/analysis where useful, dependent creative based on findings, review and final outputs. Do not force specialists that the objective does not require; design fixture to naturally justify their participation. Reuse earlier valid evidence and fixture metrics to reduce external calls. No specialist-to-specialist delegation or automatic user-facing writes. Test continuation, multi-output delivery, approval cards, draft revisions, trace/Canvas and partial/cancel/failure behavior using mocks for edge cases. Review security and migrations, test-mode enforcement, per-provider quota across all roles and resource reservation under concurrency. Confirm no dormant legacy intelligence or unauthorized routes were reintroduced.

**Offline gate:** cross-agent integration, shared budget/concurrency, end-to-end task checkpoints, approval/publish fake path, RLS/privilege denial, no duplicate persistence, legacy compatibility and Admin trace completeness.  
**Live gate 8:** one representative multi-agent task with actual Groq/Dahl role calls and existing valid evidence/authorized fixture data. Example: recommend a local campaign from researched competitor/audience findings and declining fulfilled orders; analyze existing data, propose strategy and create a small set of draft posts. Director dynamically chooses tasks, dependencies and review. Inspect distinct actual agent/tool/model outputs, evidence, usage, final response and saved artifacts. If a role is not invoked, do not claim it was tested in this run.  
**Gate:** actual integrated task with supported final results, trace and no unauthorized side effects.  
**Report:** `EMPLOYEE_PHASE_8_MULTI_AGENT_REPORT.md`.

### Phase 9 — Business acceptance and final readiness

Run final source/test typechecks, lint, unit/integration/local DB and E2E regressions, build and deployment-packaging checks in isolated environment. Inspect final skill inventory/checksums, provider settings, mode gate, migrations, no public static skill URLs, no secret exposure, no production data modification, no unauthorized real publishing or paid calls. Review Admin and Canvas manually or through real browser E2E if available: exact original query, agent inputs/outputs, every actual model/tool event, errors, usage and saved result; confirm no secret/private reasoning leaks and user Canvas only shows safe summary.

**Business acceptance live gate 9:** at most one additional test-mode scenario only if an authorized real-business test workspace/data and a distinct business acceptance goal are actually supplied and prior gates pass. Otherwise use the Phase 8 scenario evidence and an isolated representative business fixture for final offline review, mark real-business acceptance `PENDING OWNER REVIEW / NOT VERIFIED`. Do not assume production access or fabricate a real customer. Actual SovereignEG production endpoint verification, real connected-account analytics access, actual Facebook publish/schedule verification, shared/production migration application, rollout and pricing/retention decisions requiring owner authorization are **separate post-implementation actions**, not automatically authorized by this plan. Do not mark production-ready merely because local tests pass. Keep test mode.

**Gate:** mandatory local/mock/test-mode verification complete; optional unavailable or production-only items precisely listed; owner can review actual outputs.  
**Reports:** `EMPLOYEE_PHASE_9_ACCEPTANCE_REPORT.md` and final report below.

---

## 5. Final delivery checklist

Produce `EMPLOYEE_REBUILD_FINAL_REPORT.md` even if blocked. Include:

1. Executive verdict: `IMPLEMENTED & TEST-MODE VERIFIED — OWNER REVIEW PENDING`, `PARTIAL / BLOCKED`, or narrower truthful result; no unsupported production-ready claim.
2. Phase-by-phase matrix with dependencies, status, report paths and exact blockers, commands, test counts/exit codes. Identify new vs pre-existing failures and unexecuted tests.
3. Actual files added/modified/deleted, new migrations and their local application status, protected historical migrations, skill inventory/hash verification and unchanged development skills. Include relevant architecture/module map and any spec deviations with rationale.
4. Role/model/tool/skill reality matrix: actual code wiring, live LLM evidence, actual read-tool verification, mocked/unavailable capabilities; no claims that catalog entries or keys prove successful calls.
5. Admin verification examples: trace/task IDs for each authorized live scenario, actual status/latency, distinct role instances, model attempts, tool args/results (sanitized references only), skill loads, reviews, fallback/retries, budget usage, cost basis, final persistence IDs. Include UI screenshots if captured locally and sanitized; never invent screenshots or results. Provide instructions to locate them in existing Admin. Do not dump secrets or unnecessary customer data into reports.
6. Output quality examples for strategy, sourced research, creative drafts and analytical calculations; link actual isolated Deliverable/Calendar/Brain proposal records, clearly distinguish synthetic fixtures. Mark any quality concern for owner review. Verify user-facing Canvas participants match actual events.
7. Security and isolation results: backend-only sensitive RPCs, RLS/workspace boundaries, role allowlists, redaction/read-audit, prompt injection, version-specific approvals, idempotency and no unauthorized external effects. No new logging system, legacy intelligence or Roadmap redesign.
8. Actual test-mode AI/tool usage, totals, observed timing, rate/cost unknowns and remaining quotas if reliably available. No fabricated zero usage or cost. Confirm no SovereignEG, production DB writes, real publication or unapproved spend occurred.
9. Remaining production/owner acceptance work, exact required setup/authorization, run commands for local app/Admin and reproducible regression checks, and the next smallest action. No commit, push, deploy, remote DB migration or production mode change.

**Definition of done:** the new five-role Employee is implemented according to the approved specification and genuine model-driven behavior is verified in authorized test mode where required; tools and skills are governed server-side; the owner can inspect actual per-agent/per-tool execution and outputs in Admin; task results are correctly delivered/versioned with approvals; and any unavailable capabilities or unverified production requirements are explicit. Successful compilation or a polished final answer alone is not completion.

---

## 6. Execution instruction

Start with the repository and source-of-truth checks, then Phase 0 verification and Phase 0.5. Implement the remaining phases in order in this same assignment, automatically advancing only after each applicable technical gate passes. Maintain progress and actual test evidence continuously. Do not pause merely to ask for ordinary phase approval. Stop only for a genuine required blocker, a security/spend/authorization boundary, or completion. If blocked, produce the partial final report with exactly what was completed and what is needed to resume. Do not return another high-level plan instead of doing the authorized implementation.
