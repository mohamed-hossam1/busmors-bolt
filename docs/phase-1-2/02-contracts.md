# Competition implementation contracts

> Scope update — 18 November 2026: the owner requires an English-only project. Interface, conversation and generated-content language are English; locale switching, alternate registers and right-to-left presentation are removed from acceptance. Country, currency, target market and IANA timezone remain independent. This update supersedes the earlier language requirements.

This file chooses a small implementation on the existing stack. New paths and tables below are proposed work, not existing code. Implement only the fields needed by the specified journeys; avoid a generic framework.

## 1. Architecture and folder boundaries

```text
Next.js 16 (App Router + Turbopack) & React 19
  ├─ Browser TaskRunner above route components with 2-task queue and step state machine
  ├─ Canvas layout and event timeline
  ├─ Supabase Auth for application sessions
  ├─ Supabase reads and owner-scoped CRUD
  ├─ SQL RPCs for atomic transitions
  └─ Native Server API Routes (/api/ai, /api/crawl, /api/tasks, /api/oauth) for secrets/provider calls

Supabase PostgreSQL 17 + private Storage
  └─ scheduled background invocation / webhook for due approved Posts
```

No separate server, queue service, AI deployment, or worker host. React can coordinate research/model calls for the competition. It must not contain provider keys or Meta tokens. The optional Supabase scheduled publisher is the only background slice needed to demonstrate real scheduling without depending on the Calendar route staying mounted.

Keep the screen components in `src/screens/` and Next.js routes in `src/app/`. Add feature modules when logic becomes substantial:

```text
src/app/{layout,page,employee,roadmap,brain,deliverables,scheduling,settings,auth}/
src/app/api/{ai,crawl,tasks,oauth,research}/route.ts
src/server/{ai-generate,crawl,task-executor,oauth-connect,agents,calendar-actions}.ts
src/screens/{EmployeePage,RoadmapPage,BrainPage,DeliverablesPage,CalendarPage,SettingsPage,Onboarding}.tsx
src/features/onboarding/{BusinessForm,ConfirmBusiness,api,types}.ts(x)
src/features/tasks/{TaskRunnerProvider,runner,backend,types}.ts(x)
src/features/research/{types,evidence,api}.ts
src/features/roadmap/{DiscoveryWizard,RoadmapTimeline,StepDetail,RevisionReview,api,types}.ts(x)
src/features/publishing/{PostEditor,PostDetail,CalendarMonth,CalendarWeek,PostList,BatchReview,api,types}.ts(x)
src/features/analysis/{UploadDialog,MappingPreview,AnalysisResult,metrics,types}.ts(x)
src/features/notifications/{NotificationCenter,api}.ts(x)
src/lib/{types,supabase,i18n,region,contracts}.ts
supabase/migrations/<timestamp>_<change>.sql
```

Reuse existing `src/lib/crawlContent.ts`, `crawl.ts`, graph, previews, and dialogs. Do not duplicate an existing helper under a new name. Do not import app connectors used by Codex as runtime application tools: the website needs its own provider integration and credentials.

## 2. Common rules

- Derive workspace from authenticated Supabase user. Validate every related conversation/task/document/Page belongs to it. Use same-workspace composite FKs or explicit checked RPCs for new relationships.
- Important edits carry `expectedVersion`. Return `STALE_VERSION` on mismatch; do not silently replace newer data.
- Commands that can be double-clicked carry an idempotency key scoped to workspace/action. Same key with a different payload is rejected.
- Use checked RPCs for intake confirmation, result assembly, plan activation, Post version/approval, and publish claims. Keep ordinary read/UI preferences simple.
- Persist meaningful operation errors. Supabase returns `{error}`; a surrounding try/catch does not catch an ignored returned error.
- Keep `unknown`, `not_applicable`, `skipped`, zero and missing values distinct. Validation applies to AI output before saving.
- Keep task authorization, draft acceptance, knowledge approval, roadmap activation, and publishing approval separate.
- Dates are UTC instants plus IANA zone. Use decimal strings or decimal arithmetic for money. Do not hardcode Cairo's offset.
- Error responses: `{code,messageKey,details?,requestId?}` with safe details. No secrets, provider raw bodies, or private model reasoning.
- Schema/version defaults must not invent a scheduled date, approval, source, completed action, or customer outcome.

