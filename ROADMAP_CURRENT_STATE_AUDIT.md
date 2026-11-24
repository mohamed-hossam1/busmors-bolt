# Roadmap — Current State Audit

**Scope:** Read-only audit of the Roadmap feature in Busmora.
**Repo:** `/home/mohamed/Mohamed/busmora-bolt/busmors-bolt`
**Date:** 2026-11-24
**Constraint honoured:** No fixes, no redesign, no file modifications, no live AI calls, no provider spend, no interference with the ongoing Employee cleanup, no `.env`/credential exposure.

> Note on verification: findings below are from **source inspection**. "Runtime-verified" means confirmed against an actual DB migration/function definition or committed code path, not from live execution. A recent e2e run is not present for Roadmap (no Roadmap spec in `e2e/specs/`).

---

## 0. TL;DR

The Roadmap is a **functional, owner-driven planning product** built on a Discovery interview → AI-generated roadmap → owner-executed steps, with check-ins, learning log, and AI-proposed revisions awaiting owner approval. Its **core loop works**: discovery answers persist, a roadmap is generated via the AI gateway and saved atomically, steps can be marked complete/blocked/skipped/reopened, check-ins are recorded and evaluated by AI, and revisions are proposed/approved/rejected.

The **Employee-integration surface is deliberately severed** during the Employee rebuild:
- **Ask My Director** (Discovery Q → Director research) — disabled, returns a friendly error.
- **Roadmap step-task delegation** (`startStepTask`) — disabled at the API (HTTP 409) and in the UI; DB function `start_roadmap_step_task` is revoked from `authenticated` by the cleanup guard.

These two are the only broken flows, and they are intentionally gated, not silently broken.

---

## 1. Current Product Features

### 1.1 User journey (end to end)

1. **Entry** — `RoadmapPage` (`src/screens/RoadmapPage.tsx`) loads and calls `load_active_roadmap` RPC.
   - If an active roadmap exists → renders `RoadmapPlan`.
   - Otherwise → renders `DiscoveryWizard` (goal picker).
2. **Goal selection** — `DiscoveryWizard` shows 8 business-challenge cards (`discovery.ts` `DISCOVERY_GOALS`). Selecting one calls `save_discovery_draft` (create or re-goal), then `sync_discovery_questions` with a deterministic plan (`buildDiscoveryPlan`).
3. **Discovery interview** — question cards render choice/text/long-text inputs. Answers autosave (debounced 700ms for text) and flush on blur/continue/generate via `save_discovery_answer`. Each answer can be marked `unknown` / `skipped` / `not_applicable`. Brain facts pre-fill options and show an "already known from your Brain" card.
4. **Generate** — "Generate roadmap" calls `generateRoadmap` → `POST /api/roadmap` `{action:'generate'}` → `generateRoadmapFromDiscovery` → AI `roadmap` op → `save_generated_roadmap` RPC (archives prior active roadmap, inserts new roadmap/version/steps, records brain context deps, marks draft `planned`). On success, UI switches to `RoadmapPlan`.
5. **Plan view** — objective, progress %, diagnosis, metrics table, priorities, risks, milestone-grouped step cards, history panel.
6. **Step execution (owner)** — owner steps expose Mark complete / Mark blocked / Skip / Reopen → `set_roadmap_step_status`. Director steps expose a Delegate button that is disabled with a message.
7. **Check-in** — "Review progress" drawer: 7 qualitative textareas → `record_roadmap_checkin` → `evaluateCheckin` (AI) → shows worked/didNotWork/learned/nextStep + a recommendation (continue/adjust/pause/change_direction).
8. **Adjust** — "Adjust" drawer: free-text change request → `proposeRevision` (AI `roadmap_revision`) → creates a `proposed` version.
9. **Approve/reject revision** — History panel → `decideRoadmapRevision`. Approve promotes the proposed version to active, archives the old, and carries forward unchanged steps' completion/attestation/task_id by `step_key`.

### 1.2 Feature status

