# Busmora — Admin & Employee Observability Audit

> **Type:** Read-only, static audit. No application code, schema, database rows, environment values, or provider resources were modified or invoked.
> **Repo:** `/home/mohamed/Mohamed/busmora-bolt/busmors-bolt` · **Branch:** `feat/chat-agent` · **Date:** 2026-11-24
> **Method:** Source inspection of routes, server modules, migrations, and UI. No `.env` values read (only variable *names* from `.env.example`).

## Confidence labels

| Label | Meaning |
|---|---|
| **[V]** Verified | Directly read in source/schema (file:line cited). |
| **[I]** Inferred | Follows from code but not observed at runtime. |
| **[A]** Assumption | Reasonable but unconfirmed (e.g. DB already migrated, provider liveness). |

## Critical context before the findings

Two facts reshape this audit:

1. **The admin execution-observability subsystem exists and is functional at the infrastructure level**, but the **Employee execution it was built to observe has been removed.** `src/server/task-executor.ts` is now a fail-fast stub that marks every claimed task `failed` with `capability_unavailable` (`task-executor.ts:61-92`). The `/api/tasks` route rejects `submit`/`resume`/`answer` with HTTP 409 and the Orchestrator never enqueues tasks (`src/app/api/tasks/route.ts:48-75`). **In the current tree the admin dashboard will therefore only ever show Orchestrator-level traces (direct / brain / unavailability), never task-level agent/model/tool traces** — because no task with a `trace_id` is ever created. **[V]**
2. **A rebuild target is defined but not implemented.** The five-agent model (Orchestrator, Director, Research, Content, Marketing Analyst) is spec-only (`BUSMORA_EMPLOYEE_MVP_SPEC.md`, `EMPLOYEE_CLEANUP_PLAN.md`). The observability collector is already shaped for hierarchical agent traces and is the right seam to extend — not duplicate.

---

## 1. Existing Admin pages, routes, components, APIs, database tables, access controls

### 1.1 Pages & routing **[V]**

| Path | File | Role |
|---|---|---|
| `/[lang]/admin` | `src/app/[lang]/admin/page.tsx` | Renders `AdminTraceList`. |
| `/[lang]/admin/layout.tsx` | `src/app/[lang]/admin/layout.tsx` | **Only page-level gate**: `await requireAdminPage()`. Wraps all nested admin routes. |
| `/[lang]/admin/traces/[id]` | `src/app/[lang]/admin/traces/[id]/page.tsx` | Server-renders `AdminTraceDetail` via `getTraceDetail(id)`; no per-page gate (relies on layout). |

### 1.2 API routes **[V]**

| Route | File | Guard |
|---|---|---|
| `GET /api/admin/traces` | `src/app/api/admin/traces/route.ts` | `requireAdminIdentity()` (401/403). |
| `GET /api/admin/traces/[id]` | `src/app/api/admin/traces/[id]/route.ts` | `requireAdminIdentity()`. |
| `GET /api/admin/health` | `src/app/api/admin/health/route.ts` | `requireAdminIdentity()`. |
| `GET /api/admin/check` | `src/app/api/admin/check/route.ts` | Returns `{isAdmin}`; used by Navbar. **[V]** |

All admin responses set `Cache-Control: private, no-store`. **[V]**

### 1.3 Components & server modules **[V]**

- UI: `src/features/admin/AdminTraceList.tsx` (table + filters), `src/features/admin/AdminTraceDetail.tsx` (metrics, per-attempt table, execution events, timeline), `src/features/admin/format.ts` (mapping/aggregation), `src/features/admin/types.ts` (client-safe types).
- Server: `src/server/admin/auth.ts` (`requireAdminIdentity`/`requireAdminPage`), `src/server/admin/identity.ts` (`isAdminUser`), `src/server/admin/traces.ts` (`listTraces`/`getTraceDetail`/`adminHealth`), `src/server/admin/actions.ts` (`checkIsAdminUser` server action), `src/server/supabase-admin.ts` (service-role client).
- Collector: `src/server/observability/{collector,config,sanitize,index}.ts`.

