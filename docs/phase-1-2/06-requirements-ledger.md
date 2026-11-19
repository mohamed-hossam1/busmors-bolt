# Requirement and acceptance ledger

> Scope update — 18 November 2026: the owner requires an English-only project. Interface, conversation and generated-content language are English; locale switching, alternate registers and right-to-left presentation are removed from acceptance. Country, currency, target market and IANA timezone remain independent. This update supersedes the earlier language requirements.

> C01 decision lock — 19 November 2026: competition **Tuesday 24 November 2026, `Africa/Cairo`**; hosting **Vercel / `https://busmora.com`** (not deployed, authorization required); **reuse the existing Supabase project** (no second project); preserve the **dashboard-managed AI provider** flow; **Firecrawl** selected for search/research; **Google remains in scope**; **Facebook/Meta temporarily deferred** (requirements retained); **Next.js/React + Supabase** architecture and **English-only** product. See [integration readiness](../evidence/integration-readiness.md) for live status and blockers.

Source: PRD v2.0 supplied by the owner. Baseline audit date: 18 November 2026. Current task-status reconciliation: 19 November 2026. C01 is the only fully accepted C task; no FR/NFR/AC is promoted by this scope lock.

This ledger covers **57 active FRs, 9 NFRs, and 57 active acceptance scenarios**. FR-47 and AC-26 are retired and reserved. Future-phase items are visibility boundaries, not current execution features.

Nothing below is marked fully accepted by this planning exercise. The baseline source-state columns preserve the initial 18 November findings and are not current implementation status. Current task statuses and exact completion work are in [file 04](04-implementation-tasks.md) and [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md); the [19 November audit](../evidence/plan-audit-2026-11-19.md) records new checks. No FR/NFR/AC was promoted to accepted by that audit. The competition target includes the visible behavior; the H column preserves additional production work. After implementation, add evidence links, fixture/environment, accountable person and status to each row. C37/C40 maintain the actual results.

Use `not_started`, `partial`, `competition_verified`, `production_verified`, `failed`, or `externally_blocked`. Only `production_verified` means the complete original pass condition was exercised. A broad H10 reference means final integrated regression, not permission to postpone the visible C-task behavior.

## Functional requirements