| Area | Status | Evidence |
|---|---|---|
| Goal picker (8 challenges, EN + AR) | **Implemented** | `discovery.ts:23-123` |
| Discovery question plan (deterministic, per-goal) | **Implemented** | `buildDiscoveryPlan` `discovery.ts:205-546` |
| Discovery answer autosave + conflict handling | **Implemented** | `DiscoveryWizard.tsx:541-714` |
| Brain-fact prefill / reuse | **Implemented** | `eligibleBrainFacts`, `brainOption` `discovery.ts:149-198` |
| "Continue with preliminary plan" | **Implemented** | `continuePreliminary` `DiscoveryWizard.tsx:723-751` |
| Generate roadmap (AI) | **Implemented** | `generator.ts`, `save_generated_roadmap` |
| Plan view (objective/diagnosis/metrics/priorities/risks/milestones) | **Implemented** | `RoadmapPlan.tsx:180-349` |
| Step status changes (complete/blocked/skip/reopen) | **Implemented** | `set_roadmap_step_status`, `RoadmapPlan.tsx:116-132` |
| Progress %, milestone grouping | **Implemented** (client-computed) | `RoadmapPlan.tsx:92-114` |
| Check-in record + AI evaluation | **Implemented** | `adapt.ts:evaluateCheckin`, `roadmap_checkins` |
| Proposed revision (AI) | **Implemented** | `adapt.ts:proposeRevisionFromRequest`, `propose_roadmap_revision` |
| Revision approve/reject | **Implemented** | `decide_roadmap_revision`, `RoadmapHistoryPanel` |
| Version history + learning log display | **Implemented** (read-only) | `load_roadmap_history`, `RoadmapReview.tsx` |
| Stale Brain context warning | **Implemented** | `load_active_roadmap` stale query, `RoadmapPlan.tsx:211-221` |
| **Ask My Director (Q research)** | **Disabled (intentionally)** | `DiscoveryWizard.tsx:716-721`, `route.ts` |
| **Roadmap step-task delegation** | **Disabled (intentionally)** | `route.ts:47-52`, `RoadmapPlan.tsx:134-137` |
| `add_roadmap_learning` (write) | **Dead client code** — API wrapper exists, **no UI calls it** | `api.ts:210-238`; `grep` finds no caller |
| Roadmap Research panel / proposal module | **Removed** (deleted in working tree) | `RoadmapResearchPanel.tsx`, `proposal.ts` deleted |
| Employee-linked roadmap step tasks | **Unavailable** — executor fails fast | `task-executor.ts:63-88` |

---

## 2. UI/UX

### 2.1 Pages / routing
- Route: `src/app/[lang]/(workspace)/roadmap/page.tsx` → re-exports `src/screens/RoadmapPage.tsx`.
- `loading.tsx` → `RoadmapSkeleton` (`src/components/skeletons/RoadmapSkeleton.tsx`).
- Nav: `src/components/AppShell.tsx:28` (`ROADMAP` item), with a mobile shortcut group at line 98 grouping EMPLOYEE/ROADMAP/SCHEDULING.

### 2.2 Components
- **`RoadmapPage`** (`src/screens/RoadmapPage.tsx`) — view switch: `loading` → `roadmap` | `discovery`; falls back to Discovery on load error (no dead end).
- **`DiscoveryWizard`** (`src/features/roadmap/DiscoveryWizard.tsx`, 1082 lines) — goal picker, sticky save bar, question cards, earlier-answers accordion, sidebar (progress, "From your brain" facts, open unknowns, Generate card). `QuestionCard` subcomponent handles choice/text/long-text, `unknown/skipped/not_applicable/clear`, reuse banner, conflict banner, Ask-Director box.
- **`RoadmapPlan`** (`src/features/roadmap/RoadmapPlan.tsx`, 512 lines) — header with Review/Adjust/Edit-Discovery/Refresh; stale-context alert; objective + progress cards; diagnosis/metrics/priorities/risks sections; milestone-grouped `StepCard`s; history panel; check-in/adjust drawers.
- **`RoadmapReview`** (`src/features/roadmap/RoadmapReview.tsx`) — `RoadmapCheckinPanel`, `RoadmapAdjustPanel`, `RoadmapHistoryPanel` (pending revision approve/reject, learning list, collapsible version history).
- **`RoadmapSkeleton`** — header + banner + 4 goal cards (note: it mocks a *goal-card* grid, not the actual plan layout — cosmetic mismatch, see §6).