### 1.4 Database tables & views **[V]**

Migration `supabase/migrations/20261123140000_admin_execution_observability.sql`:

| Object | Kind | Notes |
|---|---|---|
| `admin_traces` | table | One aggregate row per trace (`id` = trace id). RLS enabled; **grants only to `service_role`**. |
| `admin_trace_events` | table | Append-only events, FK `trace_id → admin_traces(id) ON DELETE CASCADE`. Service-role only. |
| `admin_trace_list` | view | `FULL OUTER JOIN` of `admin_traces` and `tasks` on `tasks.trace_id = admin_traces.id`, with LATERAL fallbacks to `task_usage`, `agent_events`, `task_steps`. Only `service_role` may SELECT. |
| `record_admin_trace(jsonb,jsonb)` | RPC | `SECURITY DEFINER`, **rejects any role other than `service_role`** (`RAISE EXCEPTION 'NOT_AUTHORIZED'`), idempotent upsert + aggregate recompute. |
| `tasks.trace_id` | column | Nullable `uuid`, unique partial index `tasks_trace_unique`. |

Supporting pre-existing tables reused by the view/fallback: `agent_events`, `task_steps`, `task_usage` (migrations `20261017171908…`, `20261118020000…`, `20261118029000…`), `provider_usage` (`20261121000000…`), `orchestrator_runs` (`20261122120000…`).

### 1.5 Access control **[V]**

- **Identity-based, fail-closed.** `isAdminUser` (`identity.ts:20-25`) matches the Supabase `auth.users` record against `ADMIN_USER_ID` (csv) and/or `ADMIN_EMAIL`/`ADMIN_EMAILS` (csv). Missing config ⇒ nobody is admin.
- Page gate `requireAdminPage` redirects non-admins to `/signin`. API gate `requireAdminIdentity` throws 401/403.
- `requireWorkspace` (`src/server/auth.ts:18`) redirects admins *away* from customer workspace to `/admin`.
- Admin data access is exclusively via the **service-role client** (`createAdminClient`) which bypasses RLS; the admin auth check is the *only* gate in front of cross-tenant trace data. **[V]**

---

## 2. Trace IDs, task IDs, execution records, model/tool calls, event relationships

### 2.1 Identity model **[V]**

- `traceId` = `crypto.randomUUID()` minted per Orchestrator request (`gateway-server.ts:82`). It is the primary key of `admin_traces` **and** the value stored in `tasks.trace_id` (unique). One trace ⇒ at most one task.
- `idempotency_key` dedupes traces (`admin_traces_idempotency_key` unique per workspace) and is threaded into the collector identity.
- Dispatcher/resume path re-creates a collector bound to `task.trace_id` and calls `trace.setRun(task.run_id, task.attempts)` so retries append to the same trace (`task-dispatcher.ts:20-23`). **[V]**
- `instance_id` / `parent_instance_id` / `correlation_id` / `call_id` / `run_id` / `attempt` / `parent_agent_id` / `parent_event_id` all exist as event columns. **[V]**

### 2.2 Event types the collector can emit **[V]** (`collector.ts`)

- `recordModel` → `event_type='model'` with provider, model, operation, tokens (in/out/total/cached/reasoning), `duration_ms`, `fallback_used`, `retry_attempt`, `error`, `input_payload`, `output_preview`.
- `recordTool` → `event_type='tool'` with `tool_name`, provider, operation, status, `input_payload`, `output_preview`, `output_truncated`, `output_original_bytes`.
- `recordAgent` → `event_type='agent'` with `agent_id`, `agent_role`, `parent_agent_id`, `instance_id`, status, timing, `metadata.label`.

### 2.3 What actually gets recorded in the current tree **[V]**

Only the Orchestrator wires the collector (`gateway-server.ts`):