| ID | PRD requirement | 18 November baseline source state | Competition tasks | Production follow-up |
|---|---|---|---|---|
| FR-01 | Accounts and workspace | Partial | C02 C03 C04 | H02 H03 |
| FR-02 | Navigation | Partial | C03 C06 C32 | H10 |
| FR-03 | Website import | Partial | C08 | H01 H03 |
| FR-04 | Confirmed intake | Conflicting behavior | C07 C08 | H10 |
| FR-05 | Completion choice | Missing | C07 | H10 |
| FR-06 | Unified essential business form | Missing | C07 | H10 |
| FR-07 | Social import visibility | Missing | C07 C34 | H10 |
| FR-08 | Structured memory | Partial | C09 C12 | H08 H10 |
| FR-09 | Epistemic and lifecycle state | Partial/conflicting | C09 C15 | H07 H10 |
| FR-10 | Update rules | Partial/conflicting | C07 C08 C09 C29 | H08 H10 |
| FR-11 | Historical work | Partial | C12 C16 C33 | H08 H10 |
| FR-12 | Interactive graph | Partial | C09 C35 | H10 |
| FR-13 | Owner data controls | Partial | C09 C25 C33 | H08 |
| FR-14 | Business-aware diagnosis | Missing evaluated diagnosis | C17 C20 | H07 |
| FR-15 | Marketing scope | Partial prompt guidance | C17 | H07 |
| FR-16 | Complete actionable Roadmap | Missing | C18 C20 C21 C22 | H10 |
| FR-17 | Direct Chat | Partial | C11 C12 C19 C21 | H01 H10 |
| FR-18 | Choice-first clarification | Partial renderer only | C12 C18 | H07 |
| FR-19 | Fast Router | Missing AI router | C10 | H04 H07 |
| FR-20 | Dynamic Orchestrator | Fixed/browser pipeline | C10 C11 C14 C17 | H01 H04 H07 |
| FR-21 | Specialist capabilities | Partial generation | C14 C17 C26 C31 | H07 |
| FR-22 | Authentic conversation-local Canvas | Partial/untruthful source events | C11 C13 | H01 H10 |
| FR-23 | Durable work and retry presentation | Browser-only | C11 C13 | H01 |
| FR-24 | Dynamic multi-source research | Missing real retrieval | C14 | H04 H07 |
| FR-25 | Research output | LLM-only reports | C15 | H07 |
| FR-26 | Evidence quality | Partial crawl evidence | C08 C14 C15 | H03 H07 |
| FR-27 | Per-task research budget | Missing | C11 C13 C14 | H04 |
| FR-28 | Modular research capability | Missing | C14 C15 | H07 H09 |
| FR-29 | Flexible output size | Partial/mixed ownership | C16 C17 C23 | H07 H10 |
| FR-30 | Brand understanding and claim integrity | Partial | C08 C09 C17 | H07 |
| FR-31 | Text-first assets | Text partial/media missing | C17 C24 | H10 |
| FR-32 | Language and audience fit | Prompt-only/unevaluated | C05 C17 C35 | H07 |
| FR-33 | Connected Facebook Page | OAuth source only | C25 C26 | H05 H06 |
| FR-34 | Review and approval | Mutable row approval | C23 C24 C28 | H05 |
| FR-35 | Scheduled execution | Missing scheduler | C26 C28 C29 | H05 H09 |
| FR-36 | Verification and recovery | Missing native execution | C26 C29 | H05 |
| FR-37 | Other external actions | No active unsupported tools found | C10 C17 C28 | H03 H10 |
| FR-38 | Requested file analysis | Missing | C30 C31 | H03 H10 |
| FR-39 | Goal-based interpretation | Missing | C31 | H07 H10 |
| FR-40 | Evidence governance | Missing analysis governance | C15 C22 C31 | H07 H10 |
| FR-41 | Document Deliverables | Partial library | C16 C33 | H08 H10 |
| FR-42 | Context reuse | Partial top-12 context | C09 C12 C29 C33 | H08 |
| FR-43 | English copy and responsive access | English-only UI | C05 C06 C35 | H07 H10 |
| FR-44 | English-only language and independent region | Implemented locally; generation quality unverified | C05 C17 C32 C35 | H07 H10 |
| FR-45 | Goal and practical constraints | Missing | C18 C20 | H07 H10 |
| FR-46 | Executable steps | Missing | C20 C21 | H10 |
| FR-47 | Retired in v2.0 | Retired | C34 C37 | Reserved; not an active feature |
| FR-48 | Context impact and freshness | Missing | C09 C29 | H05 H08 |
| FR-49 | Honest capability and handoff contract | Partial/inaccurate claims | C17 C21 C34 | H07 H10 |
| FR-50 | Authentication | Partial email; no Google | C03 C04 | H02 |
| FR-51 | Roadmap Discovery | Missing | C18 | H10 |
| FR-52 | Exact-question research | Missing | C19 | H03 H10 |
| FR-53 | Step control | Missing | C11 C21 | H01 H10 |
| FR-54 | Plan lifecycle and revision | Missing | C20 C22 | H10 |
| FR-55 | Scheduling | Review cards only | C23 C24 C27 C28 | H05 H10 |
| FR-56 | Settings and notifications | AI-key settings only | C04 C05 C25 C32 | H02 H08 H10 |
| FR-57 | Output ownership | Posts mixed with documents | C11 C16 C17 C23 | H10 |
| FR-58 | Removed surface exclusion | No retired route found; checks needed | C20 C31 C34 C37 | H10 |

## Non-functional requirements