## 3. Minimum schema additions

Preserve existing tables. Add fields/tables through new migrations, backfill conservatively, then switch application paths. Do not rename everything at once.

| Domain | Tables or additions | Essential fields |
|---|---|---|
| Preferences | extend `workspace_settings` | country, currency, timezone, ui_language, conversation_language, content_register, target_market; confirmed_intake_version |
| Intake | `business_drafts` | id/workspace/version/status/path/form JSON/field_sources JSON/confirmed_at; crawl_status/result |
| Brain | extend `brain_nodes`; add `brain_versions`, `brain_proposals` | version, epistemic_kind, approval_state, verification_state, provenance, source refs, current/superseded; proposal base version/diff |
| Evidence | `sources`, `claim_sources` | URL/title/accessed_at/published_at?/excerpt/hash/type/market/availability; claim-to-source support mapping |
| Context | `context_dependencies` | consumer type/id/version, Brain node/version or source, relevant fields, stale reason/resolution |
| Tasks | extend `tasks`; `task_steps`, `task_inputs`, `task_usage` | origin, version, context refs, allowance, consumption, checkpoint, cancel_requested, run_id; step instance/status; form schema/answers |
| Events | extend `agent_events` | instance_id, run_id, safe event type/payload; unique task+seq |
| Discovery | `discovery_drafts`, `discovery_questions`, `question_research_links` | goal/version; stable question IDs/schema/order/status/value/provenance; exact task/conversation/result return link |
| Roadmap | `roadmaps`, `roadmap_versions`, `roadmap_steps`, `step_actions` | one active plan; immutable proposal versions/base version; step contracts/dependencies/status/attestation; action history |
| Documents | extend `deliverables`; `deliverable_versions` | stable identity/current version/origin/context refs/type; immutable content/sources/limitations/created_at |
| Publishing | evolve `planned_posts`; `post_versions`, `post_approvals`, `publish_attempts`, `post_holds`, `campaigns` | current version, nullable schedule, exact approval, attempt/result state, actual published_at, dependencies |
| Media | `media_assets` + private Storage bucket | workspace/object path/object version/digest/MIME/size/dimensions/status |
| Connections | extend `platform_connections`; private `connection_credentials`; `oauth_transactions` | Page ID/name, permission status, generation, expiry; encrypted token refs; single-use state/expiry/intent |
| Analysis | `analysis_imports`, `metric_observations` | task/file hash/template/map version/confirmation; typed values/source/period/unit/status |
| Notifications | `notifications` | type/subject type+ID+version/read_at/dedupe_key/created_at |

For the sprint, JSONB is appropriate for bounded forms and display contracts. It is not a substitute for checking ownership, required fields, known enum values, or numeric limits. Do not create a general schema designer.

## 4. Authentication and routing

Signup collects email/password only and proceeds directly to onboarding without email verification. Reset-email link leads to a new-password page, not back to a reset-request form. Workspace creation is idempotent after a usable authenticated identity exists.

Preserve `/app/*` links. Add the PRD's public entry routes `/employee`, `/roadmap`, `/brain`, `/deliverables`, `/scheduling`, and `/settings` as real aliases to the same components; `/scheduling` maps to the existing Calendar feature. Successful ordinary login opens `/employee` for completed setup and `/onboarding` otherwise. Authenticated deep-link refresh stays at that resource. Do not restore an arbitrary last page at login. Check resource access after restoring an intended route.

Google uses Supabase's supported OAuth/PKCE flow and exact configured redirect URLs. Dedicated contest identities avoid accidental account collisions during presentation. Display account providers accurately. **Known deferred conformance issue:** test and resolve the PRD's explicit-only linking/reauthentication rule after the competition; automatic same-email linking is not a proven pass. Do not write a custom auth server or silently claim AC-32 complete.

## 5. Essential business form and confirmation