- `decide()` → `trace.recordModel({operation:'orchestrate', ... outputText})` (`gateway-server.ts:130-141`).
- `retrieveBrain()` → `trace.recordTool({toolName:'brain', output:{retrieved,categories}})` (`gateway-server.ts:148-158`).
- `answerFromBrain()` → `trace.recordModel({operation:'brain_answer', outputText})` (`gateway-server.ts:169-180`).
- Canvas events are mirrored: `tool_call`→`recordTool`, everything else→`recordAgent` (`gateway-server.ts:93-108`).
- `recordRun()` sets the trace result (status/route/finalReply/duration) (`gateway-server.ts:231-244`).

Flush is scheduled off the response path via `after(() => trace.flush())` (`gateway-server.ts:262-270`). Task dispatcher flushes task traces in its `finally` (`task-dispatcher.ts:36`).

### 2.4 Durable (non-admin) execution records **[V]**

| Table | Migration | Contents |
|---|---|---|
| `agent_events` | core + `20261122120000` | Canvas stream; `event_type ∈ agent_started/agent_tool_used/agent_completed/agent_error/tool_call/skill_read/delegation/flow_connection`; conversation- or task-scoped; has `instance_id`, `agent_role`, `public_message`, `redacted_parameters`, `failure_reason`, timestamps, `payload`. |
| `task_steps` | `20261118020000` | Per-run step log (`agent`, `label`, `status`, `input_summary`, `output`). |
| `task_usage` | `20261118020000` + `20261118029000` | Per-LLM-call ledger: `call_id`, `operation`, `usage` (input/output tokens), `state ∈ reserved/succeeded/failed`, `reserved_tokens`. Written by `finish_task_call` from `ai-generate.ts:243`. |
| `provider_usage` | `20261121000000` | Research provider calls (firecrawl/tavily/exa/egypt_official/osm/composio) with `reserved`/`actual`/`status`. |
| `orchestrator_runs` | `20261122120000` | Idempotency + outcome/path/metrics per message. |

---

## 3. Coverage matrix — recorded vs displayed

Legend: ● recorded & displayed · ◐ recorded but **not** displayed · ○ **not** recorded (or no current emitter).

| # | Data item | Recorded? | Displayed? | Evidence |
|---|---|---|---|---|
| 1 | Original user query | ● | ● | `admin_traces.request` (`collector.ts:92`, RPC `left(...,12000)`); shown in list (`AdminTraceList.tsx:149-152`) & detail (`AdminTraceDetail.tsx:75`). |
| 2 | Final response | ● | ● | `admin_traces.final_reply`; shown `AdminTraceDetail.tsx:201-206`. |
| 3 | Individual agent inputs/outputs | ◐ | ◐ | `recordAgent` stores only `metadata.label` + status/timing — **no agent input/output text** (`collector.ts:321-349`). Mirror path feeds canvas events, not agent I/O. |
| 4 | Individual LLM request payloads | ○ | ○ | Collector *supports* `input.systemPrompt/userPrompt` (`collector.ts:46,241-247`) but **no caller passes `input`**; gateway records `outputText` only. System/user prompts are never persisted. |
| 5 | Individual LLM response payloads | ◐ | ● | `output_preview.textHead` = first **2048 chars** (`MODEL_TEXT_CAP`, `config.ts:18`); shown in timeline "Payload" (`AdminTraceDetail.tsx:183-190`). Truncated beyond 2 KB. |
| 6 | Every tool call + args + result | ◐ | ◐ | `recordTool` captures `input_payload`+`output_preview` (`collector.ts:305-308`). But `toTimelineItem` for tools sets **only `output`** (`format.ts:77-80`) — **tool arguments are stored yet never rendered.** Only the `brain` retrieval tool is recorded today. |
| 7 | Loaded skills | ○ | ○ | No `recordSkill` API; no emitter emits `skill_read` into the admin trace. Research skills were deleted (`EMPLOYEE_CLEANUP_PLAN.md` §4.2 R11-R15). `skill_read` exists only as a canvas event type. |
| 8 | Parent-child agent relationships | ◐ | ○ | `parent_agent_id`/`parent_event_id`/`instance_id` captured (`collector.ts:326-331`); mapping sets `parent_instance_id` (`format.ts:148`) but **UI renders flat lists** (`AdminTraceDetail.tsx:129-193`), never a tree. |
| 9 | Timeline / duration / status | ● | ● | `seq`, `started_at`/`ended_at`/`duration_ms`, `status`; timeline + per-attempt table (`AdminTraceDetail.tsx:96-194`). |
| 10 | Provider / model / tokens | ● | ● | Captured on model events; totals in `admin_traces`; shown as metrics + timeline token line. |
| 11 | Estimated/actual **cost** | ○ | ○ | No cost field anywhere in collector, admin UI, or RPC (`rg cost` in admin/observability = 0 hits). Tokens only. |
| 12 | Errors | ● | ● | `error` per event + trace; shown `AdminTraceDetail.tsx:182`. |
| 13 | Retries | ◐ | ◐ | `retry_attempt` stored (`collector.ts:275`); UI shows `attempt` per event but **not** the `retry_attempt` field or a retry count. |
| 14 | Fallbacks | ◐ | ○ | `fallback_used` stored per model event (`collector.ts:276`) but **not displayed** (only `provider · model` shown). |
| 15 | Budget usage | ◐ | ○ | `tasks.allowance`/`consumption` and `tool_page_count`/`tool_credit_count` columns exist (`admin_traces`) but **neither the columns nor allowance/consumption are surfaced** in the UI. |
| 16 | Quality reviews | ○ | ○ | No trace event type; research evidence-audit was removed. |
| 17 | Clarification events | ○ | ○ | `task_inputs`/`await_task_input` exist (durable) but are **not** traced; task path is disabled. |
| 18 | Approval events | ○ | ○ | Brain/post approvals live in `audit_log`/approval tables, **not** in the admin trace. |
| 19 | Persistence events (save/complete/fail) | ○ | ○ | `save_task_result`/`stop_task` effects are durable in `tasks`/`task_results`, but are **not** emitted as trace events. |