| ID | PRD requirement | 18 November baseline source state | Competition tasks | Production follow-up |
|---|---|---|---|---|
| NFR-01 | Truthful state | Conflicting task events/fallbacks | C08 C10 C11 C13 C15 C26 | H01 H07 |
| NFR-02 | Source integrity | Partial crawler sources | C08 C14 C15 | H07 |
| NFR-03 | Workspace security | Partial RLS; relational checks incomplete | C02 C10 C25 C33 | H03 |
| NFR-04 | Untrusted input handling | Unsafe rendering/limited input controls | C06 C08 C10 C14 C24 C30 C33 | H03 |
| NFR-05 | Durable execution and recovery | Browser-only execution | C11 C26 C29 | H01 H05 H09 |
| NFR-06 | Resource accountability | No task budget ledger | C10 C11 C13 C14 C32 | H04 H09 |
| NFR-07 | Accessible English-only operation | English-only product | C05 C06 C35 | H07 H10 |
| NFR-08 | Observability | Partial audit with save gaps | C02 C11 C26 C32 C37 C39 | H09 |
| NFR-09 | Data control | Partial local deletion | C09 C25 C33 | H08 |

## Acceptance scenarios

The observable pass conditions below include the owner-authorized English-only scope revision so a smaller model cannot replace them with a superficial screenshot check. For the competition, exercise the C-task behavior and record any H-level remainder. **Rows remain unverified unless linked to executed evidence.**

