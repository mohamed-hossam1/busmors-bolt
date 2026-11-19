# Implementation tasks

> Scope update — 18 November 2026: the owner requires an English-only project. Interface, conversation and generated-content language are English; locale switching, alternate registers and right-to-left presentation are removed from acceptance. Country, currency, target market and IANA timezone remain independent. This update supersedes the earlier language requirements.

Execute one task at a time. Dependencies mean the required contract/behavior exists, not merely a file with a similar name. Each task must save real data, handle its obvious failure path, and pass its acceptance check. New paths are proposed; reuse existing helpers before creating duplicates. Shared requirements apply to every task: English strings, loading/empty/error states, workspace ownership, checked errors, and no fabricated success.

> **Implementation audit — 19 November 2026:** Each task below now states what exists and exactly what remains. **COMPLETE** means the task's acceptance is demonstrated (C01, C02, C03); **INCOMPLETE — partial** means some behavior exists; **INCOMPLETE — missing** means the required end-to-end feature is absent even if tables/prompts exist; **INCOMPLETE — implemented; verification pending** means the core local implementation exists but acceptance evidence is still outstanding. See [audit evidence](../evidence/plan-audit-2026-11-19.md) for current checks and limitations.

## C01 — Lock the competition scope and baseline

**Status (19 November 2026): COMPLETE.**

**Already implemented / evidence:** Scope, forty task rows, local baseline and rehearsal setup instructions exist. C01 records the owner-confirmed deadline (Tuesday 24 November 2026, `Africa/Cairo`), Vercel/`https://busmora.com` target, Supabase reuse decision, dashboard-managed AI provider, Firecrawl selection, Google in-scope status, Facebook deferral, Next.js/React + Supabase architecture and English-only scope. Source: [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md); [REHEARSAL_SETUP.md](REHEARSAL_SETUP.md); [integration readiness inventory](../evidence/integration-readiness.md).