---

## 4. Recorded-but-not-displayed vs not-recorded-at-all

### 4.1 Recorded but NOT displayed **[V]**

- **Tool arguments** (`admin_trace_events.input_payload` for `tool` rows) — stored, but `toTimelineItem` drops tool input (`format.ts:77-80`).
- **Agent hierarchy** — `parent_agent_id`, `parent_event_id`, `instance_id`, `correlation_id`, `run_id` captured; UI renders flat lists only.
- **`fallback_used`** flag per model event — captured, never rendered.
- **`retry_attempt`** as a distinct field — captured, only `attempt` shown.
- **Trace columns** `tool_page_count`, `tool_credit_count`, `max_attempt`, `duration_ms`, `message_id`, `idempotency_key`, and `metadata.origin` / `metadata.droppedCount` / `metadata.truncated` — populated by the RPC but not surfaced (duration is recomputed client-side instead of reading `duration_ms`).
- **Event hygiene fields** `output_original_bytes`, `output_truncated` (bytes) — only a "(truncated)" label is shown, not the byte count.
- **Fallback reconstruction payloads** — `getTraceDetail` fetches `fallback.steps` (task_steps.output) and `fallback.usage` (task_usage.usage) (`traces.ts:106-113`), but `AdminTraceDetail` only reads `fallback.agentEvents` (`AdminTraceDetail.tsx:42-47,196-200`). **Task step outputs and per-call token usage are fetched then discarded.**
- **`provider_usage`** — recorded durably for research providers; **never surfaced** in admin at all.
- **`orchestrator_runs.metrics`** — recorded; not surfaced (admin uses its own trace).
- **`task_results.output`** — persisted; not surfaced.

### 4.2 NOT recorded at all **[V]**

- **LLM request/system prompts** (collector field exists, unused by every caller).
- **Full LLM responses** beyond the 2 KB head.
- **Monetary cost** (no cost model exists).
- **Loaded skills** in the trace.
- **Quality reviews / clarification / approval / persistence** as trace events.
- **Research provider tool calls** inside an admin trace (only the separate, unlinked `provider_usage` table).
- **Sub-agent input/output payloads** (only labels/status/timing).