| ID | Scenario | Original PRD pass condition | Competition tasks | Remaining production proof |
|---|---|---|---|---|
| AC-01 | Website onboarding | Crawl prefills a validated editable draft; no Brain eligibility before exact-version owner confirmation; sources and partial fields survive. | C07 C08 | H01 H10 |
| AC-02 | Manual onboarding | The same form accepts essential fields only, supports a not-ready conversion route and leads to Chat/Roadmap choice without strategy questions. | C07 | H10 |
| AC-03 | Brain governance | The owner explores and edits the graph, distinguishes imported from confirmed or inferred items, and approves, edits, rejects, exports, or deletes applicable information | C09 C33 | H08 H10 |
| AC-04 | Diagnosis and Roadmap | Separate Discovery produces a complete actionable proposed plan; evidence, uncertainty, real dependencies and completion conditions are visible; activation/revision require approval. | C17 C18 C20 C22 | H07 H10 |
| AC-05 | Direct work | The owner launches a supported task from chat without completing preceding roadmap tasks; the task reuses relevant Brain context and history | C11 C12 | H01 H10 |
| AC-06 | Dynamic orchestration | Simple input avoids fabricated specialist work; complex tasks vary planning/delegation with context inside shared tool/iteration/time/concurrency limits; ordinary UI actions do not require AI routing | C10 C11 C14 C17 | H01 H04 H07 |
| AC-07 | Authentic Canvas | Only the selected conversation’s actual Task nodes/events appear, with safe detail/list and exact form links; no fictional progress or history. | C11 C13 | H10 |
| AC-08 | Multi-source research | Research dynamically examines distinct relevant supported source types, verifies claim support, distinguishes duplicated sources, exposes gaps/contradictions, and links implications to an actionable next task; access/stopping limits produce honest partial results | C14 C15 | H04 H07 |
| AC-09 | Research budget | Parent, child, concurrent and retried work stay within the authorized allowance; attempted increases pause for owner approval; refusal preserves a bounded result without tool/task budget evasion | C11 C13 C14 | H04 |
| AC-10 | Campaign creation | The owner can request either a single item or an editable text-first campaign, with brand-aware copy, channel details, visual briefs, and owner media when needed | C17 C23 C24 | H07 |
| AC-11 | Language experience | The application works in English LTR, including conversation and generated content; country, currency, market and timezone remain independent | C05 C17 C35 | H07 H10 |
| AC-12 | Facebook publishing | An authorized Page accepts each committed format after exact individual/batch approval; a scheduled job publishes for real, retains platform evidence, and handles retries without duplicate publication; unsupported/missing media is rejected before approval | C24 C25 C26 C28 | H05 H06 |
| AC-13 | Approval invalidation | Editing approved content, media, destination, time/timezone, or delivery allowance prevents dispatch under the old approval until the new details are approved | C23 C28 | H05 |
| AC-14 | Requested file analysis | Explicit Chat tasks accept valid CSV and .xlsx through mapping/validation and deterministic math; result is a one-off document, with no recurring jobs or automatic revision. | C30 C31 | H03 H10 |
| AC-15 | History and control | Deliverables and task history are retrievable and reusable; the owner can export or delete them and disconnect a linked account | C12 C16 C25 C33 | H08 |
| AC-16 | Honest availability | Social Profile Import is visibly disabled and labelled Coming Soon; Instagram Business, X, connected analytics, native image generation, and billing are not represented as operational until implemented | C07 C25 C34 | H10 |
| AC-17 | Operational readiness | Security, isolation, integration, failure and recovery, observability, and end-to-end checks pass against the implemented workflows | C02 C06 C10 C37 C39 | H01 H02 H03 H04 H05 H08 H09 H10 |
| AC-18 | New service business with unknown audience/baseline | Unknown/not-applicable remains explicit; propose useful evidence or offer work without invented audience proportions, CAC, or growth forecasts | C17 C18 C20 | H07 |
| AC-19 | Many inquiries, few qualified conversations | Investigate qualification, offer, response process, and alternative explanations before automatically recommending more posting or spend | C17 C18 C20 | H07 |
| AC-20 | Material practical constraints | Discovery respects relevant assets, permissions, budget and fulfillment; no standard weekly-hours onboarding question or unsupported paid execution. | C07 C18 C20 | H07 |
| AC-21 | No website but working messaging/marketplace route | The actual route informs the plan; no unnecessary site requirement or simulated social import | C07 C17 C18 | H07 |
| AC-22 | One scoped English Post | Direct Chat creates a Publishing Post visible in Scheduling without forced research/campaign or a duplicate Deliverable. | C12 C17 C23 | H10 |
| AC-23 | Offer/price changes after approval | Affected work becomes stale and conflicting scheduled posts are held; owner resolution is recorded; edits/rescheduling require fresh approval; unrelated work remains usable | C09 C29 | H05 |
| AC-24 | Best task needs an unsupported connector | Supply usable owner instructions/artifacts and a completion checklist; distinguish attested implementation from system-verified execution | C17 C21 | H07 H10 |
| AC-25 | Unknown outcomes, zero denominator, duplicated or incompatible data | Unknown never becomes zero; invalid ratios are withheld; repeated/overlapping totals, currencies and metric definitions are flagged before combining; provenance/period remain inspectable | C30 C31 | H10 |
| AC-26 | Retired | Removed v1.1 recurring work/review-cycle acceptance; identifier reserved, not a release test. | Reserved | Retired; not a release test |
| AC-27 | Contradictory or malicious public source | Conflict remains visible; source instructions cannot authorize tools, override knowledge, raise budgets, leak private data, or redirect retrieval to internal resources | C08 C14 C15 | H03 H07 |
| AC-28 | Timeout, revocation, cancellation race, or overdue publish | Reconcile or hold uncertain outcomes; no blind duplicate, unauthorized late dispatch, or silent send after reconnection; cancellation state and platform acceptance remain honest | C25 C26 C29 | H05 |
| AC-29 | Mobile mixed-script review and approval | Text/media, destination, date/time/timezone, status and controls are legible and usable in English LTR; keyboard/detail alternatives and independent region settings work | C05 C24 C28 C35 | H10 |
| AC-30 | Intended ordinary owner connects and publishes | The production configuration supports the owner's actual access path and genuine publication; developer-role account success alone cannot satisfy the gate | C25 C26 demonstrate only the tested account class | H06 |
| AC-31 | Direct email signup | Email/password signup signs in immediately without email verification and continues directly to Onboarding. | C03 | H02 |
| AC-32 | Google identity | Signup/login validate state/PKCE/nonce/claims; cancellation is safe, matching email never silently links, explicit reauthenticated link succeeds without takeover. | C04 demonstrates basic Google login only | H02 |
| AC-33 | Optional offering pricing | Multiple offerings accept fixed, starting-from, quote-required and unknown models; optional amounts require currency and missing values never become zero. | C07 | H10 |
| AC-34 | Completion and return routing | Existing verified users with completed Onboarding enter Marketing Director Chat (`/employee`) after successful normal login; incomplete Onboarding opens required setup (`/onboarding`); first-time completion offers Chat (`/employee`) or Create My Roadmap (`/roadmap`); authorized explicit deep links open requested resources; refreshing a valid authenticated route preserves current route; no last-visited-page restoration occurs. | C03 C06 C07 | H10 |
| AC-35 | Choice-first forms | Current Brain personalizes meaningful choices plus Other; legitimate unknown/skip/not-applicable and real numeric/text fields work. | C12 C18 | H07 |
| AC-36 | Wizard persistence | Close/reopen after edits and adaptive branching: saved draft/questions/statuses restore; conflicts do not overwrite another edit. | C18 | H10 |
| AC-37 | Question research and return | Save → linked conversation/task → selected evidence-aware result → exact question → confirmation survives switching/reconnect; forged/cross-tenant origins fail. | C19 | H03 H10 |
| AC-38 | Knowledge reuse | Later Discovery reuses confirmed current answers/provenance; stale/conflicting facts are flagged and skipped/unknown answers never become positive knowledge. | C09 C12 C18 C19 | H08 H10 |
| AC-39 | Execute step | Eligible step launch checks authority/dependencies and creates one Task under double click/retry; reopening does not relaunch. | C11 C21 | H01 H10 |
| AC-40 | Skip and Revisit | Record intent/time, preserve non-completion, explain blocked dependents and alternate paths; Revisit recalculates readiness without cancelling running work. | C21 | H10 |
| AC-41 | Task capacity across conversations | Two running Tasks in different conversations continue; third remains truthfully requested/waiting, with atomic admission on release. | C11 C13 | H01 |
| AC-42 | Conversation Canvas switching | Switching conversation changes selected Canvas; late old-stream events cannot contaminate it; conversation-local history selects other related Tasks. | C13 | H10 |
| AC-43 | Recoverable retry UX | Authorized transient retries remain Processing with no failure flash/attempt counter/notification; internal diagnostics retain causes. | C11 C13 | H01 |
| AC-44 | Terminal failure | After operation-specific recovery is exhausted, show truthful failed or partial result and supported recovery; never conceal it as Processing. | C10 C11 C13 | H01 |
| AC-45 | Strategic revision | Diff includes added/modified/removed-or-superseded/dependency changes; stale approval fails, reject preserves active plan, accepted revision is atomic. | C22 | H10 |
| AC-46 | One active Roadmap | Concurrent activations cannot create two active plans; drafts survive, archived versions and original execution references remain inspectable. | C20 C22 | H10 |
| AC-47 | Document lineage | Research saves a non-Post Deliverable; owner/Chat edits create a new immutable version of the same artifact with sources/context and staleness labels. | C16 | H08 H10 |
| AC-48 | Manual New Post | Create/edit a draft in Scheduling without a connected Page; subsequent publishing requires connection and exact-version approval. | C23 C24 | H10 |
| AC-49 | Unscheduled drafts | Manual draft creation or editing with `scheduledTime: null` appears only in Unscheduled; no invented calendar date or release workflow dispatch. | C23 C27 | H10 |
| AC-50 | Calendar views | Month/Week/List and range/filter pagination agree; proposed dates are visibly unapproved; mobile and keyboard alternatives work across DST. | C05 C27 C35 | H10 |
| AC-51 | Bulk approval | Only enumerated displayed versions are decided; stale/missing/ineligible items report per-item failure and retry cannot approve a newer unseen version. | C28 | H05 |
| AC-52 | Rescheduling | Drag/form rescheduling of an approved Post sends complete `ScheduledTimeInput` (`{ instant, zone, latenessAllowanceMinutes }`), creates a new immutable Post Version, and invalidates approval; timezone default change never moves an approved instant. | C23 C28 | H05 H10 |
| AC-53 | Historical publication | Confirmed Posts appear at actual publishedAt, not an obsolete proposed date; duplicate creates a new Draft and local deletion claims no platform removal. | C23 C26 C27 | H05 |
| AC-54 | Connection recovery | Disconnect blocks sends and advances authorization generation; reconnect does not release overdue/uncertain work without fresh checks/approval as required. | C25 C26 C29 | H05 H06 |
| AC-55 | Contextual notifications | Read/unread/count and mark-all-read work; exact form/Post/document/revision/proposal/settings links validate access and deleted subjects show unavailable. | C32 | H03 H10 |
| AC-56 | Removed route absence | Active router/OpenAPI/module/job inventories contain no Today or Outcomes/recurring-review resources, including renamed substitutes. | C31 C34 C37 | H10 |
| AC-57 | Step model absence checks | Active schemas/components/DTOs/events contain no Now/Next/Later or horizon properties, board controls or planning-column limits. | C20 C21 C37 | H10 |
| AC-58 | Deferred Meta Ads | Phase 5 vision is consistent across documents/UI; no current Ads connector/tool/spend permission is advertised or executable. | C17 C25 C34 C37 | H10 |