### 2.3 Dialogs / interactions
- Check-in and Adjust are right-side drawers (`fixed inset-0 … justify-end`, `role="dialog" aria-modal`).
- No focus-trap/restore logic in the drawers beyond the shared `useDialog` used elsewhere; Roadmap drawers do not use `useDialog` (minor a11y gap).
- Mark-complete etc. are inline buttons; no confirmation dialogs for destructive actions (none are destructive).

### 2.4 States
- **Loading:** `RoadmapPage` spinner; `RoadmapPlan` `roadmapLoading` spinner; `RoadmapHistoryPanel` `roadmapLoadingHistory`; skeleton on route load; `Spinner` in buttons.
- **Empty:** no roadmap → Discovery goal picker; no steps → `roadmapNoSteps`; no metrics/priorities/risks → sections hidden; no learning → `roadmapNoLearning`; no versions → `roadmapNoHistory`; no eligible facts → `noEligibleFacts`.
- **Error:** load failure cards with Retry; per-answer save errors; `STALE_VERSION` conflict banners with "load latest"/"save mine"; generate error inline; `saveFailed`; `roadmapStepUpdateFailed`; `roadmapActionFailed`; `roadmapResearchStale`.
- **Completion/in-progress:** save-state badge (`saving`/`saved`/`error`/`unsavedChanges`); progress bar; generating spinner; evaluating spinner; step running spinner.
- **Disabled features:** Ask-Director and Delegate render enabled-looking buttons that, when clicked, only surface an error string (not disabled) — see §6.

---

## 3. Roadmap Intelligence

### 3.1 Generation pipeline
`src/server/roadmap/generator.ts` → `generateRoadmapFromDiscovery`:
1. `load_discovery` RPC → latest draft + questions; require active questions.
2. Parallel fetch: approved Brain facts (`brain_nodes` where `status=approved AND approval_state=approved AND is_current=true`, limit 200) + `workspace_settings` (country/currency/target_market/timezone).
3. Build `answers[]` (localized labels, positive answers only) and `approvedFacts[]` (category/title/summary[≤700]/verificationState).
4. `callAi({ operation:'roadmap', maxTokens:4200 })` with a JSON user prompt (capped 50k chars).
5. `JSON.parse` → `normalizePlan` (shared validator `plan-parse.ts`): clamps to ≤12 steps, bounds string lengths, validates priority/responsibility/executionMode, drops steps with no title.
6. Persist via `save_generated_roadmap` RPC; handle `STALE_VERSION` → typed error.

### 3.2 Models / prompts / tools
- **Model routing** (`src/config/ai-models.ts`): `roadmap` and `roadmap_revision` → `dahl / deepseek-ai/DeepSeek-V4-Flash-0731`, temp 0.3. `roadmap_answer` and `roadmap_checkin` → `router` = `groq / openai/gpt-oss-120b`. (Both PROD and TEST maps are identical for these.)
- **System prompts** (`src/server/ai/operations.ts` `OPERATIONS`): `roadmap`, `roadmap_revision`, `roadmap_checkin`, `roadmap_answer`. Each embeds the shared `rules` (anti-hallucination, untrusted-data, language-match, no fabricated numbers/sources).
- **Output validation** (`validateOutput`): `roadmap`/`roadmap_revision` require `title` + 1–12 steps; `roadmap_checkin` requires a valid `recommendation` + reason; `roadmap_answer` requires `answer` + confidence.
- **Tools:** none (no function-calling). It is pure structured-JSON generation; "tools" = the persistence RPCs and `callAi` gateway.
- **Gateway:** `src/server/call-ai.ts` → `src/server/ai-generate.ts` (`generateAi` → `/api/ai`), provider/key resolved server-side (keys not exposed to client).

### 3.3 How Business Brain knowledge influences generation
- **Eligibility filter:** `eligibleBrainFacts` (`discovery.ts:149-156`) keeps only `status==='approved' && approval_state in (undefined,'approved') && is_current!==false && verification_state!=='contradicted'`.
- **Discovery prefill:** audience/offerings/company_profile categories pre-select answer options and show reuse provenance (`buildDiscoveryPlan`).
- **Generation context:** approved facts + settings are injected as `approvedFacts`/`market` into the AI prompt; `contextRefs` (nodeId+version) are stored.
- **Provenance/grounding:** `context_dependencies` rows are written only when a matching `brain_versions` snapshot exists (guards the owner trigger).
- **Staleness feedback:** `load_active_roadmap` computes `staleContext` when a referenced brain node was deleted / un-approved / re-versioned / changed — surfaced as an amber alert, **not** an auto-rewrite.