### 4.3 Consequence of the cleanup **[V]**

Because `executeTask` no longer records any model/tool/agent events and no task is enqueued, **the entire task-level half of the trace schema (model/tool/agent rows, `tasks.trace_id`, dispatcher re-hydration) is currently dormant.** The schema is ready; the emitters are gone.

---

## 5. Extending into an expandable hierarchical execution trace (no duplicate system)

The existing collector is already the correct, non-duplicative seam. Extend it rather than adding a parallel logger.

### 5.1 Data model — already hierarchical-ready

`admin_trace_events` already carries `parent_event_id`, `parent_agent_id`, `instance_id`, `run_id`, `attempt`, `correlation_id`. A five-agent run maps cleanly:
- `agent` rows for Orchestrator → Director → {Research, Content, Marketing Analyst}, linked via `parent_agent_id`/`parent_event_id`.
- `model` rows as children of the agent that issued them (`parent_event_id` = agent event id).
- `tool` rows as children of the agent/operation that invoked them.

**Recommendation:** add one `recordSkill` method (emit `event_type='skill'` or reuse `metadata.skill`) and thread `input` into `recordModel`, then have every agent call `recordModel`/`recordTool`/`recordAgent`/`recordSkill` with a parent id. No new tables required.

### 5.2 Capture points (where to emit)

| Layer | File | Action |
|---|---|---|
| Orchestrator | `src/server/orchestrator/gateway-server.ts` | Keep; already emits. Pass `input:{systemPrompt,userPrompt}` to `recordModel`. |
| Director (new) | future `src/server/director/*` | Open an `agent` event, emit child model/tool/agent events, close it. |
| Agents (new) | future `src/server/agents/*` | Each opens an `agent` event with `parentAgentId`=Director; emits model/tool/skill children. |
| AI gateway | `src/server/ai-generate.ts` | Emit a `model` event centrally (provider/model/usage/fallback/retry already returned at `:238,488`). This single change captures **every** LLM call regardless of caller. |
| Tools/integrations | `src/server/integrations/web-providers.ts` | Wrap each transport to `recordTool`. |
| Task lifecycle | `src/server/task-dispatcher.ts` / new executor | Already rehydrates trace by `trace_id` (`:20-23`); emit lifecycle events (`persist`, `complete`, `fail`). |

### 5.3 Display

- Replace the flat execution list in `AdminTraceDetail.tsx` with a **tree/graph** keyed on `parent_event_id`/`parent_agent_id` (the data is already there; `format.ts` `toGraphEvents` already produces `parent_instance_id`). Optionally reuse React Flow (already a dependency) for a node graph.
- Render tool **input** (currently dropped in `format.ts:77-80`), `fallback_used`, `retry_attempt`, `output_original_bytes`.
- Surface `admin_traces.tool_page_count`/`tool_credit_count`/`max_attempt`/`duration_ms` and the already-fetched `fallback.steps`/`fallback.usage`.

### 5.4 Migration

None strictly required — additive reuse of existing columns/tables. Optional: a `skill` event type in the `record_admin_trace` coercion (currently `event_type` is free-text `left(...,64)`, so no enum blocks it). Keep `record_admin_trace` as the sole writer.

---

## 6. Security risks, sensitive-payload exposure, missing redaction, authz gaps

### 6.1 Strengths **[V]**

- Admin auth is **fail-closed** and identity-based (`identity.ts`, `auth.ts`).
- `record_admin_trace` rejects non-`service_role` callers (defense-in-depth at the DB).
- `admin_traces`/`admin_trace_events` have RLS **enabled with no policies** and grants only to `service_role` ⇒ no client/anon/authenticated read path.
- Secret-shaped redaction: `sanitize.ts` scrubs OpenAI/Tavily/Firecrawl/AWS/Slack/JWT/Bearer/`api_key=`/`password=` patterns and strips control chars (`sanitize.ts:11-36`). All stored strings pass through `scrubString`.
- Collector is bounded (`MAX_EVENTS=1000`, `MAX_BYTES=8MB`, string/array/depth caps) and best-effort flush never fails the request (`collector.ts:390-400`).