## Deferred capability visibility

| ID | Later capability | Competition presentation |
|---|---|---|
| P3-01 | Social profile import | Disabled Coming Soon control; no simulated import |
| P3-02 | Instagram Business and X publishing | Upcoming; no active connect/publish claim |
| P3-03 | Connected analytics | Upcoming; current CSV/XLSX analysis is explicitly supplied data |
| P4-01 | Native image generation | Upcoming; use owner media and visual briefs |
| P4-02 | Billing/subscriptions | Upcoming; internal usage limits are not customer billing |
| P5-01 | Meta Ads management | Future-only; no current ads tool, connector, budget spending or campaign launch |

## Phase checkpoints

**Competition foundation checkpoint:** C02–C13 relevant contracts produce a real authenticated, isolated workspace; confirmed setup; editable Brain; scoped Director work; saved output/events; in-app navigation continuity and honest browser interruption. Add document result saving from C16. Keep production durability and full auth/security proof visibly outstanding.

**Competition feature checkpoint:** all C01–C40 status rows have evidence or a named unresolved blocker. All visible first-two-phase features listed in README are exercised; external dependency failures do not become fake passes.

**Full Phase 1/2 checkpoint after competition:** H01–H10 and every active row above reach production_verified, including real publishing, ordinary-owner access, held-out English quality across task categories, deterministic calculations, recovery, data controls and declared resource/load limits. No paid-customer count is required by the supplied PRD.