```ts
type Offering = {
  id: string; name: string; description: string;
  pricingModel: 'fixed' | 'starting_from' | 'quote_required' | 'unknown';
  amount: string | null; currency: string | null;
};
type BusinessDraft = {
  id: string; version: number; name: string; description: string;
  offerings: Offering[]; country: string; serviceArea: string;
  conversionRoute: {
    state: 'ready' | 'not_ready';
    type?: 'website' | 'whatsapp' | 'phone' | 'social' | 'booking' | 'marketplace' | 'other';
    value?: string;
  };
};
```

Require name, description, at least one offering, country/service area, and route state. Amount is optional; if present it requires currency. Missing price never becomes zero. Add optional logo, brand colors, tone, links and region preferences to the persisted schema. Import visual-identity cues only when the source actually exposes them; otherwise allow owner entry. Do not ask for weekly hours, competitors, detailed strategy, budget, or past results as setup gates.

Both paths render the same component. Website reads populate a saved draft with field sources; partial extraction remains editable. A late extraction response must not overwrite a field edited since the request started. Confirm the displayed version in one RPC: validate → activate facts with owner-confirmed provenance → mark setup complete → audit. Do not then ask the owner to approve the same fields again in Brain proposals.

## 6. Brain, history, and staleness

Keep three dimensions separate: **where the statement came from**, **whether the owner approved using it**, and **whether evidence supports its truth**. Example: an imported website claim can be approved for use without independent verification. AI confidence is not owner approval.

Owner edits create versions with owner provenance. Later research/reimport produces pending proposals; approving a report does not adopt every statement. Graph and list read the same records. Add a simple relationship editor rather than drag-to-author an ontology.

Context retrieval uses relevant current confirmed/approved facts plus bounded actual conversation history and relevant older documents labeled historical. Exclude rejected/deleted records. Attach used node/source versions to generated documents/Posts/tasks. Editing an offer/price/market/claim support marks dependent work stale and holds affected scheduled Posts. Do not regenerate automatically. Unrelated work remains usable.

For the contest, explicit dependency lists from generation plus a deterministic material-field comparison are enough. If dependency coverage is uncertain, show a review warning and hold relevant drafts; do not invent certainty. Full semantic impact evaluation is post-competition work.

## 7. Browser TaskRunner and honest Canvas

Mount `TaskRunnerProvider` inside authenticated app state and above route pages. Components submit requests and observe state; navigating to Brain or Calendar does not destroy a running promise. The manager may run two Tasks per workspace; third is queued. A small `admit_task` RPC prevents multiple tabs casually exceeding that visible limit; comprehensive fencing/fault recovery is deferred.

Task states: `queued`, `running`, `awaiting_input`, `awaiting_approval`, `partial`, `completed`, `failed`, `cancelled`, `interrupted`. This last state is the explicit competition concession after browser/process loss. Do not leave abandoned work Processing forever. Store checkpoints after each successful step. On reload, show saved work and Resume/Retry from a safe checkpoint; never auto-repeat a potentially sent Post.

Task origin is a validated discriminated type:

```ts
type TaskOrigin =
  | { kind: 'direct'; conversationId: string }
  | { kind: 'wizard_question'; conversationId: string; draftId: string; questionId: string; researchLinkId: string }
  | { kind: 'roadmap_step'; conversationId: string; planId: string; planVersionId: string; stepId: string };
```

Step events use unique **instance IDs**, so two calls to the same specialist are visible as two actual steps. Planned nodes must be labeled planned; active/tool completion follows real operations. Internal transient errors remain Processing while a bounded retry is ongoing; show terminal failure/partial output after exhaustion. User Cancel stops future cancellable steps and aborts requests where possible.

Canvas belongs to selected conversation → selected Task. Default to its latest relevant active Task. Provide task history within the conversation, a graph, a chronological list, source/result links, and exact clarification links. Late responses from another Task cannot update the active Canvas. No fabricated percentages, tool names, sources, or reasoning transcripts.