### 6.2 Risks / gaps

| Severity | Finding | Evidence |
|---|---|---|
| **High** | **No PII redaction.** Only *secret-shaped* substrings are scrubbed. User queries, final replies, model I/O heads, and tool inputs/outputs are stored **verbatim** (capped, not redacted) and are fully readable by any admin across **all tenants**. Names, emails, phones, addresses, business data are exposed. | `sanitize.ts` has no PII patterns; `request`/`final_reply` up to 12000 chars stored raw (`20261123140000…:216,219`). |
| **High** | **Cross-tenant admin read with no scoping/audit.** The admin (service-role) can query any `workspace_id`/`user_id` and full-text search all requests/replies. There is no admin-access audit log for *reads* of trace data. | `listTraces` filters (`traces.ts:61-70`); no read-audit table. |
| **Medium** | **`checkIsAdminUser` trusts client-supplied identity.** The server action returns `true` if the caller-supplied `userInfo.id/email` matches the admin list, without binding to the session. It only drives the Navbar link (UX), but it is an "is-this-id-an-admin" oracle and could mislabel UI. | `src/server/admin/actions.ts:6-13`. |
| **Medium** | **No attribute-based access control / RBAC.** Admin is a single boolean from env (`ADMIN_USER_ID`/`ADMIN_EMAIL`). No roles, no per-scope permissions, no break-glass, no MFA requirement. Shared `ADMIN_*` config = shared full access. | `identity.ts`; `.env.example:62-67`. |
| **Medium** | **Sensitive prompt content persisted to DB.** Even though prompts aren't captured today, the schema + `recordModel.input` path would store system/user prompt heads; when wired ( §5 ) this becomes a prompt/PII store unless allow-listed. | `collector.ts:241-247`. |
| **Low** | **Token/secret leakage via free-text fields.** `request`, `final_reply`, `output_preview`, `metadata` are arbitrary text; scrubbing is regex-based and can miss novel key formats or secrets split across the 2 KB boundary. | `sanitize.ts:11-21`. |
| **Low** | **`user_id` populated with workspace id.** In the single-tenant model `userId = workspaceId` (`gateway-server.ts:83`, `admin_trace_list` view `COALESCE(a.user_id,t.workspace_id)`), so the two are conflated — fine today, lossy if multi-user is added. | `collector.ts` identity; view line 114. |
| **Low** | **`ADMIN_PASSWORD` in `.env`.** Implies a password-based provisioning flow (`scripts/provision-admin.mjs`); if that ever authenticates outside Supabase Auth it would be a second, weaker identity path. Not observed in code (script is a provisioner). | `.env.example:63-67`. |

### 6.3 Recommended security hardening

1. Add **PII redaction** (email/phone/national-id/card/address patterns) to `sanitize.ts`, and/or make payload capture **opt-in per field** with a default-deny allowlist.
2. Default **prompt-body capture to OFF**; capture only operation + token counts unless explicitly enabled.
3. Add an **admin read-audit** table (who viewed which trace, when) and log `getTraceDetail`/`listTraces` access.
4. Bind `checkIsAdminUser` to the server session; never trust client-supplied identity.
5. Add **RBAC/MFA** and restrict `ADMIN_*` to a break-glass identity; never share.

---

## 7. Preserve / Modify / Replace / Add