### 3.4 Adaptation to progress & changing circumstances
- **Check-ins:** `record_roadmap_checkin` stores qualitative answers; `evaluateCheckin` (AI `roadmap_checkin`) returns worked/didNotWork/learned/nextStep + recommendation (`continue|adjust|pause|change_direction`). Advisory only — no auto-mutation.
- **Revisions:** `proposeRevisionFromRequest` compares a free-text change request against current steps and produces a `proposed` version + `diff` (added/removed/modified/reordered/rationale). Owner approves via `decide_roadmap_revision`; completed steps carry forward by stable `step_key`.
- **Learning log:** table + read UI exist; the write path (`add_roadmap_learning` RPC + `addRoadmapLearning` client) is implemented but **not wired to any UI** — effectively dormant.
- **Automatic adaptation:** none. All adaptation is owner-initiated and owner-approved; the model is advisory.

---

## 4. Data & Architecture

### 4.1 Database tables (base schema: `20261118020000_competition_contracts.sql`)
| Table | Purpose | Key columns |
|---|---|---|
| `discovery_drafts` | one draft per workspace | `workspace_id, version, goal, status(draft/planned/archived), context_refs` |
| `discovery_questions` | adaptive questions | `draft_id, question_key, position, schema, status(unanswered/answered/unknown/skipped/not_applicable/researching/confirmed), value, provenance, branch` |
| `question_research_links` | Q → Director research link (now unused by client) | `question_id, conversation_id, task_id, proposed_answer, status` |
| `roadmaps` | one active roadmap per workspace | `workspace_id, goal, version, status(draft/active/archived/rejected), draft_id, active_version_id` |
| `roadmap_versions` | immutable versions | `roadmap_id, version, base_version, status(proposed/active/archived/rejected), summary jsonb, diff jsonb, context_refs` |
| `roadmap_steps` | executable steps | `plan_version_id, step_key, position, title, responsibility(owner/system), execution_mode(director/owner), dependencies, status, attestation, task_id, owner_note, completed_at` |
| `context_dependencies` | brain-fact → consumer links | `node_id, node_version, consumer_type(…/roadmap), consumer_id, resolved_at` |
| `step_actions` | step action log (legacy) | `step_id, action(run/attest/skip/revisit/cancel)` |

**Added by `20261124002000_roadmap_director_loop.sql`:**
- Columns on `roadmap_steps`: `milestone_key, success_criteria, priority, metric, due_hint, owner_note, completed_at`.
- `roadmap_checkins` (RLS owner-read; writes via SECURITY DEFINER RPC).
- `roadmap_learning` (RLS owner-read; writes via SECURITY DEFINER RPC).
- Extended `question_research_links` with `error_message`, `updated_at`.

### 4.2 Relationships
```
workspaces 1─∞ discovery_drafts 1─∞ discovery_questions
workspaces 1─∞ roadmaps 1─∞ roadmap_versions 1─∞ roadmap_steps
roadmaps.draft_id → discovery_drafts ; roadmaps.active_version_id → roadmap_versions
roadmaps 1─∞ roadmap_checkins ; roadmaps 1─∞ roadmap_learning
brain_nodes 1─∞ context_dependencies (consumer_type='roadmap')
roadmap_steps.task_id → tasks.id ; question_research_links.question_id → discovery_questions
```