Chat message kinds: `text`, `text_response`, `structured_form`, `task_status`, `deliverable_card`, `knowledge_notification`, `budget_extension_request`, `error`, `post_reference`, `deliverable_offer`. Migrate legacy `form`; do not lose existing messages. A Post reference links to Scheduling, not a duplicate document.

## 8. AI, research, and usage

Use the internal Next.js Server API route (`/api/ai`) backed by `src/server/ai-generate.ts` as the provider gateway. Add an allowlisted `operation` field with server-owned prompts for route/clarify/research-synthesize/plan/copy/analyze. Do not accept arbitrary privileged tool instructions from model text. Validate output shape before persistence. Remove browser direct provider calls and authenticated key-decrypt access. **Owner decision (19 November 2026): keep the dashboard-managed provider/model/key as the primary configuration flow; do not hardcode a provider.** A server-managed fallback (`AI_API_KEY` in `.env`) remains available, but it must not replace the dashboard path or introduce unnecessary configuration changes.

A small router returns direct reply, structured clarification, or task intent. Simple conversation produces no specialist activity. For substantive work choose from a bounded set of real tools/specialists; planning can vary with inputs. A single English Post must not force research or six calendar Posts.

`research-tools` supports `search` and `fetch` through one configured provider. **Owner decision (19 November 2026): Firecrawl is the selected search provider** for the application's research/search functionality. Implement it behind a small adapter using Firecrawl REST search with retrieved Markdown and server-side credential (`FIRECRAWL_API_KEY` configured in `.env`). This is C14/C15 implementation. Use the current documented search payload with query/limit and Markdown scrape options, and validate the actual returned shape in a smoke test. [Official Firecrawl search API](https://docs.firecrawl.dev/api-reference/endpoint/search).

Store query/result URLs, retrieved excerpts, dates, source type, and accessibility. Use accessible websites and reviews/community material where relevant; no claims of private-group/Ads Library access. Reject fabricated/non-retrieved source IDs during synthesis. Duplicate articles count as duplicated coverage, not independent confirmation. Quotes/translations stay separate.

Per-task limits are real and visible: maximum calls/pages/tokens/time plus consumed usage. Start with configurable conservative demo limits, record them, then tune using actual latency/cost. Server routes enforce per-call ceilings; browser/RPC tracks task allowance and extension decisions. Child work and retries consume the same allowance. A budget increase prompts an explicit decision. Refusal returns partial findings. Production-grade concurrent reservation reconciliation is deferred, not silently described as solved.

Successful outputs are saved before completion is shown. A result RPC can create a document, Posts, proposed Brain updates, typed chat references, audit and notification; it returns persisted IDs. Retry must not duplicate results. No canned fallback content disguised as successful AI output.

## 9. Discovery and Roadmap

Goal is the first significant question: first customer, more customers, inquiry conversion, launch, repeat/referral revenue, or custom. Questions adapt to goal and eligible Brain context. Keep stable question IDs and saved answers with statuses `unanswered|answered|unknown|skipped|not_applicable|researching|confirmed`. Save on change/debounce and before navigation; surface save errors.

Research with Director first saves the draft, creates a verified question/conversation/task link, and opens that chat. Only that link enables Use in Roadmap. The user selects/edits the result, returns to the exact question, then confirms. URL query parameters are navigation hints, never the authoritative relation.

A proposed Roadmap contains all steps in a vertical timeline. Each step needs title/objective, rationale/evidence/uncertainty, owner/system responsibility, execution mode, inputs, dependencies, expected output, checklist/completion condition, effort estimate, linked Tasks/results, and any external approval requirement. No Now/Next/Later fields or planning-column limit.

Run checks real dependencies and reuses an idempotent execution intent. Mark Done records owner attestation. Skip is not completion or cancellation; running Task gets a separate Cancel control. Revisit recalculates readiness. Progress shows completed/owner-reported/skipped/blocked separately, not revenue achieved.

Versioned initial/revision proposals require owner activation. Show added/changed/removed/dependency differences. One RPC locks the workspace, checks displayed proposal/base version, archives the old active plan, and activates the new one. A partial unique index guarantees one active plan. Existing Tasks remain linked to original plan/step versions; no restart on approval.