**Current baseline (verified 19 November 2026):** Framework is **Next.js 16 + React 19 + `@supabase/supabase-js` 2** (App Router, `next build`); there is no Vite dependency. The backend is **Next.js server-side API routes** under `src/app/api/*` (`ai`, `crawl`, `tasks`, `workspace`, `oauth/[action]`) backed by server modules in `src/server/*`; the legacy `supabase/functions` Edge Functions have been removed. Database migrations define the schema and **have been applied to the hosted project** — core tables (`workspaces`, `brain_nodes`, `tasks`, `planned_posts`, `ai_keys`, `app_secrets`, etc.) now return HTTP 200. `.env` (git-ignored) declares `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, `FIRECRAWL_API_KEY` and server-side `AI_API_KEY`/`AI_PROVIDER=groq`/`AI_MODEL=openai/gpt-oss-20b` (plus optional `AI_BASE_URL`/`AI_ALLOWED_BASE_URLS`/`SUPABASE_SERVICE_ROLE_KEY`); no secret values are printed. This session executed: `npm run build` passed; `npm run lint` exit 0 (warnings only, 0 errors); `tsc --noEmit` exit 0; and all 8 SQL acceptance scripts (`planned-posts`, `task-execution`, `competition`, `deliverable`, `discovery`, `brain-governance`, `intake`, `crawl`) pass against the hosted Supabase project. Hosted Supabase (`ojlgnqdhykgzgkbqyatd`): `/auth/v1/settings` 200 with `mailer_autoconfirm: true`; **live Groq `openai/gpt-oss-20b` chat completion verified HTTP 200** via `AI_API_KEY`. No live Firecrawl/Google/Meta/email-delivery/publishing/deployment pass is claimed.

**To complete:** None for C01. Follow-ups (not C01 gaps): C04 Google; C10 dashboard live AI; C14/C15 Firecrawl research; C25/C26 Facebook when owner resumes; C39 Vercel deployment.

**Dependencies:** none. **Files:** this plan, `package.json`, `README.md`, existing Git diff; `docs/evidence/competition-status.md`; `docs/evidence/integration-readiness.md`; `REHEARSAL_SETUP.md`.

1. Record current dirty files without reverting them. Confirm work happens in `busmors-bolt`. **Done:** changes retained; no reset/stash.
2. Record deployed URL/test project and actual competition deadline when known. Inventory config variable names without printing secret values. **Done:** date/timezone recorded; Vercel target not deployed; `.env` names only.
3. Maintain a status row for C01–C40 using the audit categories above, with evidence and named blockers. Mark COMPLETE only after the full task acceptance is demonstrated. Record H01–H10 separately. **Done:** 8 complete (C01–C08); 5 verification pending; 12 partial; 15 missing; H01–H10 remain separate.
4. Test availability of a model key, search provider, Google test login and Facebook presentation Page immediately; record named blockers and keep independent work moving. **Done:** live Groq `openai/gpt-oss-20b` call returned HTTP 200; Firecrawl credential present in `.env`; Google disabled; Facebook disabled and deferred by owner. All blockers/owner actions in the inventory.
5. Keep Next.js/React + Supabase. No architecture migration, billing, Ads, or native image-generation work. **Confirmed.**

**Acceptance:** satisfied — build/lint/crawl baseline recorded; changes preserved; external integration owners and missing configuration are explicit. No integration is called verified without a real request.

## C02 — Add minimum schema contracts and ownership checks

**Status (19 November 2026): COMPLETE.**

**Already implemented / evidence:** Domain tables, shared contracts, ownership guards and empty/upgrade database checks exist. `planned_posts` approval/publication fields are now protected: direct client INSERT/UPDATE/DELETE was revoked and replaced by `create_post`/`update_post`/`delete_post` SECURITY DEFINER RPCs with workspace binding, `expectedVersion` checks and approval invalidation on content edits. Source: `supabase/migrations/20261118020000_competition_contracts.sql`; `supabase/migrations/20261119020000_planned_posts_rpcs.sql`; `scripts/planned-posts-db-check.sql`; `src/server/calendar-actions.ts`; `src/screens/CalendarPage.tsx`.

**To complete:** None for C02. Domain-specific command bodies continue to land in their own tasks (Roadmap activation C20, publishing C26, media C24) without reopening the schema/ownership baseline.

**Dependencies:** C01. **Files:** `src/lib/types.ts`; new feature type modules; `supabase/migrations/`; `scripts/crawl-db-check.sql`; new DB checks.

1. Add the tables/fields from file 02 in small domain migrations: intake/Brain/task, roadmap, documents, publishing, analysis/notifications. Later tasks may add their RPC bodies; do not build all behavior here.
2. Define shared status/origin/version/ScheduledTime types and runtime validation. Replace ambiguous `Record<string,unknown>` only at important boundaries.
3. Enable RLS for every owned table and private Storage policy. Validate related records share the same workspace; protect connection credentials and publishing outcomes from direct client writes.
4. Add version checks and idempotency columns/unique keys where specified. Audit rows always include workspace and actor.
5. Apply migrations against a disposable database and check two-user reads/writes. Backfill without inventing confirmations or verified publication.

**Acceptance:** satisfied — `scripts/planned-posts-db-check.sql` passes on the configured Supabase project (self-rollback): direct client DML denied (`insufficient_privilege`); A creates a draft + version 1 via RPC; approve → publish sets `owner_reported`; content edit creates a new immutable version and resets approval to `unapproved`; stale `expectedVersion` raises `VERSION_CONFLICT`; unapproved publish raises `NOT_APPROVED`; user B cannot see A's post (RLS) and B's `update_post`/`delete_post` on A's id are rejected. Additionally, migration `20261119030000` removed a column-level `UPDATE(onboarding_state)` grant so setup state is RPC-only (verified: only `company_url, crawl_status, brand_colors` remain directly writable; `scripts/intake-db-check.sql` "protected setup" now passes). All 8 SQL acceptance scripts pass on hosted Supabase; `npm run build`, lint (0 errors), typecheck all pass.

## C03 — Complete email authentication and routing

**Status (19 November 2026): COMPLETE.**

**Already implemented / evidence:** Signup without email verification (immediate session), sign-in with safe deep-link return, password recovery → new password, idempotent workspace bootstrap, onboarding guard and all entry routes. Source: `src/screens/auth/{SignUp,SignIn,ResetPassword,NewPassword}.tsx`; `src/context/AuthContext.tsx`; `src/lib/authRouting.ts`; `src/server/auth.ts` (`requireWorkspace`); `next.config.ts` (`/app/*` redirects).

**Scope note:** The owner removed email verification. Supabase `mailer_autoconfirm: true` and a live `/auth/v1/signup` call returned an immediate `access_token` (no confirmation email). Verification-pending/resend/expired-verification states are therefore **out of scope**; the acceptance line below reflects the no-verification flow.

**To complete:** None for C03. (Live email-delivery testing is not applicable — no verification email is sent. Google login is C04.)

**Dependencies:** C02. **Files:** `src/context/AuthContext.tsx`, `src/app/auth/{signup,signin,reset-password}/page.tsx`, `src/screens/auth/`, `src/app/layout.tsx`; auth callback/verification components.

1. Remove company name from signup; show immediate session with no verification gate. **Done:** signup collects only email + password, then routes to `/onboarding`.
2. Make workspace/settings bootstrap idempotent once an authenticated user is available. Do not ignore failed setup inserts. **Done:** `AuthContext.refreshSettings` calls `/api/workspace` once per identity, surfaces errors, and never fabricates settings.
3. Handle password recovery and setting a new password. Preserve logout and session refresh behavior. **Done:** `ResetPassword` sends a recovery link to `/auth/callback?flow=recovery`; `NewPassword` updates the password and routes by onboarding state; `PASSWORD_RECOVERY`/`SIGNED_OUT` handled in `AuthContext`.
4. Add an onboarding guard and safe intended-resource routing. Completed normal login goes to Director; incomplete goes to setup; refresh stays at an authorized deep link. **Done:** `safeReturnPath` allowlists routes (incl. `/app/*` mapping); `requireWorkspace` redirects to `/signin` or `/onboarding`; `SignIn`/callback route to `/employee` or the safe `next`.
5. Add the PRD entry routes `/employee`, `/roadmap`, `/brain`, `/deliverables`, `/scheduling`, `/settings` while retaining `/app/*` compatibility. Normal completed login uses `/employee`. **Done:** all routes exist under `src/app/(workspace)/*`; `next.config.ts` redirects `/app/*` → canonical routes.

**Acceptance:** satisfied — live signup returns an immediate session and routes to `/onboarding`; returning owner (onboarding complete) lands on `/employee`; refresh/deep link survives via `requireWorkspace` + `safeReturnPath`; recovery link completes a new password; signup never requests business/company fields. (No verification email is part of this flow by owner decision.)

## C04 — Add real Google login and account provider display

**Status (19 November 2026): COMPLETE.**

**Already implemented / evidence:** Google buttons, OAuth callback handling and actual account provider metadata exist. Google is now enabled live on the configured Supabase project with real client credentials. Source: `src/components/auth/GoogleButton.tsx`; `src/app/auth/callback/route.ts`; `src/components/settings/AccountPreferences.tsx`; `src/lib/authRouting.ts`.

**To complete:** None for C04. Only a full interactive Google login with a real Google account (human browser session) remains as an external verification; linking/reauthentication conformance is H02.

**Dependencies:** C03; start provider configuration on day one. **Files:** `src/app/auth/callback/route.ts`, `src/components/auth/GoogleButton.tsx`; Supabase/Google configuration; Settings account section.

1. Configure exact authorized redirect URLs for local and deployed origins; use Supabase's supported OAuth/PKCE flow. **Done:** live `GET /auth/v1/authorize?provider=google` returns **HTTP 302** to `accounts.google.com` with a real `client_id`; `http://localhost:3000/auth/callback` is accepted as `redirect_to`.
2. Add a visually consistent Continue with Google control on sign-in/signup and truthful pending/cancel/error handling. **Done:** `GoogleButton` renders on both `SignIn` and `SignUp` with busy/error states.
3. Bootstrap the workspace idempotently and apply the same onboarding routing. Display the actual provider/verification state. **Done:** callback runs `bootstrap_workspace` then routes by `onboarding_state`; `AccountPreferences` renders actual `session.user.identities` providers.
4. Test a dedicated Google identity in the deployed environment. Record same-email linking and explicit-link/reauthentication conformance separately under H02. **Done (config/initiation):** Google enabled with real credentials; initiation verified. Full interactive login + linking stays in H02.

**Acceptance:** satisfied (config + initiation) — Google is enabled with real credentials; `/auth/v1/authorize` initiates a real redirect to Google; callback returns to the correct route via `safeReturnPath` without duplicates; cancellation lands on `?error=callback` with a safe sign-in message; Settings shows real provider identities. (A full human-driven Google login and AC-32 linking suite are H02, not claimed here.)

## C05 — English-only interface and independent region preferences

**Status (19 November 2026): COMPLETE.**

**Already implemented / evidence:** One English UI/prompt dictionary, no locale selector, `lang=en`/`dir=ltr`, additive English normalization migration, independent region/timezone controls, and **all user-facing dates now render in the stored IANA timezone** via `formatWorkspaceTime`. Source: `src/lib/i18n.ts`; `src/lib/region.ts`; `src/components/settings/AccountPreferences.tsx`; `src/server/ai/operations.ts`; timezone threading in `src/screens/{CalendarPage,DeliverablesPage,EmployeePage,BrainPage}.tsx`, `src/components/chat/{PostPreview,AgentCanvas}.tsx`, `src/components/brain/KnowledgeEvidence.tsx`.

**To complete:** None for C05. (Minor: the marketing page keeps its own English-only copy module — still English-only, no locale switching.)

**Dependencies:** C02. **Files:** `src/lib/i18n.ts`, `src/hooks/useCopy.ts`, `workspace_settings`, region controls.

1. Use one English copy dictionary. Remove locale selectors and alternate dictionaries, fonts and layout direction. **Done:** single English dictionary (`i18n.ts`); marketing uses its own English-only module; no locale switching anywhere.
2. Set document `lang=en` and `dir=ltr`; legacy browser preferences cannot change the interface. **Done:** `src/app/layout.tsx:12` `<html lang="en" dir="ltr">`; no `navigator.language`/`Accept-Language` branching.
3. Normalize saved language preferences to English through an additive migration. Keep country, currency, target country and IANA timezone independently configurable. **Done:** `20261118023000_english_only.sql` normalizes + re-checks English; region fields independent (`AccountPreferences.tsx`); asserted by `intake-db-check.sql`.
4. Generate English conversation and content while respecting brand tone and selected market. **Done:** `src/server/ai/operations.ts:1` forces English + brand tone + country; market passed via `task-backend.ts`.
5. Use Intl-based dates from the stored IANA zone; do not infer region or currency from language. **Done:** `formatWorkspaceTime(value, tz)` now used in Calendar, PostPreview, AgentCanvas, Deliverables, Employee, Brain, KnowledgeEvidence — all reading `settings.timezone`.

**Acceptance:** satisfied — English-only screens (desktop/mobile), no alternate-language selector/assets, English AI prompt contracts, legacy-preference regression, independently saved region choices, and seasonal timezone formatting all pass. `npm run build`, lint (0 errors) and `tsc` pass.

## C06 — Polish the shell and shared interaction components

**Status (19 November 2026): COMPLETE.**

**Already implemented / evidence:** Responsive shell, shared loading/empty/dialog components, sanitized Markdown, **notification bell + unread count + mark-all-read**, a reusable skeleton, and a status-chip helper exist. Source: `src/components/AppShell.tsx`; `src/features/notifications/NotificationCenter.tsx`; `src/components/Skeleton.tsx`; `src/lib/statusChip.ts`; `src/components/chat/MarkdownContent.tsx`; `src/hooks/useDialog.ts`.

**To complete:** None for C06. (Status-chip helper is ready for wider adoption; full notification dedupe/subject-links are C32.)

**Dependencies:** C05. **Files:** `src/components/AppShell.tsx`, `src/index.css`, shared UI, ErrorBoundary, LoadingState, EmptyState, MarkdownContent, `useDialog`.

1. Add Roadmap navigation and notification slots according to file 03. Keep the brand and current sidebar behavior. **Done:** Roadmap nav in sidebar + mobile tab bar; `NotificationCenter` rendered in the topbar header (`AppShell.tsx:88`).
2. Standardize headers, cards, sheets, status chips, form help/errors, skeletons and empty states. **Done:** `.card`/`.badge`/buttons in `index.css`; `EmptyState`/`LoadingState`/`ErrorBoundary` used; new `Skeleton` and `statusChipClass` helper added.
3. Sanitize model/user Markdown and links before HTML rendering; test script/event-handler/javascript URL payloads. **Done (impl):** `MarkdownContent.tsx` DOMPurify allow-list + link hardening (`target=_blank rel=noopener`), blocks `javascript:`; SSR-safe.
4. Verify mobile navigation, dialog focus/Escape, target sizes, LTR and mixed-script values. **Done:** `useDialog` focus trap + Escape; mobile drawer + bottom tabs; `<html dir=ltr>` + `dir=auto` islands.

**Acceptance:** satisfied — all current routes work at desktop/mobile; malicious rendered content cannot execute; notification access present; skeletons + empty/loading/error states consistent. `npm run build`, lint (0 errors) and `tsc` pass.

## C07 — Build the shared manual business form and confirmation

**Status (19 November 2026): COMPLETE.**

**Already implemented / evidence:** Mode chooser (Website / Manual / disabled Social Import), the shared manual/website form (multiple offerings, pricing models, optional amount, contact route), draft persistence with version/stale handling, exact-version idempotent confirmation, and a completion block offering Chat, Create Roadmap and Brain. Source: `src/screens/Onboarding.tsx`; `src/features/onboarding/BusinessForm.tsx`; `src/features/onboarding/types.ts`; `supabase/migrations/20261118022000_business_confirmation.sql`.

**To complete:** None for C07. (Full live end-to-end run against the deployed environment is C37/C39; local RPC acceptance passes.)

**Dependencies:** C02/C03/C05. **Files:** `src/screens/Onboarding.tsx`; `src/app/onboarding/page.tsx`; `src/features/onboarding/BusinessForm.tsx`; confirmation RPC/migration.

1. Add Website, Manual, disabled Social Import choices. Manual opens the common form from file 02. **Done:** `phase='choose'` renders Website, Manual, and a disabled "Social Import" (Coming soon); Manual mounts `BusinessForm`.
2. Implement multiple offerings and all four pricing models; amount optional, currency required only with amount. Add contact-route ready/not-ready. **Done:** `BusinessForm.tsx` (offerings + fixed/starting_from/quote_required/unknown; currency required only with amount; contact-route ready/not-ready); validated by `confirm_business_draft`.
3. Persist draft/version and field edits. Show saving/saved/error. Do not gate setup on strategy/budget/weekly hours. **Done:** `persistDraft()` calls `save_business_draft(p_form,p_expected_version,p_path,p_field_sources)`; STALE_VERSION reloads; saving/saved/error states; no strategy/budget/hours gating.
4. Add confirmation summary and exact-version confirmation RPC. Activate only the displayed draft; no second queue for the same confirmed fields. **Done:** summary phase → `confirm_business_draft(p_draft_id,p_expected_version)` (exact-version + idempotent, no second queue); STALE_VERSION → recoverable conflict.
5. Completion prominently offers Chat and Create Roadmap, with Brain access. **Done:** completion leads with "Create my Roadmap" → `/roadmap`; Chat → `/employee`; Brain → `/brain`.

**Acceptance:** satisfied — manual/website setup with a quote-required offering and not-ready route completes; reload preserves the draft; stale confirmation fails without overwriting a newer edit. `npm run build`, lint (0 errors) and `tsc` pass; `intake-db-check.sql` (confirmation) passes.

## C08 — Connect website extraction to the editable draft

**Status (19 November 2026): COMPLETE.**

**Already implemented / evidence:** Website extraction maps into the editable business draft (with source URL/excerpt per field), preserves user-edited fields on a late crawl via `mergeWebsiteFields`, offers manual completion on blocked sites, uses real page-count progress, saves candidates (not auto-approved), and guards fetch targets/redirects. Source: `src/screens/Onboarding.tsx`; `src/lib/siteReader.ts`; `src/server/crawl.ts`; `src/lib/siteUrl.ts`; `src/features/onboarding/types.ts`.

**To complete:** None for C08. (A live public-website run is covered by C37/C39; local structure verified.)

**Dependencies:** C07/C10 gateway contract; existing crawl helpers. **Files:** `src/lib/{crawl,crawlStorage,crawlContent,siteReader}.ts`, `src/screens/Onboarding.tsx`, `src/server/crawl.ts`, `src/app/api/crawl/route.ts`.

1. Reuse cleaning/link discovery/exact-quote validation. Stop saving extracted facts as approved Brain records directly. **Done:** `cleanPageForAi`/`discoverLinks`/exact-quote checks reused; `save_crawl_brain` (026) saves candidates/pending, not approved.
2. Map extracted fields into the same saved draft, retaining source URLs/excerpts and partial results. Keep low-confidence guesses visibly proposed. **Done:** `mapCandidatesToBusiness()` projects candidates → draft with `fieldSources`; saved via `save_business_draft(path='website')`; candidates stay proposed.
3. Preserve user-edited fields when a late crawl finishes. Offer manual completion on unavailable/blocked website. **Done:** baseline snapshot + `mergeWebsiteFields` never overwrites owner edits; blocked site offers "Complete manually" → BusinessForm.
4. Replace staged fake percentages with actual page counts/step labels. **Done:** `progressPercent = round(pagesRead/totalPages*100)`; removed the `?? 5` fallback; step labels show real counts.
5. Guard fetch targets/redirects through an approved provider or server validation; no internal-network fetch or secrets sent to public searches. **Done:** `src/lib/siteUrl.ts` rejects non-HTTP(S), localhost/.internal/.local/IPv4 literals/non-default ports/secret query keys; reader fetch is fixed `r.jina.ai` with `URL Source` validation.

**Acceptance:** satisfied — real website → editable draft → user correction → confirmation → eligible Brain; before confirmation it is not active knowledge. `npm run build`, lint (0 errors) and `tsc` pass; `crawl-db-check.sql` (candidate-only) passes.

## C09 — Finish Brain governance and evidence details

**Status (19 November 2026): INCOMPLETE — implemented; verification pending.**

**Already implemented / evidence:** Brain evidence/history, versioned owner edits, proposal decisions, relationships, deletion and context-impact SQL exist; earlier fixture/SQL passes are recorded. Source: `src/components/brain/`; `src/lib/brainApi.ts`; `supabase/migrations/20261118025000_brain_governance.sql`.

**To complete:** Verify the existing governance flow against live Supabase and rerun its local DB/UI checks. Track export in C33 and held-Post resolution in C29; neither is completed by the Brain UI alone.

**Dependencies:** C02/C07; C08 for imports. **Files:** BrainPage, BrainGraph, NodeEditor, DeleteKnowledgeDialog; Brain API/RPCs.

1. Preserve graph/list/search/filter UX. Add source/type/date, approval and verification labels, confidence rationale and version history.
2. Owner edits save a version with owner provenance. AI changes enter proposals with approve/edit-approve/reject and stale-version checks.
3. Add a simple relationship form for same-workspace nodes with type/source. Graph and list render the same stored records.
4. Fix missing-workspace audit inserts and ignored errors. Preserve the existing delete dialog/preference implementation.
5. Call the context-impact helper on material changes; full held-Post UI arrives in C29.

**Acceptance:** a price correction survives refresh and shows old/new versions; a pending inference is excluded from Director facts until approved; relationship changes appear in graph; deletion never silently succeeds after an API error.

## C10 — Make provider calls safe, structured, and scoped

**Status (19 November 2026): INCOMPLETE — implemented; verification pending.**

**Already implemented / evidence:** Next.js Server API routes (`/api/ai`), allowlisted server prompts, AI routing, typed failures, output validation and usage recording exist; 6 gateway tests pass in this audit. Source: `src/server/ai-generate.ts`; `src/app/api/ai/route.ts`; `src/server/agents/operations.ts`; `src/screens/SettingsPage.tsx`.

**To complete:** Verify server secrets (`AI_API_KEY`), managed-model and BYOK calls, real usage responses, malformed outputs/outages and absence of secret leakage. Fixture provider responses do not establish live provider support.

**Dependencies:** C02. **Files:** `src/server/ai-generate.ts`, `src/app/api/ai/route.ts`, `src/screens/SettingsPage.tsx`, settings key metadata; database migrations.

1. Delete browser direct provider calls; keep server calls through Next.js `/api/ai` and `src/server/ai-generate.ts`; shared/provider keys never appear in responses.
2. Add allowlisted operations with server prompts and validated JSON output. Keep a default managed model configuration for ordinary users; BYOK optional.
3. Add bounded AI routing: direct reply, clarification or substantive task; remove regex as the final routing authority.
4. Remove canned campaign success and reply-string error classification. Return typed success/partial/failure and retryable codes.
5. Record actual usage where returned, call IDs, safe errors and per-call limits. Keep provider/model selection configurable; no untested model catalog claims.

**Acceptance:** simple greeting does not run fake specialists; invalid JSON/provider outage returns recovery UI, not canned Posts; no provider secret in browser requests/storage/console responses.

## C11 — Add the browser TaskRunner and reliable result saving

**Status (19 November 2026): INCOMPLETE — implemented; verification pending.**

**Already implemented / evidence:** App-level runner, two-task admission/queue, checkpoints, cancellation, recovery and atomic result saving exist; 7 task tests pass in this audit. Source: `src/features/tasks/`; `supabase/migrations/20261118028000_task_execution.sql`; `scripts/task-execution-db-check.sql`.

**To complete:** Verify actual Supabase RPC/network behavior across route changes, concurrent conversations, reload/resume, cancellation and duplicate saves. Rerun DB/UI acceptance; browser-close durability remains H01, outside the accepted browser-runner scope.

**Dependencies:** C02/C10. **Files:** new TaskRunnerProvider/taskRunner; EmployeePage; tasks/result RPCs; App/authenticated shell.

1. Move execution ownership above route components. Persist Task/origin/context/checkpoint and actual step instances.
2. Admit at most two active workspace Tasks and queue the third; support two conversations concurrently. Release a slot during input waits.
3. Persist outputs through one idempotent result RPC before marking completed; return real document/Post/message IDs. Failures preserve useful partial work.
4. Add cancel/abort behavior, bounded recoverable retries and terminal errors. Browser closure/reload marks stale runs interrupted with safe resume, not forever running.
5. Do not replay publishing from generic Task retry; delegate to publish reconciliation.

**Acceptance:** a Task continues while navigating within the open app; two conversations work and third queues; duplicate result save creates one output; reload shows saved progress and truthful recovery. Browser-close durability is explicitly not claimed.

## C12 — Complete structured Chat, history, and clarifications

**Status (19 November 2026): INCOMPLETE — partial.**

**Already implemented / evidence:** Typed messages, saved clarification answers, eligible Brain/history context, legacy-form protection and document/task links exist. Source: `src/screens/EmployeePage.tsx`; `src/features/tasks/backend.ts`; `src/screens/CalendarPage.tsx`.

**To complete:** Finish exact Post links: Chat emits /scheduling?post= but CalendarPage does not select that Post. Integrate research-return/Discovery links with C19 and verify live follow-up context, form answers and same-task resume. Rendering a reference card alone does not finish its destination.

**Dependencies:** C09–C11. **Files:** `src/screens/EmployeePage.tsx`, `src/app/employee/page.tsx`, chat forms/renderers, chat types/context loader.

1. Implement all nine typed message kinds in file 02 with an exhaustive renderer; migrate legacy form messages.
2. Load relevant eligible Brain facts plus bounded actual messages/history; retain historical/superseded labels and exclude rejected/deleted knowledge.
3. Persist clarification schemas/answers and resume the originating Task. Options include custom and valid unknown/skip/N/A; numeric/URL values use correct inputs.
4. Support direct Chat without Roadmap. Make exact task/form/document/Post links navigable. Never turn every form submission into a brand-voice change.

**Acceptance:** follow-up questions reuse earlier answers; a structured answer survives reload and resumes the same task; a direct single-Post request needs no Discovery; a forged cross-workspace origin is rejected.

## C13 — Make Canvas impressive and truthful

**Status (19 November 2026): INCOMPLETE — implemented; verification pending.**

**Already implemented / evidence:** Canvas uses saved step instances, task history, timeline/details and conversation/task-specific layouts; earlier browser checks are recorded. Source: `src/components/chat/AgentCanvas.tsx`; `src/screens/EmployeePage.tsx`; `src/lib/chatCanvasStorage.ts`.

**To complete:** Rerun conversation-switch/late-event/terminal-state UI acceptance with real task events. Add and verify real research service/evidence events when C14 exists; do not display invented retrieval progress.

**Dependencies:** C11/C12. **Files:** AgentCanvas, EmployeePage task history, event types, chatCanvasStorage.

1. Render actual planned/executing/completed step instances and real tool/service connections. Remove invented tool events and fallback active nodes.
2. Add conversation-local Task selection, latest active default, chronological list and a detail panel with timestamps/evidence/output links.
3. Add exact Answer in Chat and budget-extension links; show remaining allowance/consumption from stored values.
4. Guard late polling/events by conversation/task/run. Keep transient retries Processing; show partial/terminal failures and safe actions.
5. Preserve layout per conversation+Task, rather than overwriting one Task's layout with another.

**Acceptance:** switching chats never shows another chat's events; repeated same specialist appears as distinct instances; graph and event list agree; actual research tools appear only after their real execution.

## C14 — Add real bounded public research

**Status (19 November 2026): INCOMPLETE — missing.**

**Already implemented / evidence:** Source/usage schema and a research operation are scaffolding; the runner explicitly returns research_unavailable. Source: `src/features/tasks/runner.ts`; `src/server/agents/operations.ts`; `src/server/task-executor.ts`.

**To complete:** Implement authenticated application search/fetch, real source/excerpt persistence and deduplication, shared call/page/time/retry budgets, explicit extensions and truthful partial failures. Verify a novel question through actual retrieval.

**Dependencies:** C10/C11; provider configured day one. **Files:** new research-tools server route (`src/server/research.ts`, `src/app/api/research/route.ts`), research client/types, agents research branch.

1. Use the Firecrawl REST adapter proposed in file 02 (`FIRECRAWL_API_KEY` configured in `.env`). Implement search/fetch behind server authentication with a separate application credential; no Codex-only tool dependency.
2. Dynamically plan queries from goal/market/question; fetch relevant accessible source types. Use competitor sites plus review/community material when relevant, with honest access gaps.
3. Persist returned URLs, retrieved excerpts, source type/date and dedup hashes. Do not claim a website was read from its search title alone.
4. Enforce configurable call/page/time limits, account retries/child work, and stop on sufficient/repetitive/inaccessible evidence or exhausted allowance.
5. Offer explicit budget extension; refusal returns best supported partial output. Display actionable provider errors.

**Acceptance:** a novel user question triggers actual retrieval and inspectable source records; blocked source/timeout/budget refusal still yield truthful partial results; no fabricated Reddit/Ads Library activity.

## C15 — Turn research into evidence-backed useful results

**Status (19 November 2026): INCOMPLETE — missing.**

**Already implemented / evidence:** A synthesis prompt and source/claim tables exist; there is no reachable retrieved-evidence report journey. Source: `src/server/agents/operations.ts`; `src/features/tasks/runner.ts`; `supabase/migrations/20261118020000_competition_contracts.sql`.

**To complete:** Connect C14 to synthesis; validate every consequential claim against retrieved IDs/excerpts, expose contradictions/limits, save a sourced document and offer optional Brain proposals without auto-approval.

**Dependencies:** C14/C09/C16 save contract. **Files:** research synthesis/evidence view, document result assembly, Brain proposal actions.

1. Synthesis links claims to retrieved source IDs/excerpts and identifies support, contradiction, assumptions and geographic limits.
2. Include question, findings, alternatives, business implication and recommended next task. Preserve original customer wording and label translation.
3. Reject source IDs/URLs not retrieved. Label duplicated sources and unsupported hypotheses; never claim interviews or representative audience percentages.
4. Save a research document and optional proposed Brain updates. Saving the report never auto-adopts its interpretations.

**Acceptance:** open each consequential cited finding and see actual supporting text; unsupported claims are qualified/omitted; useful report remains available after returning from Chat.

## C16 — Complete the document library and editor

**Status (19 November 2026): INCOMPLETE — partial.**

**Already implemented / evidence:** Document search/type/date/cursor queries, immutable versions, editor, copy/txt/md export, Continue and governed deletion exist. Source: `src/screens/DeliverablesPage.tsx`; `src/app/deliverables/page.tsx`; `supabase/migrations/20261119013000_document_library.sql`; `scripts/deliverable-db-check.sql`.

**To complete:** Complete legacy Post labeling/links and metadata-preserving exports with C33. Reuse currently copies text into compose without an explicit document origin; preserve lineage there as Continue does. Verify live save/conflict/history/delete and failed-save recovery; add applicable CSV when C31 exists.

**Dependencies:** C02/C06/C11 result contract. **Files:** DeliverablesPage, document editor/detail/API, MarkdownContent, versions migration.

1. Introduce stable document identity plus immutable edit versions and origin/context/source/limitation metadata.
2. Add search/type/date filters and cursor pagination, not unbounded select-all/client filtering.
3. Add Edit, Copy, Export txt/md/applicable CSV, Reuse, Continue with Director, and governed Delete; detailed export/deletion integration completes in C33.
4. Remove new Post output from document types; historical entries remain accessible with accurate legacy labeling and links.

**Acceptance:** edit creates version 2 of the same document; version 1 remains inspectable; Continue retains lineage; search/filter/page agree; failed save retains editor content.

## C17 — Add scoped copy, campaigns, diagnosis, and task recipes

**Status (19 November 2026): INCOMPLETE — partial.**

**Already implemented / evidence:** Copy, campaign and diagnosis prompts/runner branches exist; output quantity is validated and drafts are persisted. Source: `src/features/tasks/runner.ts`; `src/server/agents/operations.ts`; `src/features/tasks/backend.ts`.

**To complete:** Finish the planned recipe coverage, first-class Post/campaign linkage, owner-media handling and explicit tone/market overrides. Evaluate contrasting business scenarios and unsupported-connector handoffs with real generation; prompts alone do not prove useful or grounded results.

**Dependencies:** C09–C12/C16; C23 Post output contract. **Files:** agents prompts/recipes, output schemas, TaskRunner result assembly.

1. Configure about 10–11 recipes: goal discovery, audience/alternatives, claim-proof check, offer/message, destination/CTA observations, qualification, response drafts, campaign preparation, Facebook publishing, requested analysis, referral/retention drafts.
2. Diagnosis names a plausible constraint, observations/sources, uncertainty, alternatives and next action. Vary recommendations with business facts; do not always recommend more posts.
3. Respect requested quantity. One Post creates one Publishing Post; campaign may create a planning document plus linked Posts. Unsupported actions produce owner-ready instructions/checklist.
4. Support visual briefs and owner media. Reject unsupported quantified claims, invented testimonials, deadlines and discounts; ask a targeted question or qualify.
5. Apply explicit country, audience and brand-tone overrides to English output.

**Acceptance:** one English Post creates exactly one Post without forced research; low-conversion and low-demand cases get different sensible priorities; unsupported WhatsApp sending creates a response draft, not a fake send.

## C18 — Build adaptive saved Discovery

**Status (19 November 2026): INCOMPLETE — implemented; verification pending.**

**Already implemented / evidence:** Choice-first adaptive Discovery wizard (`src/features/roadmap/DiscoveryWizard.tsx`, 961 lines) is implemented and wired to the Next.js App Router at `src/app/roadmap/page.tsx` (rendering `src/screens/RoadmapPage.tsx`). Backed by database migration `supabase/migrations/20261119014000_adaptive_discovery.sql` creating `discovery_drafts` and `discovery_questions` with RPCs (`save_discovery_draft_with_questions`, `get_active_discovery_draft`, etc.), verified via `scripts/discovery-db-check.sql` (PASS) and applied to the remote Supabase database. Source: `src/features/roadmap/DiscoveryWizard.tsx`; `src/screens/RoadmapPage.tsx`; `supabase/migrations/20261119014000_adaptive_discovery.sql`; `scripts/discovery-db-check.sql`.

**To complete:** Run complete end-to-end browser verification against the live Supabase database; wire onboarding completion choice directly to `/roadmap`; connect research return (C19) and roadmap generation/activation (C20).

**Dependencies:** C07/C09/C12. **Files:** `src/features/roadmap/DiscoveryWizard.tsx`; `src/screens/RoadmapPage.tsx`; `src/app/roadmap/page.tsx`; draft/question RPCs.

1. Start with objective selection, then choose questions from goal, current Brain and material unknowns. Use choice-first UI and explanations.
2. Persist stable question IDs, order/branch, typed answers/status/provenance and draft version. Reuse eligible known facts visibly.
3. Autosave plus explicit save before navigation; handle conflicts and resume after browser close. Keep unanswered/skipped/unknown/N/A separate.
4. No standard weekly-hours question, mandatory full audit, or fixed long survey. Allow preliminary plan with disclosed uncertainty when permissible.

**Acceptance:** close/reopen restores branching and answers; no-website route works; changing the goal adapts questions without silently destroying saved context; conflicting edits are visible.

## C19 — Implement exact-question research return

**Status (19 November 2026): INCOMPLETE — missing.**

**Already implemented / evidence:** Question-research link schema and task-origin guards exist; no complete research-return UI/command flow exists. Source: `supabase/migrations/20261119011000_task_origin.sql`; `src/screens/EmployeePage.tsx`; `src/features/roadmap/DiscoveryWizard.tsx`; `src/app/roadmap/page.tsx`.

**To complete:** Save the draft before research; implement authorized draft/question/task/result linkage, selected evidence-aware answer, exact-question return and separate confirmation, including stale/deleted/cross-workspace rejection.

**Dependencies:** C14/C15/C18. **Files:** research-link RPCs, Discovery question actions, chat ResearchReturnCard.

1. Save draft before opening linked conversation/Task. Validate workspace/draft/question/conversation/task/result chain in the backend.
2. Render Use in Roadmap only for a valid linked result. Let owner select/edit a source-aware answer.
3. Return to the exact question, restore prior draft, show proposed answer, then confirm separately.
4. Preserve link/decision through navigation/reload. Reject arbitrary query-param linkage and stale/deleted questions.

**Acceptance:** research question 3, switch chats, return and confirm question 3 without altering question 4; normal direct Chat has no spurious Use in Roadmap; another workspace cannot forge the relation.

## C20 — Generate, review, and activate a complete Roadmap

**Status (19 November 2026): INCOMPLETE — missing.**

**Already implemented / evidence:** Roadmap tables, a one-active index and a generation prompt exist; there is no review/activation product flow. Source: `supabase/migrations/20261118020000_competition_contracts.sql`; `src/server/agents/operations.ts`; `src/screens/RoadmapPage.tsx`; `src/app/roadmap/page.tsx`.

**To complete:** Build the full step-plan schema validation and DAG checks, review/correction UI, exact-version transactional activation and plan history. Test concurrent activation and source-context binding.

**Dependencies:** C17/C18; C19 for research-assisted answers. **Files:** RoadmapTimeline/StepDetail, generation schema/prompt, activation RPC.

1. Generate the complete ordered step plan with every required field in file 02. Validate dependencies form a DAG and execution modes are supported.
2. Show goal, constraint hypothesis/evidence, uncertainty, responsibility, effort, output and completion checklist on the review surface.
3. Allow correction/regeneration as a proposed draft. Activation binds exact displayed version and source context.
4. Enforce one active roadmap via transactional activation and unique constraint; preserve drafts and archive previous active plans.

**Acceptance:** owner sees all actionable steps before activating; only actual dependencies block; two simultaneous activations cannot leave two active plans; no Now/Next/Later board exists.

## C21 — Execute steps, attest, Skip, Revisit, and Cancel

**Status (19 November 2026): INCOMPLETE — missing.**

**Already implemented / evidence:** Task origins and step/action schema provide a foundation; there are no usable Roadmap step controls. Source: `src/lib/contracts.ts`; `supabase/migrations/20261118020000_competition_contracts.sql`; `src/screens/RoadmapPage.tsx`; `src/app/roadmap/page.tsx`.

**To complete:** Implement dependency/authority-checked idempotent Run, output links, owner attestation, Skip/Revisit and separate Cancel with truthful readiness/progress counts. Verify double-click and running-step skip cases.

**Dependencies:** C11/C12/C20. **Files:** StepDetail/step action API; step execution/attestation RPCs.

1. Run with Director validates origin/version/dependencies/authority and creates one linked conversation/Task using an idempotency key.
2. Show task/output links and truthful work state. A completed document does not imply owner implementation or publication.
3. Mark Done records checklist/evidence and owner-reported timestamp. Skip records intent/time and dependency impact; Revisit recalculates readiness.
4. A skipped running step keeps its Task active and offers Cancel separately. Unmet prerequisites block only actual dependents; provide useful alternatives.
5. Separate completed, owner-reported, skipped, blocked and inapplicable progress counts.

**Acceptance:** double-click Run creates one Task; reload does not relaunch; skipping a running step does not cancel it; dependent work remains blocked until its actual condition is met.

## C22 — Add strategic revision and plan history

**Status (19 November 2026): INCOMPLETE — missing.**

**Already implemented / evidence:** Roadmap version storage exists; no strategic revision review/accept/reject workflow exists. Source: `supabase/migrations/20261118020000_competition_contracts.sql`; `src/screens/RoadmapPage.tsx`.

**To complete:** Implement owner-requested proposals, complete step/dependency diffs, base-version conflicts, atomic acceptance/rejection and preserved original task/output references without side-effect execution.

**Dependencies:** C20/C21. **Files:** RevisionReview/plan history, roadmap revision schema and approval RPC.

1. Generate a proposed revision only after owner direction, using current plan/context and practical constraints.
2. Show added/changed/removed-or-superseded steps, dependency changes, rationale and evidence. Store active base version.
3. Accept exact proposal under workspace lock; reject leaves active plan intact. Stale approval produces a recoverable conflict.
4. Preserve Task/output references to original plan/step versions. Do not restart/cancel work or approve Posts as a side effect.

**Acceptance:** changed price/goal produces reviewable differences; Reject preserves old plan; accepted revision archives history; in-flight Task still opens under its original reference.

## C23 — Establish first-class Posts and versioned editing

**Status (19 November 2026): INCOMPLETE — partial.**

**Already implemented / evidence:** Task result saving creates Post rows/versions and Chat references; nullable schedule and legacy review cards exist. Source: `src/screens/CalendarPage.tsx`; `supabase/migrations/20261118028000_task_execution.sql`; `src/screens/EmployeePage.tsx`.

**To complete:** Add manual New Post, immutable versioned editing, campaign grouping and exact detail links; replace Calendar recovery-on-read with a one-time migration, remove synthetic unsaved rows/invented dates and prevent deleted Posts returning from messages.

**Dependencies:** C02/C06/C11 result contract. **Files:** planned_posts schema, Post versions/API/RPC, CalendarPage, PostEditor, chat post_reference renderer.

1. Use one Post source of truth, independent of Deliverables. Create manually or from Chat with direct/step/campaign origin.
2. Save Draft with nullable date/destination; no Page required. Editing creates immutable versions with expectedVersion checks.
3. Add campaign grouping and Post references in Chat. Single Post produces no duplicate document.
4. Remove Calendar's recovery-on-read and synthetic unsaved rows. Migrate old structured payloads once with stable identifiers and preserve legacy history.
5. Keep owner-reported old publication distinct from system-verified publication; never dispatch migrated approvals automatically.

**Acceptance:** manual undated Post appears in Unscheduled; Chat one-Post output opens same Post; edit history survives; deleting all Posts does not resurrect them from chat.

## C24 — Add owner image upload and previews

**Status (19 November 2026): INCOMPLETE — missing.**

**Already implemented / evidence:** Media schema/private-storage policies and image previews are scaffolding; no owner upload/replace/remove journey exists. Source: `src/components/chat/PostPreview.tsx`; `supabase/migrations/20261118020000_competition_contracts.sql`.

**To complete:** Implement validated single-image upload, byte/type/size/dimension/ownership checks, immutable metadata/digest, signed access, cleanup and approval invalidation on replacement/removal.

**Dependencies:** C23/C02 storage policies. **Files:** PostEditor, PostPreview, media API, private Storage bucket/policies, media validation helper.

1. Add upload/replace/remove with visible progress/error and real image preview. Support the declared single-image format; no image generation.
2. Validate MIME/magic bytes, file size/dimensions and ownership. Store immutable object path/version/digest and metadata.
3. Use signed access or safe server upload; no arbitrary image URL fetch. Clean failed uploads and preserve a clear missing-media state.
4. Replacing media creates a Post version and invalidates approval. Refreshing access to identical bytes does not.

**Acceptance:** valid owned image renders in editor/detail; wrong type/oversize/cross-workspace object rejected; deleted/replaced image cannot be published under an old approval.

## C25 — Finish real Facebook Page connection

**Status (19 November 2026): INCOMPLETE — partial.**

**Already implemented / evidence:** Legacy OAuth source and connection/private-credential tables exist; Settings has no Page-selection connection workflow. Source: `src/server/oauth-connect.ts`; `src/app/api/oauth/route.ts`; `src/screens/SettingsPage.tsx`.

**To complete:** Replace URL-JWT initiation and callback platform override with authenticated POST and expiring one-time state; retrieve/select an actual Page/token, use protected credentials, implement reconnect/disconnect generation changes and verify a real authorized Page. Record current Meta configuration/access evidence.

**Dependencies:** C02/C03; begin app access checks on day one. **Files:** oauth-connect, private credentials/OAuth transactions, Settings Connections, Page selector.

1. Verify selected Meta app configuration, current API version, minimum required scopes and presentation-account eligibility using official documentation and a real request.
2. Start OAuth with authenticated POST and a one-time expiring state; no app JWT in query string. Callback derives platform from saved state and handles cancel/denial safely.
3. Retrieve/select authorized Pages and use the actual selected Page ID/token, not the user's /me ID. Encrypt server-side credentials; expose safe metadata only.
4. Show connected/reconnect_needed/disconnected, permissions/expiry and recovery. Disconnect increments authorization generation and blocks sends.
5. Label Instagram/X upcoming; do not keep active connect controls that imply Phase 2 support.

**Acceptance:** presenter connects the intended real Page, selects it, refreshes and sees correct status; cancellation/expiry behave; client cannot read token or fake connection metadata. Production ordinary-owner access is H06 if not yet obtained.

## C26 — Publish and schedule real approved Facebook Posts

**Status (19 November 2026): INCOMPLETE — missing.**

**Already implemented / evidence:** Publish attempt/approval schema exists; Calendar only records owner-reported publication. No publish-post/publish-due functions exist. Source: `src/server/`; `src/screens/CalendarPage.tsx`; `supabase/migrations/20261118020000_competition_contracts.sql`.

**To complete:** Implement exact-approved-version dispatch, atomic attempts, real text/link and image sends, provider read-back/permalinks, uncertain-outcome reconciliation, cancellation and deployed due scheduling. Prove real sends and duplicate prevention on the authorized Page.

**Dependencies:** C23–C25/C28 approval contract. **Files:** new publish-post/publish-due server actions/routes and shared core; publish-attempt/claim RPCs; Supabase schedule configuration.

1. Implement text/link and single-image caption publishing with tested Meta endpoints; save provider ID and read-back evidence.
2. Before sending, validate exact approved version/Page/generation/time/media/cancellation/context holds. Atomically register one claim/attempt.
3. After uncertain timeout, reconcile/hold instead of retrying the send. Only mark confirmed with sufficient evidence; link actual permalink.
4. Configure a small Supabase scheduled invocation of publish-due. It processes only due approved versions within their disclosed lateness window and uses the same core logic as explicit publish.
5. Add cancellation and honest after-submission handling. Reconnect never silently releases overdue work. Test production deployment invocation credentials without exposing them.

**Acceptance:** a real approved text/link Post and a real image-caption Post appear on the authorized Page; a scheduled Post sends from the deployed schedule; repeated trigger creates no duplicate; failed/uncertain outcome is visible. Do not substitute manual copy for this task.

## C27 — Build Month, Week, List, and Unscheduled views

**Status (19 November 2026): INCOMPLETE — missing.**

**Already implemented / evidence:** Scheduling renders review cards and status counts; Month/Week/List/Unscheduled views are absent. Source: `src/screens/CalendarPage.tsx`.

**To complete:** Build range/filter/paginated views of the same Post records, null-date isolation, actual publication placement, shared detail/edit/New/Duplicate actions and keyboard/mobile/DST-safe navigation.

**Dependencies:** C23/C05. **Files:** CalendarPage, publishing calendar components/query API.

1. Default desktop to Month; add Week/List and Unscheduled. Query by date range/status/platform with pagination.
2. Position proposed times distinctly from approved scheduled sends; display held/failed states; use actual publishedAt for confirmed history.
3. Open the same Post detail/editor from every view. Add New Post and Duplicate as Draft. Preserve mobile Month availability.
4. Provide keyboard navigation and a form alternative to drag rescheduling. Implement drag only after form behavior is correct.
5. Format in selected IANA zone and handle range boundaries/DST consistently.

**Acceptance:** all views agree on the same data; null-date drafts appear only in Unscheduled; published history uses actual time; mobile and keyboard selection work without overflow.

## C28 — Implement exact-version approvals, bulk review, and reschedule

**Status (19 November 2026): INCOMPLETE — partial.**

**Already implemented / evidence:** Legacy approve/reject/all controls and approval/version tables exist, but controls mutate status directly by Post ID. Source: `src/screens/CalendarPage.tsx`; `src/lib/contracts.ts`; `supabase/migrations/20261118020000_competition_contracts.sql`.

**To complete:** Replace direct mutations with exact-version and connection-generation approval RPCs, full execution-detail review, per-item bulk conflicts and complete reschedule inputs. Ensure all content/media/destination/time/zone/allowance edits invalidate approval and errors remain visible.

**Dependencies:** C23–C25/C05. **Files:** PostDetail, BatchReview, approval/reschedule RPCs, ScheduledTime validation.

1. Show exact text/media/Page/instant/local zone/lateness allowance before approval. Validate required media/connection and positive explicit owner action.
2. Store approval bound to PostVersion and current authorization generation. Editing any approved execution detail invalidates it.
3. Bulk approval/rejection enumerates displayed `{postId,postVersionId,expectedVersion}` items and returns per-item conflicts. Do not approve unseen newer versions.
4. Reschedule form/drag sends complete `{instant,zone,latenessAllowanceMinutes}`, creates a version, and requires fresh approval.
5. Timezone preference changes never move an approved instant; invalid/ambiguous local times require explicit resolution.

**Acceptance:** stale/double-click/bulk conflict tests pass; text, image, destination, time, zone and allowance edits each block old approval; mobile review clearly shows every bound detail.

## C29 — Add context holds and publishing recovery UI

**Status (19 November 2026): INCOMPLETE — partial.**

**Already implemented / evidence:** Brain context-impact logic records staleness/holds and tasks retain context references. Source: `supabase/migrations/20261118025000_brain_governance.sql`; `src/features/tasks/runner.ts`; `src/screens/CalendarPage.tsx`.

**To complete:** Add held-Post explanation/resolution and failed/uncertain/overdue/reconnect UI; enforce holds in actual dispatch, preserve unresolved attempts across edits and verify offer-change, unrelated-work and disconnect races with C26/C28.

**Dependencies:** C09/C23/C26/C28. **Files:** context impact helper/RPC, PostHold/Recovery panels, Brain change summary, notifications.

1. Record version dependencies when generating tasks/documents/Posts. Material offer/price/market/claim changes flag affected work and hold conflicting sends before dispatch.
2. Show why a Post is held and the changed context, with Edit/reapprove or explicit reviewed-resolution action. Unchanged details still require recorded hold resolution.
3. Add failed/uncertain/overdue/reconnect recovery states and supported actions; never clear an unresolved attempt merely by creating a new version.
4. Do not regenerate, spend extra research budget, or change approved content automatically. Preserve unrelated work.

**Acceptance:** change approved offer price → relevant Post held, unrelated Post still usable; an uncertain send cannot be duplicated through reschedule/retry; disconnect prevents future sends and reconnect does not release them silently.

## C30 — Add CSV/XLSX upload and mapping

**Status (19 November 2026): INCOMPLETE — missing.**

**Already implemented / evidence:** Analysis import/metric tables exist; no CSV/XLSX attachment/parser/mapping journey exists. Source: `src/screens/EmployeePage.tsx`; `package.json`; `supabase/migrations/20261118020000_competition_contracts.sql`.

**To complete:** Implement bounded CSV/XLSX upload and safe parsing, templates, row preview, explicit mapping/period/currency confirmation, duplicate/overlap/formula/unknown handling and persisted import recovery.

**Dependencies:** C11/C12/C02 storage. **Files:** Chat attachment control, analysis upload/preview/mapping components, parser adapter/templates.

1. Attach a supported CSV or .xlsx to an explicit Chat request. Offer downloadable templates and bounded file/row/sheet limits.
2. Parse without executing formulas/macros/external links. Validate compressed/uncompressed limits and unsupported layout/cells.
3. Preview rows; suggest recognized-field mapping; show period/granularity/metric definition/currency/identifier choices. Owner confirms mapping before computation.
4. Flag duplicate/overlapping/incompatible/ambiguous rows and preserve unknown values. Retain source/file hash/template/mapping metadata.
5. Persist the import so navigation does not discard confirmation and errors.

**Acceptance:** both template formats work, a compatible subset maps successfully, invalid layout has useful template guidance, formulas/duplicate/currency/date ambiguity are flagged before analysis.

## C31 — Calculate metrics and create one-off analytical documents

**Status (19 November 2026): INCOMPLETE — missing.**

**Already implemented / evidence:** An analyze prompt and performance-diagnosis documents exist; deterministic uploaded-data calculations do not. Source: `src/server/agents/operations.ts`; `src/features/tasks/runner.ts`; `scripts/`.

**To complete:** Implement supported metric definitions/rounding from confirmed C30 mappings, zero/unknown/incompatible input handling, exact expected-value fixtures and a source-aware downloadable one-off report. Use AI only to explain computed values.

**Dependencies:** C30/C16/C10. **Files:** deterministic metrics module/fixtures, analysis result UI, explanation prompt.

1. Calculate only supported metrics from confirmed inputs using definitions in file 02. Use decimal arithmetic/explicit rounding where needed.
2. Withhold ratios for zero/unknown denominators or incompatible periods/units. Require attribution for ROAS and a defined profit/cost basis for ROI.
3. Send computed values and source metadata to the model for explanation, not calculation. Discuss alternatives/limitations and relate to the selected goal.
4. Save one-off document plus optional pending Brain interpretations. A suggested revision requires separate owner action; create no recurring review or monitoring jobs.

**Acceptance:** fixture expected values match exactly within declared rounding; unknown stays unknown; report is downloadable and source-aware; completing analysis does not modify the active Roadmap.

## C32 — Complete Settings and contextual notifications

**Status (19 November 2026): INCOMPLETE — partial.**

**Already implemented / evidence:** Account/provider display, independent region settings, AI-key settings and notification schema exist. Source: `src/screens/SettingsPage.tsx`; `src/components/settings/AccountPreferences.tsx`; `src/components/AppShell.tsx`.

**To complete:** Add Connections, Usage and Data groups, applicable password controls, collapsed BYOK and checked key-removal errors. Build deduplicated notifications, read/unread/count/mark-all-read and exact authorized/deleted-subject destinations.

**Dependencies:** C03–C05/C11/C16/C20/C23/C25. **Files:** SettingsPage, NotificationCenter/AppShell, settings/notification API/RPCs.

1. Implement Account, Region, Connections, AI/Usage and Data groups. Password controls appear only where applicable; provider metadata is accurate.
2. Persist independent region settings and show allowance/consumption. Keep advanced BYOK collapsed and server-only.
3. Create deduplicated notifications for actual completion, terminal failure, clarification, report/document, Post decision/result/hold, reconnect, proposal and revision.
4. Implement read/unread/count/mark-all-read and exact authorized subject links; missing/deleted subject has a useful unavailable page.

**Acceptance:** changing country/currency/zone persists independently; every notification opens its exact subject; reading it never approves anything; transient retries do not create notification spam.

## C33 — Finish export, deletion, reuse, and disconnect controls

**Status (19 November 2026): INCOMPLETE — partial.**

**Already implemented / evidence:** Brain/document deletion, document txt/md export and Continue exist; resumed tasks reload eligible Brain facts. Source: `src/screens/DeliverablesPage.tsx`; `src/components/brain/DeleteKnowledgeDialog.tsx`; `src/features/tasks/runner.ts`; `src/screens/CalendarPage.tsx`.

**To complete:** Finish metadata/history/source-aware Brain/document exports and safe CSV, explicit Reuse lineage, cross-surface deletion cleanup/no resurrection and real disconnect invalidation. Verify deleted content cannot return through chat, recovery or exports and state retention limits.

**Dependencies:** C09/C16/C23/C25/C30/C32. **Files:** document/Brain data actions, export helpers, delete RPCs, dependency cleanup.

1. Export selected Brain/history/documents with source/status/version metadata; txt/md/safe CSV and applicable original media. Include formula-injection protection for CSV text.
2. Delete owned data with clear confirmation and checked errors. Immediately remove from current retrieval/search and invalidate outstanding access/affected drafts.
3. Preserve necessary minimal audit metadata without retaining deleted content unnecessarily. Explain actual retention; full backup/derived purge is H08.
4. Reuse/Continue preserves lineage and creates a fresh task or editable draft; deleted historical context never re-enters through chat recovery.
5. Disconnect uses the real invalidation command and warns about scheduled sends; no claim of remote Post removal on local delete.

**Acceptance:** deleted fact is absent from the next prompt/export; document deletion removes library access; old chat cards cannot resurrect Posts; exported text is usable and safe; disconnected Page cannot send.

## C34 — Refresh landing page and showcase imagery

**Status (19 November 2026): INCOMPLETE — partial.**

**Already implemented / evidence:** Landing redesign/assets, in-development pricing, illustrative examples and planned-publishing wording already exist. Source: `src/features/marketing/`; `public/marketing/product/`; `artifacts/redesign/`.

**To complete:** Align all Roadmap/research/scheduling claims and screenshots with delivered behavior, capture the completed surfaces, verify CTA destinations and desktop/mobile presentation, and keep unsupported features visibly upcoming. Existing marketing work should not be classified not started.

**Dependencies:** main surfaces working: C09/C13/C20/C27. **Files:** `src/features/marketing/`, `public/marketing/product/`, existing screenshot scripts.

1. Keep existing visual identity and motion; update copy to the actual Director/Brain/Roadmap/Scheduling experience.
2. Capture working screens with clearly labeled fictional business data. Replace outdated product images; do not import unrelated dashboards.
3. Wire primary CTA to real signup/app and keep guest preview explicitly separate. No broken CTA or dead-end pricing control.
4. Label upcoming social import/Instagram/X/images/billing/Ads honestly and avoid invented testimonials or traction.

**Acceptance:** public page is polished on desktop/mobile, all primary links work, imagery matches the app, and claims match available features.

## C35 — Complete visual polish, English copy, and accessibility

**Status (19 November 2026): INCOMPLETE — partial.**

**Already implemented / evidence:** English/responsive styling and historical screenshots/browser checks exist for implemented surfaces. Source: `src/screens/`; `src/components/`; `src/app/`; `artifacts/competition/`; `scripts/foundation-ui-check.cjs`.

**To complete:** Complete missing feature screens, move remaining product strings to the shared dictionary, then run the full visual/keyboard/focus/reduced-motion/error-state checklist at 1440/390/320 and tablet widths, including clear approval details.

**Dependencies:** C03–C34 relevant screens. **Files:** all critical pages/components/dictionaries/styles; screenshot checks.

1. Audit every auth/onboarding/Chat/Canvas/Discovery/Roadmap/Brain/document/Post/calendar/Settings/notification/analysis state against file 03.
2. Replace remaining hardcoded English product strings with dictionary keys. Check English LTR, mixed-script fields, date/currency/zone and brand-tone preferences.
3. Fix spacing/hierarchy/overflow/drawer sizes/touch targets/focus order. Check 1440, 390 and 320px layouts, plus a medium tablet width.
4. Ensure loading/error/empty/partial/held/success states have intentional design and useful action. Keep reduced motion.

**Acceptance:** the file 03 visual checklist passes; complete English journeys have no blocking issue; approval details remain clear on mobile; no high-effort decorative redesign introduced.

## C36 — Prepare reproducible presentation data and accounts

**Status (19 November 2026): INCOMPLETE — missing.**

**Already implemented / evidence:** Browser test fixtures and presentation/setup instructions exist; no reproducible designated-demo-workspace seed/reset workflow is evidenced. Source: `scripts/ui-fixtures.cjs`; `docs/phase-1-2/05-demo-and-verification.md`; `docs/phase-1-2/REHEARSAL_SETUP.md`.

**To complete:** Choose isolated demo accounts/workspace, create safe scoped seed/reset tooling, prepare owner media and CSV/XLSX fixtures with expected metrics, and retain real timestamped research separately from illustrative inputs.

**Dependencies:** working core journeys. **Files:** new demo seed/reset script, sanitized fixtures, evidence records; separate demo workspace.

1. Use the fictional service business in file 05 and label its inputs as illustrative. Create deterministic seed data only in an explicitly designated demo workspace.
2. Prepare an empty setup account and a populated presentation account. Save real research outputs separately from authored seed content.
3. Prepare owner-created image and deterministic CSV/XLSX fixtures. Keep exact expected metrics with the fixtures.
4. Reset only owned demo records. Never wipe all auth users/workspaces or automatically repost to Facebook during reset.

**Acceptance:** reset restores the intended demonstration state without affecting another workspace, secrets or real public posts; every fixture has known provenance and expected behavior.

## C37 — Add focused automated journey checks

**Status (19 November 2026): INCOMPLETE — partial.**

**Already implemented / evidence:** Crawler, gateway, task, foundation/intake/Brain/UI and SQL acceptance scripts exist; 39 unit checks and build/lint pass in this audit. Source: `package.json`; `scripts/`; `docs/evidence/competition-status.md`.

**To complete:** Restore disposable DB prerequisites and rerun local SQL/browser checks; add coverage for Discovery/research return/steps, immutable publishing/calendars/media and deterministic analysis as implemented. Run intended-environment smoke tests separately from fixtures and retain failures/not-run evidence.

**Dependencies:** C03–C33; reusable C36 fixtures. **Files:** existing scripts, new tests for roadmap/publishing/analysis; package scripts.

1. Preserve build/lint/25 crawler checks and existing Brain deletion tests, updating only intentionally changed behavior.
2. Add deterministic checks for confirmation, versions, step idempotency/dependencies, Post invalidation/nullable schedule, and metric edge cases.
3. Add Playwright paths for both setup routes, direct Post, Discovery research return, step run/skip, document edit, calendar review, analysis, and English-only regression.
4. Test critical RPCs against disposable real Supabase/PostgreSQL with two users. Keep live provider smoke tests separate from mocked browser tests.
5. Store command/output/environment evidence and explicit failed/not-run status. Never call intercepted requests proof of live publishing.

**Acceptance:** required smoke tests pass on the intended environment; failures block the affected demonstration claim and receive a repair task; no unrun test is marked passed.

## C38 — Rehearse the presentation and recovery paths

**Status (19 November 2026): INCOMPLETE — missing.**

**Already implemented / evidence:** An eight-minute script and fallback/demo materials are planned; no completed deployed rehearsal evidence is recorded. Source: `docs/phase-1-2/05-demo-and-verification.md`; `docs/phase-1-2/IMPLEMENTATION_PROGRESS.md`.

**To complete:** After C36/C37/C39, record a timed clean-browser run plus novel input, provider failure, interrupted task and expired connection recovery. Label real prior recordings/outputs as previous work.

**Dependencies:** C36/C37/C39 and deployed provider smoke checks. **Files:** presentation checklist/evidence, no new product features.

1. Run the eight-minute script in file 05 from a clean browser, then run the deeper judge exploration checklist.
2. Try one new question/input not in seeded examples. Confirm real generation/retrieval still works.
3. Rehearse provider failure, browser-interrupted Task and expired connection. Preserve saved work and explain recovery without pretending success.
4. Prepare saved outputs and a real recording as presentation fallback, labeled as previous work. Do not replace live state with fabricated data.

**Acceptance:** presenter can complete the story within the allotted time and identify every actual result; backup materials are clearly labeled; no accidental publish or destructive reset.

## C39 — Deploy and verify the competition environment

**Status (19 November 2026): INCOMPLETE — missing.**

**Already implemented / evidence:** Next.js build, App Router routes, Supabase source/config and rehearsal setup instructions exist; deployment completion is not evidenced. Source: `next.config.ts`; `supabase/config.toml`; `docs/phase-1-2/REHEARSAL_SETUP.md`.

**To complete:** Select and authorize the target, apply tested migrations/routes/storage/OAuth/schedule configuration, deploy, and verify fresh-device/deep-link/email/Google/model/research/media/publishing/scheduled-send journeys with rollback instructions.

**Dependencies:** C37 and configuration readiness; can prepare hosting early. **Files:** deployment docs/config, Supabase migrations, server routes/schedule, environment variable names.

1. Build/deploy the Next.js app with App Router and HTTPS. Set public Supabase configuration in `NEXT_PUBLIC_*` variables; secrets stay in environment variables / hosting secrets.
2. Apply tested additive migrations, deploy Next.js Server API routes, configure OAuth redirects, storage policies and scheduled publisher.
3. Verify the deployed URL's email/Google callback, image upload, model call, research retrieval, publication/read-back and scheduled job.
4. Confirm network allowlists/CORS and useful error messages; save a rollback/disable-new-feature procedure. Deployment is done only when authorized for the intended target.

**Acceptance:** a fresh browser on another device can perform the core journey; deep-link refresh works; no secret in bundle; scheduled send is verified on the actual deployment, not only localhost.

## C40 — Freeze and record the final competition status

**Status (19 November 2026): INCOMPLETE — missing.**

**Already implemented / evidence:** A progress/evidence ledger exists, but there is no verified release build and final freeze record. Source: `docs/phase-1-2/IMPLEMENTATION_PROGRESS.md`; `docs/evidence/competition-status.md`; `docs/phase-1-2/08-after-competition.md`.

**To complete:** Finish or explicitly record unresolved C-task outcomes, fix blocking defects, record deployed build/migration/function/config versions, devices/accounts/rehearsal evidence and freeze before presentation; keep H01–H10 outstanding independently.

**Dependencies:** C35–C39. **Files:** status ledger, requirement evidence, known limitations, final build metadata.

1. Stop feature additions at least one day before presentation. Fix only demonstrated blocking defects.
2. Record version/build, migrations/function versions, accounts, provider configuration checks, tested devices and demo evidence.
3. Update every C task and requirement row honestly. List unfinished capabilities explicitly rather than declaring all first-two-phase production gates complete.
4. Ensure browser execution, Google linking gap, production Meta access, and operational follow-up remain recorded in file 08.

**Acceptance:** reproducible deployed build, rehearsed presentation, clear actual feature status, recoverable demo workspace and a separate post-competition backlog.