| Component | Verdict | Rationale |
|---|---|---|
| `src/server/observability/**` (collector/config/sanitize/index) | **PRESERVE + MODIFY** | Correct, bounded, hierarchical-ready seam. Add `recordSkill`, PII redaction, and use the unused `input` field. |
| `record_admin_trace` RPC + `admin_traces`/`admin_trace_events`/`admin_trace_list` | **PRESERVE** | Idempotent, service-role-only, aggregate recompute. Add a `skill` event type only if desired (free-text today). |
| `src/server/admin/**`, `src/app/api/admin/**`, `src/app/[lang]/admin/**` | **PRESERVE + MODIFY** | Keep auth model & routes; add read-audit, RBAC/MFA, and fix `checkIsAdminUser` trust. |
| `AdminTraceList` / `AdminTraceDetail` / `format.ts` | **MODIFY** | Surface tool inputs, `fallback_used`, `retry_attempt`, page/credit/max_attempt/duration columns, and the already-fetched `fallback.steps`/`fallback.usage`. Add tree/graph rendering using existing parent ids. |
| Orchestrator collector wiring (`gateway-server.ts`) | **PRESERVE + MODIFY** | Keep; pass `input` to `recordModel`; add explicit parent ids when sub-agents exist. |
| `src/server/task-executor.ts` (fail-fast stub) | **REPLACE** (future) | Will be replaced by the real Director/executor; it must emit agent/model/tool events into the existing trace, not a new log. |
| `src/server/ai-generate.ts` usage path | **MODIFY** | Emit a central `model` event (provider/model/usage/fallback/retry already available) so every LLM call is captured once. |
| `src/server/integrations/web-providers.ts` | **MODIFY** | Wrap transports with `recordTool`. |
| `provider_usage`, `task_usage`, `task_steps`, `agent_events`, `orchestrator_runs` | **PRESERVE** | Keep as durable/runtime tables; **do not** build a parallel admin log. Read them as fallback, and optionally project them into `admin_trace_events`. |
| Customer `AgentCanvas` (`src/components/chat/AgentCanvas.tsx`) | **ALREADY REMOVED** | Confirmed deleted in working tree; admin graph is the replacement surface. |
| A **new** logging system | **DO NOT ADD** | Would duplicate `admin_trace_events`. Extend the existing collector/RPC/UI instead. |

---

## Appendix A — File & table index

**Admin/observability code:** `src/app/[lang]/admin/{layout,page}.tsx`, `src/app/[lang]/admin/traces/[id]/page.tsx`; `src/app/api/admin/{traces/route,traces/[id]/route,check/route,health/route}.ts`; `src/server/admin/{auth,identity,traces,actions}.ts`; `src/server/supabase-admin.ts`; `src/server/observability/{collector,config,sanitize,index}.ts`; `src/features/admin/{AdminTraceList,AdminTraceDetail,format,types}`; `src/features/marketing/ui/Navbar.tsx` (admin link gate); `scripts/provision-admin.mjs`.

**Collector wiring:** `src/server/orchestrator/gateway-server.ts`, `src/server/task-dispatcher.ts`, `src/server/task-executor.ts`, `src/app/api/tasks/route.ts`, `src/app/api/ai/route.ts`, `src/server/ai-generate.ts`.

**Migrations:** `20261123140000_admin_execution_observability.sql` (admin tables/view/RPC), `20261017171908_busmora_core_schema.sql` (`agent_events`,`tasks`), `20261118020000_competition_contracts.sql` (`task_steps`,`task_usage`), `20261118028000_task_execution.sql` (`task_results`, task RPCs, `record_task_step`), `20261118029000_task_inputs_usage.sql` (`task_usage.state`, `reserve/finish_task_call`), `20261121000000_marketing_research.sql` (`provider_usage`), `20261122120000_orchestrator_first.sql` (`orchestrator_runs`, `record_conversation_event`), `20261124001000_conversation_title_no_raw_request.sql`, `20261125000000_employee_intelligence_cleanup_guard.sql`.

**Key tables:** `admin_traces`, `admin_trace_events`, view `admin_trace_list`; `tasks` (+`trace_id`), `task_results`, `task_steps`, `task_usage`, `agent_events`, `orchestrator_runs`, `provider_usage`, `task_inputs`.

**Config (names only):** `ADMIN_USER_ID`, `ADMIN_EMAIL`/`ADMIN_EMAILS`, `ADMIN_PASSWORD`, `OBSERVABILITY_ENABLED`, `OBSERVABILITY_MAX_EVENTS`, `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`.