## 10. Documents

Keep document identity stable with immutable ordinary edit versions. Store origin/task/conversation/step/campaign, source refs, context version, assumptions and limitations. Ordinary editing adds a version; governed deletion/redaction may remove private content.

Library includes search/type/date filters and cursor pagination. Detail has Edit, Copy, Export, Reuse, Continue with Director, and Delete. Export txt/md and suitable CSV; original owner media can be downloaded. No PDF/Word design suite this week. Social Posts live in Publishing, with optional campaign-planning documents linking to them.

## 11. Posts, schedules, and real Facebook publishing

Continue using `planned_posts` as the stable Post table if it reduces migration work; new UI/API names can simply say Post. Add immutable versions instead of a second competing Post store.

```ts
type ScheduledTime = {
  instant: string; zone: string; latenessAllowanceMinutes: number;
};
type PostVersion = {
  id: string; postId: string; revision: number;
  text: string; link: string | null; mediaAssetId: string | null;
  pageId: string | null; connectionId: string | null;
  scheduledTime: ScheduledTime | null;
};
type ApprovalInput = {
  postId: string; postVersionId: string; expectedVersion: number;
  pageId: string; connectionId: string; authorizationGeneration: number;
  scheduledTime: ScheduledTime;
};
```

Creation/edit without a date stays **Unscheduled**. A proposed date appears as unapproved, never authorized. New Post requires no connection. Approval requires valid text/media/Page/date/zone/disclosed lateness allowance. Any material edit produces a new version and invalidates the previous approval. Bulk requests enumerate exact displayed versions and return per-item successes/conflicts.

Separate approval state from execution state. Execution distinguishes scheduled/submitted/confirmed/failed/uncertain/held/cancelled. Legacy `published_by:user` remains owner-reported. `publishedAt` is the actual provider-confirmed time; old proposed dates do not rewrite history. Duplicate published Post creates a fresh draft.

Connection start is an authenticated POST, not a URL carrying the application token. Save a short-lived single-use OAuth state with workspace/platform/intent, and consume it on callback. Select an actual authorized Page; store its Page token server-side with encryption and expiry/permissions metadata. The browser only reads safe metadata. Disconnect increments authorization generation and blocks sends; reconnect never automatically releases overdue or uncertain Posts.

`publish-post` is deterministic: validate current exact approval, Page/auth generation, media, cancellation, holds and delivery window; claim once in SQL; record attempt; call Meta; save returned ID; read back enough evidence; mark confirmed only when justified. A timeout after possible acceptance is uncertain. Retry/cron/reload must reconcile or hold that attempt, not blindly send again. A local UUID is not remote exactly-once delivery.

`publish-due` is invoked by Supabase's supported schedule mechanism and calls the same publishing core for due approved versions. It must use server authentication and a narrow batch size. If schedule configuration is unavailable, expose an explicit browser-dependent scheduling mode during development and keep C26 incomplete; do not label it background scheduling. For the final presentation, verify one scheduled Post in the deployed configuration.

Use text/link and one validated owner image with caption. Private Storage objects include workspace, MIME/magic-byte/size checks, immutable object identity/digest, and short-lived access. Do not pass arbitrary user image URLs to a server fetch. Approval binds the image bytes/object version; refreshing a signed URL alone does not change content.

Edits/rescheduling send the complete ScheduledTime. DST ambiguity must ask for a valid explicit time. A workspace timezone preference change does not shift an approved instant. Hold after the lateness window. A cancellation after submission cannot promise deletion from Facebook. Local deletion is not remote deletion.

## 12. Requested analysis

Support one documented template first, in both CSV and `.xlsx`, with optional recognized fields. File attachment is an explicit Chat action. Save raw import metadata, preview rows, map fields, confirm metric definitions/period/granularity/currency, then calculate.

Template: `period_start,period_end,entity_id,channel,currency,impressions,reach,engagements,clicks,inquiries,qualified_inquiries,bookings,customers,ad_spend,attributed_revenue,profit,total_cost`. Not every metric is required. Users must be able to map a compatible subset. Reject unsupported layouts with a template download, not a vague failure.