### 4.3 Server modules / APIs
- **API route:** `src/app/api/roadmap/route.ts` (POST actions: `load`, `setStepStatus`, `generate`, `proposeRevision`, `evaluateCheckin`, `startStepTask` [stubbed 409]; GET: `load`). Uses `requireApiIdentity` (auth + CSRF origin check), then a **token-scoped Supabase client** for AI/privileged paths.
- **Server logic:** `src/server/roadmap/generator.ts`, `src/server/roadmap/adapt.ts`; AI gateway `src/server/call-ai.ts` + `src/server/ai-generate.ts`.
- **Client API wrapper:** `src/features/roadmap/api.ts` (mixed: some calls hit `/api/roadmap`, others call Supabase RPCs directly from the browser).
- **RPCs (server-of-record):** `load_discovery`, `save_discovery_draft`, `sync_discovery_questions`, `save_discovery_answer`, `plan_discovery_draft` (`20261119014000_adaptive_discovery.sql`, updated by `20261123120000_discovery_challenges.sql`); `save_generated_roadmap`, `load_active_roadmap`, `set_roadmap_step_status` (`20261124000000_roadmap_generation.sql`, superseded by `20261124002000_roadmap_director_loop.sql`); `record_roadmap_checkin`, `save_checkin_evaluation`, `add_roadmap_learning`, `propose_roadmap_revision`, `decide_roadmap_revision`, `load_roadmap_history`, `start_roadmap_step_task`, `start_question_research`, `load_question_research`, `save_question_research_proposal`, `decide_question_research` (`20261124002000_roadmap_director_loop.sql`).

### 4.4 State management
- **Persistence:** Supabase Postgres via RPCs (client + token-scoped service client). No local-store source of truth.
- **Local UI state:** `DiscoveryWizard` keeps a local answer map with debounced autosave, in-flight/pending refs, `beforeunload` warning, and `pagehide` flush. `RoadmapPlan` holds loaded data + optimistic step-status updates.
- **Concurrency:** optimistic-concurrency via `version` columns (`discovery_drafts.version`, `roadmap_checkins.version`, `roadmaps.version`) with `STALE_VERSION` handling end-to-end.

### 4.5 Auth / workspace isolation / RLS
- Workspace = `auth.uid()` everywhere; `requireApiIdentity` validates origin on writes; page-level `requireWorkspace` bootstraps the workspace.
- **RLS:** `discovery_drafts`, `discovery_questions`, `question_research_links`, `roadmaps`, `roadmap_steps`, `context_dependencies`, `step_actions` have owner read/write policies (`workspace_id=auth.uid()`). `roadmap_versions` and the new `roadmap_checkins`/`roadmap_learning` are **read-only to `authenticated`** — all writes go through `SECURITY DEFINER` functions that check `auth.uid()`. `roadmap_checkins`/`roadmap_learning` also grant ALL to `service_role`.
- **AI/token isolation:** privileged actions build a per-request client with the user's bearer token; no service-role key is exposed to the browser.
- **Note:** most RPCs are `SECURITY DEFINER` and enforce `workspace_id = auth.uid()` internally; the direct table grants are defence-in-depth.

---

## 5. Employee Integration

### 5.1 Ask My Director (Discovery Q → research)
- **DB path exists but is disabled/unreferenced:** `start_question_research`, `load_question_research`, `save_question_research_proposal`, `decide_question_research` are defined in `20261124002000_roadmap_director_loop.sql`.
- **Client disabled:** `DiscoveryWizard.askDirector` (`:716-721`) does not call any RPC; it sets an error: *"Ask my Director is temporarily unavailable while Employee intelligence is rebuilt. Your answers are safe."*
- **Still referenced server-side (cleanup only):** `src/server/task-executor.ts` calls `load_question_research`/`decide_question_research` in `failLinkedQuestion` to mark any in-flight research failed. No UI or route invokes the start path.
- **DB guard:** `20261125000000_employee_intelligence_cleanup_guard.sql` revokes EXECUTE on `start_question_research` from `PUBLIC/authenticated/anon`.

### 5.2 Roadmap step delegation
- **DB path exists:** `start_roadmap_step_task` (creates conversation + `enqueue_task` with `origin.kind='roadmap_step'`, sets step `running`, stores `task_id`).
- **API disabled:** `route.ts:47-52` returns HTTP 409 `TASK_EXECUTION_UNAVAILABLE` for `startStepTask`.
- **UI disabled:** `RoadmapPlan.delegate` (`:134-137`) sets an error instead of calling; the button is visually enabled (see §6).
- **Executor fails fast:** `src/server/task-executor.ts:63-88` — any `roadmap_step` origin task restores the step to `ready` and stops the task failed with "Employee intelligence is being rebuilt…". `enqueue_task`/`complete_task`/etc. are also revoked from `authenticated` by the cleanup guard.