## Executed local evidence — 18 November 2026

Accountable implementer: Codex in the owner's local workspace. These are local checks, not hosted Supabase/provider acceptance. Full task status remains in `IMPLEMENTATION_PROGRESS.md`.

| Requirements | Status | Evidence and limits |
|---|---|---|
| FR-01, FR-50; AC-31, AC-32, AC-34 | partial | `test:foundation:ui`: intercepted signup/verification/cancel, safe deep links, bootstrap SQL idempotency; real email/recovery/Google and Roadmap destination unverified. |
| FR-04–07; AC-02, AC-20, AC-33 | partial | `test:intake:ui` plus `intake-db-check.sql`: same manual form, optional prices, not-ready route, saved versions, stale review and confirmation; real Supabase and working Roadmap choice still required. |
| FR-03, FR-26; AC-01, AC-27 | partial | 26 crawler tests; no premature approval; bounded public-target guard; proposal migration local checks. Actual public website/Edge flow unverified. |
| FR-08–10, FR-12, FR-48; AC-03, AC-23 | partial | `brain-governance-db-check.sql` and `test:brain-governance:ui`: price history, pending proposals, stale decisions, relationships, holds, deletion. Export and hold-resolution UI incomplete; live integration unverified. |
| FR-43–44; AC-11, AC-29; NFR-07 | partial | English-only build and 320/390/768/1440 browser regression; legacy language preference cannot change UI; independent region SQL/browser checks and seasonal timezone formatting. Later screens and live generation quality still unverified. |
| NFR-03–04 | partial | Empty/populated local migration harness, two-owner RLS/relationship/private-key/media tests; sanitized Markdown/link injection regression. Hosted security and future execution paths remain unverified. |