- CTR = clicks / impressions, with defined scope.
- Qualification rate = qualified inquiries / inquiries.
- Inquiry-to-customer rate = customers / inquiries, only if periods/definitions are compatible.
- Cost per qualified inquiry = supported attributed cost / qualified inquiries.
- ROAS requires attributed revenue / ad spend, not ordinary business revenue.
- ROI requires an explicitly defined profit/return and cost basis; do not substitute revenue for profit.

Use deterministic code, decimal arithmetic where needed, fixed rounding rules and fixtures. Unknown input or zero denominator yields unavailable/undefined with explanation, never fabricated zero. Flag duplicate/overlapping rows, cumulative totals, incompatible units/currency and denominators. Do not sum unique reach across overlapping audiences without a valid basis.

Use a maintained parser pinned during implementation. Do not execute formulas/macros, follow external workbook links, or silently trust cached formula values. Limit file/row/uncompressed archive size. Escape formula-leading text on CSV export. The model explains computed output and limitations; it does not calculate the numbers. Result is a document, not recurring monitoring or automatic roadmap revision.

## 13. Notifications, controls, and minimal command inventory

Notifications: completion, terminal failure, clarification, document/research ready, Post approval/publication/hold/uncertainty, reconnect, Brain proposal, and revision review. Exact subject links must validate access; deleted subject becomes unavailable. Read/unread/count/mark-all-read work. Reading a notification never approves its subject. No notification for internal transient retries.

Provide Brain/document export/delete and account disconnect during the contest. Immediately exclude deleted material from current retrieval and outstanding exports and hold dependent Posts. Wider purge/backup guarantees remain documented follow-up work. Do not promise more deletion than implemented.

Recommended RPC names, each covered by a small test:

| RPC | Contract |
|---|---|
| `confirm_business_draft` | draft ID + expected version → activated context/setup status |
| `update_brain_item`, `decide_brain_proposal` | exact current/proposed version + decision → version/audit/holds |
| `admit_task`, `save_task_result` | idempotency + origin; atomic persisted outputs before complete |
| `answer_task_form`, `decide_budget_extension` | form/allowance version + typed decision |
| `start_question_research`, `accept_question_result` | validated draft/question/task/result chain |
| `activate_roadmap`, `run_roadmap_step`, `record_step_action` | expected versions, dependencies, idempotency, attestation |
| `save_document_version` | stable document + expected version + content/provenance |
| `save_post_version`, `approve_post_version`, `reschedule_post` | exact versions + complete ScheduledTime; invalidate old decisions |
| `claim_post_publish`, `record_publish_result`, `disconnect_connection` | server-only action, attempt/generation/holds checks |
| `mark_notifications_read` | only owned displayed notifications, or explicit mark-all |

These are RPC equivalents of the PRD's logical APIs. If no REST `/v1/posts/:id/reschedule` route is shipped this week, record the transport difference; preserve its complete payload and behavior rather than creating a second server just for the route spelling.

## 14. Safe migration rules for the week

1. New timestamped migrations only. Apply from empty local DB and from the previous test schema. Never reset a real workspace to make tests pass.
2. Existing Brain crawler approval is not proof of owner confirmation. Preserve it as legacy/imported and ask for confirmation when needed; do not invent past consent.
3. Preserve current graph/edges/manual edits. Add versions/sources rather than replacing all Brain rows.
4. Backfill Post version 1 and invalidate approvals without the new binding. Keep owner-reported publication distinct. No implicit send during migration.
5. Preserve old documents/history. Migrate structured Post payloads once with stable origin IDs; no automatic recreation on page load or on empty library.
6. Old running Tasks without a live browser run become interrupted, with safe resume options. No automatic replay of uncertain publishing.
7. Verify FK ownership and row counts before switching reads. Quarantine invalid historical relations with a report; do not silently delete them.
8. Keep rollout flags per new surface until its happy path passes. Rollback means disabling new behavior safely, not deleting migrations or replaying external actions.