### 5.3 Dependencies on removed/deprecated Employee intelligence
- **`origin.kind='roadmap_step'`** still typed in `src/lib/contracts.ts:6` and handled in `task-executor.ts` and `DeliverablesPage.tsx:33` (label only). The creation path (`start_roadmap_step_task`) is unreachable from the app.
- **Task origin rendering** in Deliverables still anticipates roadmap steps.
- No roadmap code imports the deleted `src/features/orchestrator/director-handoff.ts`, `src/features/research/*`, or `src/server/research/*` (verified via grep) — roadmap is not coupled to the removed research agents.

### 5.4 What remains functional independent of Employee
- Full Discovery flow (goal → questions → autosave → preliminary → generate).
- AI roadmap generation (own `roadmap` operation + `dahl` model).
- Plan viewing, owner step status changes, progress.
- Check-ins + AI evaluation (`roadmap_checkin` via router model).
- Proposed revisions + approve/reject (`roadmap_revision` via `dahl`).
- History, version list, learning display, stale-context warnings.

**Only** Ask-My-Director and step-task delegation depend on Employee; both are cleanly gated.

---

## 6. Current Problems

### 6.1 Intentional disabled flows (documented, not regressions)
- Ask My Director + step delegation both render **enabled-looking buttons that only emit an error** when clicked (`DiscoveryWizard.tsx:351-359`, `RoadmapPlan.tsx:466-484`). This is misleading UX: a disabled/`aria-disabled` state or hiding the affordance would be cleaner. (`delegate` and `askDirector` never call the network.)
- `start_roadmap_step_task`, `start_question_research` remain in the DB (revoked, not dropped) — dormant surface area.

### 6.2 Dead / unwired code
- **`addRoadmapLearning`** (`api.ts:210-238`) + `add_roadmap_learning` RPC have **no caller**. The learning log is read-only in the UI; there is no way for an owner to add a learning entry, despite the schema/UI supporting it.
- **`owner_note`** is written by `set_roadmap_step_status` (from `attestation.note`) but never rendered or captured in the UI — `RoadmapPlan` sends `setRoadmapStepStatus(step.id, status)` with no attestation/note, so owner notes can never be recorded through the product.
- `roadmap_answer` operation + `save_question_research_proposal` + `load_question_research` client functions are orphaned (no UI path).
- `src/lib/contracts.ts` `roadmap_step` origin + `DeliverablesPage` label are leftover from the removed delegation path.
- `askingId` state (`DiscoveryWizard.tsx:412`) is a constant `null` with no setter — dead state (Ask-Director always shows `askingDirector=false`).

### 6.3 Duplicated / inconsistent logic
- **Step "done" definition duplicated:** `DONE_STATUSES` in `RoadmapPlan.tsx:32` includes `owner_reported`, but `save_generated_roadmap` always writes `'ready'` and nothing sets `owner_reported` (it is only reachable if a task set it, which is disabled). `set_roadmap_step_status` allows `owner_reported` but the UI never sends it. Status vocabulary is broader than what the UI can produce.
- **Two plan-validation surfaces:** `validateOutput` (operations.ts) and `normalizePlan` (plan-parse.ts) both bound 1–12 steps with slightly different rules; the generator relies on `normalizePlan` and never calls `validateOutput` for `roadmap` (the `/api/ai` path may, but generation does not). Minor duplication.
- **Two client transports:** some Roadmap calls go through `/api/roadmap` (`api.ts:roadmapRequest`), others call Supabase RPCs directly from the browser (`loadDiscovery`, `saveDiscoveryDraft`, `loadRoadmapHistory`, `recordRoadmapCheckin`, `decideRoadmapRevision`). Mixed auth/CSRF surface.
- **`load_discovery`/`save_discovery_draft` goal validation duplicated** across `20261119014000_adaptive_discovery.sql` and `20261123120000_discovery_challenges.sql` (the latter supersedes the former — acceptable, but the legacy list is still present in older migration text).

### 6.4 Technical debt / sharp edges
- **Skeleton mismatch:** `RoadmapSkeleton` mocks a 4-card "goal outcome" grid, but the actual initial screen is the Discovery goal picker or the plan view — the skeleton does not resemble either.
- **No focus management** in check-in/adjust drawers (no `useDialog`, no Esc-to-close, no focus restore).
- **Generation is single-attempt** — no retry/streaming; a transient provider error surfaces as a generic failure (acceptable, but no partial save).
- **`load_active_roadmap` returns steps for the active version only**; a pending *proposed* revision's steps are loaded separately in history — fine, but two read paths for "current plan vs proposed plan."
- **History panel "learning" is append-only display** with no mutation UI (see 6.2).
- **`roadmap_steps` owner write policy is broad** (`FOR ALL … USING/WITH CHECK workspace_id=auth.uid()`) — the app only writes via `set_roadmap_step_status`, but direct table writes are permitted; other sensitive tables (`roadmap_versions`) correctly restrict to read-only.
- **`normalizePlan` casts nested objects** (`diagnosis`, `metrics`, etc.) with `as unknown as` — no deep validation of those sub-shapes; malformed model output for metrics/risks could render oddly (UI guards with `||` fallbacks, so no crash).
- **No automated test for the generation/happy path** — `tests/roadmap/` only contains `plan-parse.test.ts` (unit) and `discovery-disabled.test.ts` (string-presence guards). No test exercises `generateRoadmapFromDiscovery`, check-ins, or revisions. No e2e spec for Roadmap.

---

## 7. Feature Inventory

Legend: **Source** = code exists; **Runtime** = backed by a defined DB function / verified wiring.

| # | Feature | Source | Runtime | Notes |
|---|---|---|---|---|
| 1 | Goal picker (8 challenges, EN/AR) | Yes | Yes | `discovery.ts` |
| 2 | Deterministic Discovery question plan | Yes | Yes | `buildDiscoveryPlan` |
| 3 | Discovery answer autosave + conflict resolution | Yes | Yes | `save_discovery_answer`, STALE_VERSION |
| 4 | Brain-fact prefill & "already known" reuse | Yes | Yes | `eligibleBrainFacts` |
| 5 | Preliminary plan state | Yes | Yes | `plan_discovery_draft` |
| 6 | Generate roadmap (AI) | Yes | Yes | `roadmap` op + `save_generated_roadmap` |
| 7 | One-active-roadmap invariant + history archive | Yes | Yes | migration RPC |
| 8 | Plan view: objective/summary | Yes | Yes | `RoadmapPlan` |
| 9 | Plan view: diagnosis (what/belief/hypothesis/evidence/alternatives/confidence/unknowns) | Yes | Yes | model JSON + render |
| 10 | Metrics table | Yes | Yes | render guarded |
| 11 | Priorities | Yes | Yes | |
| 12 | Risks / assumptions / mitigations | Yes | Yes | |
| 13 | Milestones + step grouping | Yes | Yes | `milestone_key` |
| 14 | Step cards (objective/rationale/uncertainty/approval/checklist/effort) | Yes | Yes | |
| 15 | Owner step status: complete/blocked/skip/reopen | Yes | Yes | `set_roadmap_step_status` |
| 16 | `owner_reported` status | Partial | No UI | RPC allows; UI never sends |
| 17 | Owner note on completion | Partial | No | column + RPC read `attestation.note`; no UI |
| 18 | Progress % (client) | Yes | Yes | derived |
| 19 | Stale Brain-context alert | Yes | Yes | `load_active_roadmap` |
| 20 | Check-in capture (7 qualitative fields) | Yes | Yes | `record_roadmap_checkin` |
| 21 | Check-in AI evaluation + recommendation | Yes | Yes | `roadmap_checkin` op |
| 22 | Learning log — display | Yes | Yes | `load_roadmap_history` |
| 23 | Learning log — add | Partial | No UI | `add_roadmap_learning` + `addRoadmapLearning` unused |
| 24 | Proposed revision (AI) | Yes | Yes | `roadmap_revision` + `propose_roadmap_revision` |
| 25 | Revision approve (carry-forward by step_key) | Yes | Yes | `decide_roadmap_revision` |
| 26 | Revision reject | Yes | Yes | `decide_roadmap_revision` |
| 27 | Version history list | Yes | Yes | collapsible |
| 28 | **Ask My Director (Q research)** | Partial (DB+server) | **Disabled** | client stub; RPC revoked |
| 29 | **Roadmap step-task delegation** | Partial (DB) | **Disabled** | 409 at API; executor fails fast |
| 30 | Research panel / proposal module | Removed | — | files deleted in working tree |

---

## 8. Uncommitted Changes (summary only, not modified)

Working tree vs HEAD, Roadmap-related:

- **`src/app/api/roadmap/route.ts`** (MM) — adds `proposeRevision`/`evaluateCheckin` handling (token-scoped client) and the `startStepTask` → 409 stub; adds `RevisionError` handling; re-indents try/catch.
- **`src/server/roadmap/adapt.ts`** (AM) — now exports `proposeRevisionFromRequest` + `evaluateCheckin` (revision/check-in AI paths). Staged+working modifications present.
- **`src/server/roadmap/generator.ts`** (M) — trimmed; now delegates to shared `plan-parse.normalizePlan` and `save_generated_roadmap` (milestone/priority/metric fields).
- **`src/features/roadmap/DiscoveryWizard.tsx`** (MM) — Ask-Director UI box added but wired to a disabled stub; `askingId` dead state; `UserRoundSearch` import.
- **`src/features/roadmap/RoadmapPlan.tsx`** (MM) — Delegate button added but disabled (`delegate` sets error); otherwise plan view.
- **`src/features/roadmap/api.ts`** (MM) — adds history/check-in/learning/revision client wrappers; `loadActiveRoadmap` now returns `staleContext`.
- **`src/features/roadmap/types.ts`** (MM) — adds history/check-in/learning/record types; `RoadmapStaleContext`.
- **`src/features/roadmap/plan-parse.ts`** (??, untracked) — new shared `normalizePlan`/`normalizePlanStep` (used by generator + adapt).
- **Deleted (working tree):** `src/features/roadmap/RoadmapResearchPanel.tsx` (280 lines), `src/server/roadmap/proposal.ts` (112 lines) — the old research/proposal path.
- **New migrations (staged, A):**
  - `supabase/migrations/20261124002000_roadmap_director_loop.sql` — step metadata columns, check-ins/learning tables, revision RPCs, research RPCs.
  - `supabase/migrations/20261125000000_employee_intelligence_cleanup_guard.sql` — revokes task/research RPC EXECUTE from `authenticated` (Employee cleanup defence-in-depth).
  - `supabase/migrations/20261124001000_conversation_title_no_raw_request.sql` — unrelated (chat title).
- **New tests (untracked/staged):** `tests/roadmap/discovery-disabled.test.ts` (asserts disabled Ask-Director/delegation + removed modules), `tests/roadmap/plan-parse.test.ts`.
- **Net diff (roadmap dirs):** +42 / −711 lines — a deliberate *removal* of the Employee research/delegation surface and consolidation onto `plan-parse`.

**Security note on uncommitted work:** the cleanup guard revoking `start_roadmap_step_task`/`start_question_research` from `authenticated` is consistent with the disabled UI; it is defence-in-depth and reversible via a later migration.

---

## 9. Answers to the specific questions asked

- **What can users do today?** Run Discovery, generate an AI roadmap, view a structured plan, mark owner steps complete/blocked/skipped/reopen, record & AI-evaluate check-ins, propose/approve/reject AI revisions, and view history + learnings. *(§1, §7)*
- **What is broken?** Only the two Employee-linked features (Ask My Director, step delegation) — intentionally disabled with error messages, not silently broken. *(§5)*
- **What is placeholder/disabled?** Ask-Director buttons, Delegate button, `startStepTask` (409). *(§6.1)*
- **What is dead/unwired?** `addRoadmapLearning`, `owner_note` capture, `roadmap_answer`/`question_research` client functions, `roadmap_step` origin in contracts/Deliverables, `askingId`. *(§6.2)*
- **Hardcoded behavior?** Goal taxonomy, question schemas, option lists, and AR translations are all deterministic in `discovery.ts` — no DB-driven content; this is intentional (no invented facts) but means the interview is not configurable without code changes.
- **AI models/prompts:** `dahl/deepseek-ai/DeepSeek-V4-Flash-0731` for roadmap/revision; `groq/openai/gpt-oss-120b` for check-in/answer; prompts in `src/server/ai/operations.ts`; no tools, structured-JSON only. *(§3)*
- **Business Brain influence:** approved, current, non-contradicted facts prefill Discovery and ground generation; `context_dependencies` + stale-context warnings keep the link honest. *(§3.3)*
- **Adaptation:** owner-initiated check-ins and AI-proposed revisions, owner-approved; no automatic re-planning. *(§3.4)*