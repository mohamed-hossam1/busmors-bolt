# Busmora Invite-Only Beta & Heavy-Task Quota — Phase Gate Status Ledger

> **SUPERVISION PROTOCOL:**
> - **Kilo Code** executes ONLY the active phase marked below (`READY_TO_START` or `REJECTED`), updates its report under that Phase section, sets status to `READY_FOR_REVIEW`, and **STOPS**.
> - **Antigravity (Supervisor)** inspects `git diff`, reads every modified file, re-runs checks independently, and sets status to `APPROVED` (unlocking the next phase) or `REJECTED` (with exact defects to fix).
> - **NEVER** begin a phase whose prerequisite phase is not `APPROVED`.

---

## Phase Status Overview

| Phase | Scope | Status | Approved By |
| :--- | :--- | :--- | :--- |
| **Phase 1** | DB Migration (`promo_codes`, `workspace_access`, `heavy_task_runs`, RPCs) & Local DB Check | `APPROVED` | Antigravity |
| **Phase 2** | Shared `phone.ts`, `authFlags.ts`, `types.ts`, `proxy.ts` & `I18nContext.tsx` fixes + Unit Tests | `APPROVED` | Antigravity |
| **Phase 3** | Server Auth Gate, `/api/auth/promo`, `/api/auth/signup`, `SignUp`/`SignIn` UI, Google Hiding, Dictionaries | `APPROVED` | Antigravity |
| **Phase 4** | Heavy-Task Quota (`orchestrator.ts`, `roadmap/generate`), UI Counters & Unit Tests | `APPROVED` | Antigravity |
| **Phase 5** | CLI Promo/QR Generator (`scripts/promo-codes.ts`) & Playwright E2E Updates | `APPROVED` | Antigravity |

---

## Phase 1 Report (Kilo Code fills after completing Phase 1)

### Files Created / Modified
- `[NEW] supabase/migrations/20261126000000_promo_codes_and_heavy_quota.sql` — 3 RLS tables (`promo_codes`, `workspace_access`, `heavy_task_runs`), 8 `SECURITY DEFINER` RPCs, backfill.
- `[NEW] scripts/promo-quota-db-check.sql` — DB acceptance checks (now cases 1-10).
- `[MODIFY] scripts/local-migration-check.mjs` — appended `'promo-quota-db-check.sql'`.

### Rejection Fixes Applied (round 2)
1. **Phone enumeration in `reserve_promo_signup`:** promo lookup (`SELECT ... FOR UPDATE`) and all promo validity checks (`INVALID_PROMO_CODE`, `PROMO_REVOKED`, `PROMO_EXPIRED`, `PROMO_ALREADY_USED`) now run BEFORE the phone lookup. `pg_advisory_xact_lock` is kept immediately before the phone lookup, so an invalid/revoked code can no longer leak `PHONE_ALREADY_REGISTERED`.
2. **`settle_heavy_task` run guard + ceiling cap:** added `IF NOT FOUND THEN RAISE EXCEPTION 'HEAVY_TASK_RUN_NOT_FOUND'` after the run `SELECT ... FOR UPDATE` (no more silent `settled: true` on a missing run); the consume path now caps with `heavy_tasks_used = least(heavy_tasks_limit, heavy_tasks_used + 1)` so `used` can never exceed `limit` (covers settling an `expired` run).
3. **Acceptance edge cases added to `scripts/promo-quota-db-check.sql`:**
   - Case 7 — invalid/revoked/expired codes rejected by `check_promo_code` + `reserve_promo_signup`, including invalid/revoked code + already-registered phone returning `INVALID_PROMO_CODE`/`PROMO_REVOKED` (not `PHONE_ALREADY_REGISTERED`).
   - Case 8 — expired reservation (`reserved_until < now()`) reclaimed cleanly by the next caller (owner overwritten).
   - Case 9 — 5 consumed + 1 reserved => 7th reserve returns `QUOTA_EXHAUSTED` until the reserved slot is released, then succeeds.
   - Former cascade case renumbered to Case 10 (unchanged assertions).

### Sub-Agents Run & Parent Audit
- Edited directly by parent (no sub-agents this round); every changed line re-read and verified.

### Verification Outputs (Paste exact exit codes & summaries)
- Isolated `scripts/promo-quota-db-check.sql` (temp runner reusing `scripts/local-pg.mjs`, both modes): **PASS (exit 0)** — `PASS: empty promo-quota-db-check` + `PASS: upgrade promo-quota-db-check`; all cases 1-10 PASS in each mode.
- `npm run lint`: **PASS (exit 0)** — warnings only, no errors.
- `npm run typecheck`: **PASS (exit 0)** — `next typegen` + `tsc --noEmit` clean.
- `npm run test:db:local` (full): not re-run as the gate check; remains blocked by the PRE-EXISTING `scripts/post-proposed-time-db-check.sql` failure (`type "tasks" does not exist`), unrelated to Phase 1.

### Phase 1 Supervisor Verdict
- Status: `APPROVED`
- Notes: Verified directly by Antigravity: all 3 fixes applied cleanly (`reserve_promo_signup` validates promo before phone lookup; `settle_heavy_task` checks `NOT FOUND` and caps `used`; `promo-quota-db-check.sql` covers cases 1-10). Isolated DB check (`empty` and `upgrade`), `npm run lint` (0 errors), and `npm run typecheck` (exit 0) all verified passing. Phase 2 unlocked.

---

## Phase 2 Report (Kilo Code fills after completing Phase 2)

### Files Created / Modified
- `[NEW] src/lib/phone.ts` — `normalizePhone(raw)` returning `{ ok: true; normalized }` or `{ ok: false; errorCode: 'REQUIRED' | 'INVALID_PHONE' }`. Converts Arabic-Indic (`٠-٩`) and Eastern Arabic/Persian (`۰-۹`) digits to ASCII, strips spaces/`-`/`()`/`.`, and normalizes Egyptian local (`01[0125]\d{8}`), `201…`, `0020…`, `+20…` and general international E.164 (`^\+[1-9]\d{7,14}$`). `+20…` numbers are accepted only when they match `^\+201[0125]\d{8}$` (rejects `+200…` and malformed `+20…`).
- `[NEW] tests/unit/phone.test.ts` — 11 `node:test` cases (010/011/012/015, `+20`/`0020`/`201` equivalence, Arabic-Indic, Eastern Arabic/Persian, formatting chars, international `+971501234567`, empty→REQUIRED, short `010123`, bad prefix `01912345678`, letters, `+200…`/malformed `+20…`). 0 live API calls.
- `[NEW] src/lib/authFlags.ts` — `isGoogleAuthEnabled()` (`NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === 'true'`) and `isBetaInviteOnly()` (`BETA_INVITE_ONLY !== 'false'`).
- `[MODIFY] src/lib/types.ts` — added `HeavyTaskQuotaSummary` interface and optional `heavyTasks?: HeavyTaskQuotaSummary | null` on `WorkspaceSettings`; all other types untouched.
- `[MODIFY] src/proxy.ts` — line 29 OAuth `?code=` guard now also excludes auth routes: `if (segment !== 'auth' && !AUTH_ROUTES.test(withoutLocale(pathname)) && request.nextUrl.searchParams.has('code'))`, so `/signup?code=`/`?promo=` is no longer hijacked to `/auth/callback` while PKCE `?code=` on `/` still redirects.
- `[MODIFY] src/context/I18nContext.tsx` — `setLocale` now reads `window.location.search` and appends it to the localized path, preserving `?promo=…` across language switches.

### Sub-Agents Run & Parent Audit
- Sub-agent 2A (`src/lib/phone.ts` + `tests/unit/phone.test.ts`) and Sub-agent 2B (`authFlags.ts`, `types.ts`, `proxy.ts`, `I18nContext.tsx`) ran in parallel with strict, non-overlapping file ownership.
- Parent re-read all 6 files line-by-line after the sub-agents returned: phone logic hand-traced against every spec edge case (all correct), the three modified files differ from the originals only by the specified lines, no TODOs/placeholders/mock logic, no relaxed assertions, no out-of-scope edits.

### Verification Outputs
- `npm run typecheck`: **PASS (exit 0)** — `next typegen` → "Types generated successfully", `tsc --noEmit` clean (no errors).
- `npm run lint`: **PASS (exit 0)** — warnings only (pre-existing `react`/`react-hooks` notices, incl. the existing `I18nContext.tsx` `exhaustive-deps` note), 0 errors.
- `npm run test:unit`: **PASS (exit 0)** — `tests 228 / pass 228 / fail 0` (88 suites), including the 11 new `normalizePhone` cases.

### Phase 2 Supervisor Verdict
- Status: `REJECTED`
- Notes:
  1. **Real Routing Bug in `src/proxy.ts` line 29 (`withoutLocale` strips `/signup`!):** Line 29 runs *before* step 1 adds the locale prefix. `withoutLocale('/signup')` strips `^/[^/]+` and returns `'/'`, so `AUTH_ROUTES.test(withoutLocale('/signup'))` evaluates to **`false`**! As a result, `/signup?code=BUSM-123` (without `/ar` or `/en`) is STILL hijacked to `/auth/callback`. Fix: import `stripLocale` from `./lib/i18n` and use `!AUTH_ROUTES.test(stripLocale(pathname))` on line 29 (export a small pure helper `shouldRedirectOAuthCode(pathname, hasCode)` in `src/lib/authRouting.ts` or `src/proxy.ts` and unit-test `/signup?code=...`, `/ar/signup?code=...`, `/?code=...`, `/ar?code=...`!).
  2. **Mixed-letter Phone Bug in `src/lib/phone.ts`:** `clean()` silently discards letters, so `'01012345678abc'` is accepted as `'+201012345678'`. Reject any characters outside ASCII/Arabic digits, leading `+`, whitespace, `-`, `(`, `)`, `.` as `INVALID_PHONE`, and add a test case `'01012345678abc'` in `tests/unit/phone.test.ts`.

### Rejection Fixes Applied (round 3)
1. **OAuth `?code=` routing (`src/lib/authRouting.ts` + `src/proxy.ts`):** added a pure exported helper `shouldRedirectOAuthCode(pathname, hasCode)` in `src/lib/authRouting.ts` (alongside the pre-existing `safeReturnPath`/`authCallbackUrl`, which were preserved). It returns `false` when there is no code, when the first path segment is `auth` (the callback itself), or when `AUTH_ROUTES.test(stripLocale(pathname))` matches — using `stripLocale` from `./lib/i18n` so BOTH `/signup` and `/ar/signup` are recognised as auth routes. `src/proxy.ts` line 29 now calls `shouldRedirectOAuthCode(pathname, request.nextUrl.searchParams.has('code'))` instead of the buggy `withoutLocale`-based check. Result: `/signup?code=X` and `/ar/signup?code=X` are NOT redirected, while `/?code=X` and `/ar?code=X` ARE redirected to `/auth/callback`.
2. **Mixed-letter phone rejection (`src/lib/phone.ts`):** `clean()` now returns a `valid` flag and flags any character that is not an ASCII digit (post Arabic→ASCII conversion), a single leading `+`, or an allowed formatting char (whitespace, `-`, `(`, `)`, `.`). `normalizePhone` returns `INVALID_PHONE` when `!valid`, so `'01012345678abc'` is rejected.

### Sub-Agents Run & Parent Audit (round 3)
- Edited directly by parent (no sub-agents). Note: `src/lib/authRouting.ts` already existed with `safeReturnPath`/`authCallbackUrl` (imported by `auth/callback/route.ts`, `GoogleButton.tsx`, `SignIn.tsx`); the first write accidentally dropped them (caught by `tsc`), and they were restored verbatim with the new helper appended. All changed files re-read line-by-line.

### Verification Outputs (round 3)
- `npm run typecheck`: **PASS (exit 0)** — `next typegen` → "Types generated successfully", `tsc --noEmit` clean.
- `npm run lint`: **PASS (exit 0)** — warnings only (pre-existing `react`/`react-hooks` notices), 0 errors.
- `npm run test:unit`: **PASS (exit 0)** — `tests 235 / pass 235 / fail 0` (89 suites), including the new `shouldRedirectOAuthCode` suite (6 cases) and the new `normalizePhone('01012345678abc')` rejection case.

### Phase 2 Supervisor Verdict (round 3)
- Status: `APPROVED`
- Notes: Verified directly by Antigravity: `shouldRedirectOAuthCode` uses `stripLocale` in `src/lib/authRouting.ts` and `src/proxy.ts`; `src/lib/phone.ts` rejects mixed letters; `npm run test:unit` (235/235 pass), `npm run lint` (0 errors), and `npm run typecheck` (exit 0) all verified passing. Phase 3 unlocked.

---

## Phase 3 Report (Kilo Code fills after completing Phase 3)

### Files Created / Modified
- `[NEW] src/app/api/auth/promo/route.ts` — `GET` promo check: in-memory per-IP rate limit (30/60s, bounded Map), rejects empty/`>64`-char codes as `{ valid:false, reason:'invalid' }`, calls `createAdminClient().rpc('check_promo_code', { p_code })`, returns the RPC jsonb verbatim (zero PII), `429` on rate limit.
- `[NEW] src/app/api/auth/signup/route.ts` — `POST` two-phase atomic signup: in-memory per-IP rate limit (10/10min), Zod validation (`email`, `password` 8–128, `phone`, `promoCode`), `normalizePhone` (→`INVALID_PHONE`), `promoCode.trim().toUpperCase()` (empty→`INVALID_PROMO_CODE`), then `reserve_promo_signup` → `auth.admin.createUser({ email_confirm:true, user_metadata.phone_number })` → `finalize_promo_signup`, with full rollback (`release_promo_signup`, and `deleteUser`+`release` on finalize failure), then SSR cookie creation via `createServerSupabase().auth.signInWithPassword`, returning `201 { ok:true, redirectTo:'/onboarding' }`. Error codes: `INVALID_INPUT, INVALID_PHONE, INVALID_PROMO_CODE, PROMO_REVOKED, PROMO_EXPIRED, PROMO_ALREADY_USED, PHONE_ALREADY_REGISTERED, EMAIL_ALREADY_EXISTS, SIGNUP_FAILED, SESSION_FAILED, RATE_LIMITED`.
- `[MODIFY] src/server/auth.ts` — added `hasActivatedWorkspaceAccess(userId, email?)` (true when `!isBetaInviteOnly()`, true for `isAdminUser`, else checks `workspace_access` via admin client); enforced in `requireWorkspace` (redirect `/signin?error=invite_required`) and `requireApiIdentity` (`403 INVITE_REQUIRED`).
- `[MODIFY] src/app/auth/callback/route.ts` — when `isBetaInviteOnly() || !isGoogleAuthEnabled()`, an uninvited OAuth user is signed out, the unintended `auth.users` row is deleted if no `workspaces` row exists, and the user is redirected to `/signin?error=invite_required`.
- `[MODIFY] src/app/api/workspace/route.ts` — fetches `supabase.rpc('get_heavy_task_quota')` and includes `heavyTasks` (or `null`) alongside `managedModel`.
- `[MODIFY] src/components/auth/AuthLayout.tsx` — `AuthField` treats `type==='tel'` as LTR (`tel` default autoComplete) and adds optional `disabled`, `readOnly`, `helper`, `status`, `onBlur` (all optional; existing SignIn/Reset/NewPassword callers unaffected).
- `[MODIFY] src/screens/auth/SignUp.tsx` — Google hidden via `isGoogleAuthEnabled()` (GoogleButton import kept, file untouched); reads `?promo=`/`?code=` from URL (trimmed/uppercased), auto-validates via `GET /api/auth/promo` on mount (cancel-guarded) and on blur, editable promo field with colored status pill, phone field with `normalizePhone` client check, submits to `POST /api/auth/signup` mapping every error code to localized copy, then `await refreshSettings()` + `router.replace('/onboarding'); router.refresh()`.
- `[MODIFY] src/screens/auth/SignIn.tsx` — Google hidden via `isGoogleAuthEnabled()` (import kept); amber localized alert when `?error=invite_required`.
- `[MODIFY] src/app/[lang]/dictionaries/en.json` & `ar.json` — 20 new `app` keys added at identical positions (promo/phone/heavy-task copy); parity verified `ar 1152 / en 1152 / equal true`.

### Sub-Agents Run & Parent Audit
- Sub-agent 3A (`promo/route.ts`, `signup/route.ts`, `auth.ts`, `auth/callback/route.ts`, `workspace/route.ts`) and Sub-agent 3B (`AuthLayout.tsx`, `SignUp.tsx`, `SignIn.tsx`, `en.json`, `ar.json`) ran in parallel with strict, non-overlapping file ownership.
- Parent re-read all 10 files line-by-line after the sub-agents returned: confirmed `hasActivatedWorkspaceAccess` is `async` and awaited at both call sites; `requireApiIdentity` returns the `403` Response before `return identity`; callback gate sits before the recovery/bootstrap steps; signup rollback covers createUser and finalize failures; SSR sign-in sets cookies before `201`; `AuthField` new props are all optional and `tel` is LTR; GoogleButton.tsx untouched and only conditionally rendered; dictionaries at full key parity. No TODOs/placeholders/mock logic, no relaxed assertions, no out-of-scope edits. Confirmed `zod@4.6.7` is an existing dependency (no new dep added).

### Verification Outputs
- `npm run typecheck`: **PASS (exit 0)** — `next typegen` → "Types generated successfully", `tsc --noEmit` clean.
- `npm run lint`: **PASS (exit 0)** — warnings only (pre-existing `react`/`react-hooks` notices plus one new `react(set-state-in-effect)` warning at `SignUp.tsx:71` of the same class as many existing files), 0 errors.
- `npm run test:unit`: **PASS (exit 0)** — `tests 235 / pass 235 / fail 0` (89 suites).
- `npm run build`: **PASS (exit 0)** — Next.js 16.4.6 compiled successfully, TypeScript clean, 58/58 static pages generated; both `/api/auth/promo` and `/api/auth/signup` present in the route manifest.

### Phase 3 Supervisor Verdict
- Status: `REJECTED`
- Notes:
  1. **Infinite Redirect Loop for Un-activated Authenticated Users (`src/server/auth.ts` + `src/proxy.ts` + `src/app/[lang]/(auth)/signin/page.tsx`):** In `requireWorkspace()` (`src/server/auth.ts:27`), redirecting an un-activated logged-in user directly to `/signin?error=invite_required` without clearing their Supabase session cookie causes `proxy.ts:72` and `signin/page.tsx:9` (which both redirect any logged-in user back to `/employee`) to loop infinitely! Fix: create a Route Handler `src/app/auth/invite-required/route.ts` (automatically excluded by `proxy.ts` matcher `/auth/...`) that signs out via `createServerSupabase().auth.signOut()` and redirects to `localizePath('/signin?error=invite_required', await getRequestLocale())`, and point `requireWorkspace()`'s un-activated redirect to `/auth/invite-required`. Also in `src/proxy.ts:72`, skip the auth-route redirect when `request.nextUrl.searchParams.get('error') === 'invite_required'` as defense-in-depth.
  2. **Double Error Banner in `src/screens/auth/SignIn.tsx`:** Lines 42–43 render BOTH `t('signInError')` (`params.has('error')`) and `t('inviteRequiredError')` (`params.get('error') === 'invite_required'`) when `?error=invite_required` is set. Fix line 42 so `t('signInError')` renders only when `params.has('error') && params.get('error') !== 'invite_required'`.
  3. **Cleanups in `src/screens/auth/SignUp.tsx`:**
     - (a) Remove the redundant `setPromoStatus({ state: 'checking' })` on line 71 inside `useEffect` (since `useState` already initializes `'checking'` when `initialPromo` is present), eliminating the new `oxlint` `react(set-state-in-effect)` warning.
     - (b) Validate `!promoCode.trim()` client-side in `submit()` before hitting `/api/auth/signup` (show `t('promoCodeRequired')`).
     -      (c) Remove the misleading `await refreshSettings()` call on line 159 (which is a no-op while `AuthContext`'s `identity.current` is still null) and unused `useAuth` import; go straight to `router.replace('/onboarding'); router.refresh()`, and use `.json().catch(() => ({}))` safely when reading `/api/auth/signup` and `/api/auth/promo` responses.

### Rejection Fixes Applied (round 4)
1. **Infinite redirect loop for un-activated authenticated users:** added Route Handler `[NEW] src/app/auth/invite-required/route.ts` — `GET` signs out via `createServerSupabase().auth.signOut()` then redirects to `localizePath('/signin?error=invite_required', await getRequestLocale())` (the `/auth/...` segment is already excluded by the `proxy.ts` matcher). `src/server/auth.ts` `requireWorkspace()` now redirects un-activated users to `localizePath('/auth/invite-required', …)` instead of `/signin?error=invite_required`, so the session cookie is cleared before the signin page renders (no loop). Defense-in-depth: `src/proxy.ts` line 73 now skips the logged-in auth-route bounce when `request.nextUrl.searchParams.get('error') === 'invite_required'`.
2. **Double error banner in `src/screens/auth/SignIn.tsx`:** line 42 now renders `t('signInError')` only when `params.has('error') && params.get('error') !== 'invite_required'`, so `?error=invite_required` shows only the amber `inviteRequiredError` banner.
3. **Cleanups in `src/screens/auth/SignUp.tsx`:**
   - (a) Removed the redundant `setPromoStatus({ state: 'checking' })` inside the mount `useEffect` (state already initializes to `'checking'` when `initialPromo` is present), eliminating the `react(set-state-in-effect)` warning.
   - (b) `submit()` now validates `!promoCode.trim()` client-side (shows `t('promoCodeRequired')`) before calling `/api/auth/signup`.
   - (c) Removed the no-op `await refreshSettings()` and the unused `useAuth` import; success path goes straight to `router.replace('/onboarding'); router.refresh()`. Both `/api/auth/promo` reads and the `/api/auth/signup` read now use `.json().catch(() => ({}))`.

### Sub-Agents Run & Parent Audit (round 4)
- Edited directly by parent (no sub-agents). All 5 changed files re-read line-by-line: `requireWorkspace` redirect target updated and awaited; `proxy.ts` bounce guard added; new route handler mirrors the callback's signOut+redirect pattern; SignIn banner condition corrected; SignUp cleanups applied with no leftover `useAuth`/`refreshSettings` references.

### Verification Outputs (round 4)
- `npm run typecheck`: **PASS (exit 0)** — `next typegen` → "Types generated successfully", `tsc --noEmit` clean.
- `npm run lint`: **PASS (exit 0)** — warnings only (pre-existing `react`/`react-hooks` notices); the prior `SignUp.tsx` `set-state-in-effect` warning is gone, 0 errors.
- `npm run test:unit`: **PASS (exit 0)** — `tests 235 / pass 235 / fail 0` (89 suites).
- `npm run build`: **PASS (exit 0)** — Next.js 16.4.6 compiled successfully, TypeScript clean, 59/59 static pages generated; `/auth/invite-required` present in the route manifest alongside `/api/auth/promo` and `/api/auth/signup`.

### Phase 3 Supervisor Verdict (round 4)
- Status: `REJECTED`
- Notes: 404 route bug — `src/app/auth/invite-required/route.ts` lives outside `[lang]`, so `requireWorkspace()` must redirect to the un-prefixed `/auth/invite-required` (not `localizePath('/auth/invite-required', …)`).

### Rejection Fixes Applied (round 5)
1. **404 on the invite-required redirect (`src/server/auth.ts`):** `requireWorkspace()` line 27 now redirects un-activated users to the raw `redirect('/auth/invite-required')` instead of `redirect(localizePath('/auth/invite-required', await getRequestLocale()))`. The route handler is mounted at `src/app/auth/invite-required/route.ts` (outside `[lang]`), so a locale-prefixed path (`/ar/auth/invite-required`) would 404. The `/auth/...` segment is already excluded by the `proxy.ts` matcher, and the handler still signs out before redirecting to the localized `/signin?error=invite_required`, so no loop and no 404.

### Sub-Agents Run & Parent Audit (round 5)
- Edited directly by parent (no sub-agents). Single-line change in `src/server/auth.ts` re-read and verified; `localizePath`/`getRequestLocale` imports remain in use elsewhere in the file (lines 26, 38).

### Verification Outputs (round 5)
- `npm run typecheck`: **PASS (exit 0)** — `next typegen` → "Types generated successfully", `tsc --noEmit` clean.
- `npm run lint`: **PASS (exit 0)** — warnings only (pre-existing `react`/`react-hooks` notices), 0 errors.
- `npm run test:unit`: **PASS (exit 0)** — `tests 235 / pass 235 / fail 0` (89 suites).
- `npm run build`: **PASS (exit 0)** — Next.js 16.4.6 compiled successfully, TypeScript clean, 59/59 static pages generated; `/auth/invite-required` present in the route manifest (top-level, alongside `/auth/callback`), confirming the un-prefixed path resolves.

### Phase 3 Supervisor Verdict (round 5)
- Status: `APPROVED`
- Notes: Verified directly by Antigravity: `src/server/auth.ts:27` redirects to un-prefixed `/auth/invite-required`, `src/app/auth/invite-required/route.ts` signs out and redirects to localized `/signin?error=invite_required`, `typecheck`, `lint` (0 errors), `test:unit` (235/235 pass), and `build` (59/59 pages) all verified passing. Phase 4 unlocked.

---

## Phase 4 Report (Kilo Code fills after completing Phase 4)

### Files Created / Modified
- `[NEW] src/server/quota/heavy-tasks.ts` — pure `classifyDirectorOutcome(result)` (quotaExhausted→released_failed; any deliverable/draft/brainProposal→consume; completed+text+no-clarification→consume; clarification→released_clarification; else released_failed) + `HeavyTaskGate`/`HeavyTaskReservation`/types + `createSupabaseHeavyTaskGate(workspaceId)` (service_role). `getQuota()` reads `workspace_access` + counts active `reserved` `heavy_task_runs` directly (because `get_heavy_task_quota()` reads `auth.uid()` and is unusable via the admin client); `reserve`/`settle`/`release` call the service-role RPCs and generate `runId = crypto.randomUUID()`. `createAdminClient` is **lazy-imported** inside the factory so importing this module never pulls `server-only` into the orchestrator unit tests.
- `[MODIFY] src/server/employee/run-state.ts` — added `quotaExhausted?: boolean` (default `false`) and `heavyTasks?: HeavyTaskQuotaSummary` to `EmployeeRunState`; `directorFailed` untouched.
- `[MODIFY] src/server/employee/agents/director.ts` — added `quotaExhausted?: boolean` to `DirectorOutput` only (always undefined on a real run).
- `[MODIFY] src/server/employee/tools/orchestrator-tools.ts` — `summarizeDirectorResult` now returns exactly `{ status:'quota_exhausted', message:'QUOTA_EXHAUSTED: …' }` when `result.quotaExhausted === true` (so the internal English instruction never leaks into `structured.directorReply`); otherwise unchanged. `ORCHESTRATOR_TOOL_NAMES` and the 3-tool allowlist are untouched.
- `[MODIFY] src/server/employee/agents/orchestrator.ts` — `RunOrchestratorOptions` gains `heavyTaskGate?`/`heavyTasksRemaining?`; `buildOrchestratorSystemPrompt(heavyTasksRemaining?)` appends a 0-remaining runtime note; inside `runDirector`: reserves before the real Director run, returns a `quotaExhausted` stub (`text:''`, `quotaExhausted:true`, **not** `directorFailed`) when `!allowed`, settles/release by `classifyDirectorOutcome`, releases `released_failed`+rethrows on a thrown `runDirector`, and the merge `else-if` skips `directorFailed` when `quotaExhausted`. Gate-undefined path is the original logic byte-for-byte.
- `[MODIFY] src/server/employee/reply.ts` — `ensureNonEmptyReply` returns an honest AR/EN "all 6 beta advanced tasks used; general chat & Business Brain unlimited" message when `state.quotaExhausted` (placed after the `directorReply` early-return, before clarification).
- `[MODIFY] src/app/api/employee/chat/route.ts` — both non-stream and SSE paths build the gate, `getQuota()` before, pass `heavyTaskGate`+`heavyTasksRemaining`, `getQuota()` after, and add `heavyTasks`+`quotaExhausted` to the JSON/`done` payloads.
- `[MODIFY] src/app/api/roadmap/generate/route.ts` — reserves `roadmap_generate` after data loads (403 `HEAVY_TASK_QUOTA_EXHAUSTED` if not allowed); generation+`create_generated_roadmap` wrapped in try, `settle` only after the RPC succeeds, `release('released_failed')`+rethrow on any error; `heavyTasks: settled` in the 200. `/api/roadmap/ask-director` left untouched (free).
- `[NEW] tests/unit/heavy-task-quota.test.ts` — node:test, mirrors the director-handoff env/cache-bust pattern, **0 live API calls**. 8 `classifyDirectorOutcome` cases + 5 `runOrchestrator` scenarios (direct brain = 0 reserve; clarification = release('released_clarification'), remaining unchanged; deliverable = settle, remaining−1; director throw = release('released_failed')+directorFailed; remaining 0 = Director not run + quotaExhausted + direct brain still works).
- `[MODIFY] src/context/AuthContext.tsx` (4B) — exposes `heavyTasks` + `setHeavyTasks`; initialized from `initial?.settings?.heavyTasks`, updated by `refreshSettings()` and reset on identity change.
- `[MODIFY] src/components/AppShell.tsx` (4B) — compact quota pill (`{remaining}/{limit}` + unlimited hint, amber at 0) in both desktop sidebar and mobile drawer, only when `heavyTasks.activated`.
- `[MODIFY] src/screens/EmployeePage.tsx` (4B) — reads `heavyTasks`/`quotaExhausted` from JSON/SSE `done`, calls `setHeavyTasks`; quota pill in the chat header + amber exhausted banner above the messages (sending stays enabled).
- `[MODIFY] src/features/roadmap/api.ts` (4B) — `generateRoadmap` preserves `code`/`quota` on the thrown error (so `HEAVY_TASK_QUOTA_EXHAUSTED` survives).
- `[MODIFY] src/features/roadmap/DiscoveryWizard.tsx` (4B) — pulls `heavyTasks`+`refreshSettings`; `generateRoadmapNow` guards at 0, maps the quota code to localized copy, and calls `refreshSettings()` on success/403; Generate button disabled at `remaining === 0` with a localized notice; **Ask Director left active**.

### Sub-Agents Run & Parent Audit
- Sub-agent 4A (`heavy-tasks.ts`, `run-state.ts`, `director.ts`, `orchestrator-tools.ts`, `orchestrator.ts`, `reply.ts`, `chat/route.ts`, `roadmap/generate/route.ts`, `heavy-task-quota.test.ts`) and Sub-agent 4B (`AuthContext.tsx`, `AppShell.tsx`, `EmployeePage.tsx`, `roadmap/api.ts`, `DiscoveryWizard.tsx`) ran in parallel with strict, non-overlapping file ownership.
- Parent re-read all 14 changed files line-by-line: confirmed the 3-tool orchestrator allowlist is unchanged (`orchestrator-tools.test.ts` still passes); the quota-exhausted path sets `structured.quotaExhausted`+`DirectorOutput.quotaExhausted` and never `directorFailed`; `summarizeDirectorResult` returns the `quota_exhausted` status so internal English never reaches `structured.directorReply`; `ask-director` route untouched; `server-only` is not leaked (lazy `createAdminClient`); routes reserve→settle/release correctly and the legacy gate-undefined path is byte-identical. No TODOs/placeholders/mock logic, no relaxed assertions, no out-of-scope edits.
- **One parent fix during audit:** the test's `CLARIFICATION` fixture was missing the zod-`.default`-required `allowCustom`/`notSure` fields (TS2322 ×2); added them — typecheck then clean.

### Verification Outputs
- `npm run typecheck`: **PASS (exit 0)** — `next typegen` → "Types generated successfully", `tsc --noEmit` clean.
- `npm run lint`: **PASS (exit 0)** — warnings only (pre-existing `react`/`react-hooks`/`no-unused-vars` notices), 0 errors.
- `npm run test:unit`: **PASS (exit 0)** — `tests 248 / pass 248 / fail 0` (91 suites), including the 13 new heavy-task-quota cases.
- `npm run build`: **PASS (exit 0)** — Next.js compiled successfully, TypeScript clean, route manifest includes `/api/employee/chat`, `/api/roadmap/generate`, `/api/roadmap/ask-director`, `/api/workspace`.

### Phase 4 Supervisor Verdict
- Status: `REJECTED`
- Notes:
  1. **SSR Initial Load Bug (`heavyTasks` is `null` on page load):** `WorkspaceLayout` (`src/app/[lang]/(workspace)/layout.tsx`) passes `initial = await requireWorkspace()` to `<AuthProvider initial={initial}>`. Because `initial?.settings` is truthy, `AuthContext.tsx` sets `settingsReady.current = true` and skips calling `POST /api/workspace` on mount—yet `requireWorkspace()` (`src/server/auth.ts`) does NOT populate `settings.heavyTasks`! Result: `heavyTasks` stays `null` on initial load of `/employee` and `/roadmap` (sidebar badge missing, Generate button not disabled until clicked). Fix: inside `requireWorkspace()` (`src/server/auth.ts`), call `const { data: heavyTasks } = await identity.supabase.rpc('get_heavy_task_quota')` (or `null` fallback) and attach `heavyTasks: heavyTasks ?? null` to the returned `settings` object!
  2. **`RoadmapExecutionDashboard` Regenerate Button & Error Visibility (`src/features/roadmap/DiscoveryWizard.tsx` + `src/features/roadmap/RoadmapExecutionDashboard.tsx`):** When `generated` is truthy (`DiscoveryWizard.tsx:1196`), `RoadmapExecutionDashboard` renders instead of the wizard, so `generateError` and the disabled check on the wizard button are hidden! Add optional `regenerateDisabled?: boolean` and `regenerateNotice?: string | null` props to `RoadmapExecutionDashboard` so clicking/viewing Regenerate at `0` remaining disables the Regenerate button and renders the localized `roadmapQuotaExhausted` / `generateError` alert visibly. Also in `DiscoveryWizard.tsx`, when `generateRoadmap` returns `loaded.heavyTasks`, update `setHeavyTasks` immediately (or read `heavyTasks` from `RoadmapLoad` if present).
  3. **Remove Duplicated `runDirector` + `structured` Merge Block (`src/server/employee/agents/orchestrator.ts:375-455`):** Unify the `heavyTaskGate` branch and the non-gate branch so `runDirector(...)` and the `structured` merge block appear once (wrapping only `reserve` before and `settle`/`release` after).

### Rejection Fixes Applied (round 6)
1. **SSR initial load hydration (`src/server/auth.ts`):** `requireWorkspace()` now calls `const { data: heavyTasks } = await identity.supabase.rpc('get_heavy_task_quota')` after the onboarding gate and returns `settings: { ...workspaceSettings, heavyTasks: (heavyTasks as WorkspaceSettings['heavyTasks']) ?? null }`. Because `AuthProvider` seeds `heavyTasks` from `initial.settings.heavyTasks` and skips the mount `POST /api/workspace` when `initial.settings` is present, the sidebar quota pill and the Generate button's disabled state are now correct on the very first SSR render of `/employee` and `/roadmap` (no longer `null` until a client refresh).
2. **Regenerate button + error visibility on the generated dashboard (`src/features/roadmap/RoadmapExecutionDashboard.tsx` + `DiscoveryWizard.tsx` + `types.ts` + `api.ts`):**
   - `RoadmapExecutionDashboardProps` gains optional `regenerateDisabled?: boolean` (default `false`) and `regenerateNotice?: string | null` (default `null`). The Regenerate button is now `disabled={regenerating || regenerateDisabled}`, and `regenerateNotice` renders as a visible amber `role="status"` banner directly under the header (alongside the existing `error` banner).
   - `RoadmapLoad` gains optional `heavyTasks?: HeavyTaskQuotaSummary | null`; `generateRoadmap()` now surfaces `heavyTasks: data.heavyTasks ?? null` from the route's 200 payload.
   - `DiscoveryWizard` pulls `setHeavyTasks` from `useAuth()`, calls `setHeavyTasks(loaded.heavyTasks)` immediately when `generateRoadmap` returns a quota snapshot, and passes `regenerateDisabled={heavyTasks?.remaining === 0}` and `regenerateNotice={generateError || (heavyTasks?.remaining === 0 ? t('roadmapQuotaExhausted') : null)}` into the dashboard. So at `0` remaining the Regenerate button is disabled and the localized `roadmapQuotaExhausted` (or a real `generateError`) is shown on the generated view, not hidden behind the wizard.
3. **Deduplicated `runDirector` + merge (`src/server/employee/agents/orchestrator.ts`):** the `heavyTaskGate` and non-gate branches are unified into a single code path. `const gate = options.heavyTaskGate` + a single `let reservation: HeavyTaskReservation | undefined`; `reserve` runs only when a gate exists (quota-exhausted stub returns early before the Director runs); `runDirector(...)` and the `structured` merge block now appear exactly once; the `try/catch` refunds `released_failed` + rethrows on a thrown run, and `settle`/`release` run by `classifyDirectorOutcome` only when a reservation exists. The gate-undefined path (isolated unit tests) is behaviorally identical to the original (no reserve/settle/release), confirmed by the unchanged `orchestrator → director handoff` and `runOrchestrator heavy-task quota gate` suites still passing.

### Sub-Agents Run & Parent Audit (round 6)
- Edited directly by parent (no sub-agents). All changed files re-read line-by-line: `requireWorkspace` attaches `heavyTasks` without disturbing the session/onboarding logic; the dashboard's new props are optional with safe defaults and the notice renders under the header; `generateRoadmap`/`RoadmapLoad` carry `heavyTasks` additively; `DiscoveryWizard` updates `setHeavyTasks` immediately and forwards both new props; the orchestrator's `runDirector`/merge is a single block with the legacy path preserved. No TODOs/placeholders/mock logic, no relaxed assertions, no out-of-scope edits.

### Phase 4 Supervisor Verdict (round 6)
- Status: `APPROVED`
- Notes: Verified directly by Antigravity: `src/server/auth.ts` hydrates `heavyTasks` on SSR; `RoadmapExecutionDashboard.tsx` + `DiscoveryWizard.tsx` disable Regenerate and show quota notice at 0 remaining; `orchestrator.ts` uses one clean `runDirector` + merge block; `typecheck`, `lint` (0 errors), `test:unit` (248/248 pass), and `build` (59/59 pages) all verified passing. Phase 5 unlocked.

---

## Phase 5 Report (Kilo Code fills after completing Phase 5)

### Files Created / Modified
- `[MODIFY] package.json` — added `"promo": "tsx scripts/promo-codes.ts"` script; added `qrcode@^1.5.4` (dependencies) and `@types/qrcode@^1.5.6` (devDependencies) via `npm.cmd install --no-audit --no-fund` (qrcode: +29 pkgs, @types/qrcode: +1 pkg; `package-lock.json` updated by npm).
- `[NEW] scripts/promo-codes.ts` — standalone ESM CLI (no `server-only`, imports `createClient` directly from `@supabase/supabase-js`). Auto-loads `.env` via `process.loadEnvFile` when available with a safe manual-parser fallback. `--help`/`-h` (and no subcommand) prints usage and exits 0 BEFORE any env/DB access. Subcommands: `generate` (`--count`10/`--prefix`BUSM/`--limit`6/`--base-url`/`--locale`ar/`--batch`/`--expires-days`/`--out` → unambiguous `PREFIX-XXXX-XXXX` codes from alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, inserts into `promo_codes`, writes per-code `<CODE>.png` via `QRCode.toFile`, `codes.csv`, and a self-contained print-friendly `cards.html` embedding each QR as a base64 data URL; URLs `${baseUrl}/${locale}/signup?promo=${code}`), `list` (`--status`/`--batch`, aligned text table incl. redeemed_email/phone + limit), `revoke` (`--code`, active→revoked only), `grant` (`--email` via `promo_codes.redeemed_email→redeemed_by_workspace_id` or `--phone` via `workspace_access.phone_number`, `--extra` added to `heavy_tasks_limit`). Errors print redacted messages and exit 1.
- `[MODIFY] e2e/support/accounts.ts` — added `newPhone()` (unique `+2010XXXXXXXX` Egyptian mobile via module counter) and `createPromoCode(label, limit=6)` (uppercase A–Z0–9 code ≤64 seeded via `runSql`). Rewrote `createAccount` to provision invite-only accounts: seed promo → `reserve_promo_signup` → `auth.admin.createUser({ email_confirm:true, user_metadata.phone_number })` → `finalize_promo_signup`, with full rollback (`release_promo_signup`, and `deleteUser`+`release` on finalize failure), then `signInClient` for a session client (no more `auth.signUp`/`bootstrap_workspace`). Added a `serviceClient()` helper (requires service role key). `signInClient`/`anonymousClient`/`newCredentials`/`confirmManualBusiness` unchanged.
- `[MODIFY] e2e/support/browser.ts` — `registerThroughUi(page, { email, password, phone, promoCode, viaQrUrl? })`: when `viaQrUrl`, navigates `/signup?promo=CODE` and asserts the promo field auto-fills, then fills Email/Phone/Password/Promo and submits; waits for `/onboarding`.
- `[MODIFY] e2e/specs/01-auth-database.spec.ts` — first test now seeds phone+promo and registers via QR URL; added a new test verifying QR auto-fill, phone+promo registration, persisted `workspace_access` (`limit 6`, `used 0`), promo `redeemed`, and single workspace_access row per phone (reuse rejection at DB layer). Other two tests unchanged (work with the new `createAccount`).

### Sub-Agents Run & Parent Audit
- Sub-agent 5A (`package.json`, `scripts/promo-codes.ts`) and Sub-agent 5B (`e2e/support/accounts.ts`, `e2e/support/browser.ts`, `e2e/specs/01-auth-database.spec.ts`) ran in parallel with strict, disjoint file ownership (5A did not touch `e2e/`; 5B did not touch `package.json`/`scripts/`).
- Parent re-read all 5 changed files line-by-line from disk: `promo-codes.ts` has no `server-only` import, `--help` returns before `loadEnv`/`createAdmin` (verified exit 0 with no DB use), generate writes PNG+CSV+self-contained `cards.html` with `?promo=` URLs, all four subcommands implemented; `accounts.ts` createAccount uses reserve→createUser→finalize with rollback on both failure paths and provisions unique phones + one-time codes; `browser.ts` auto-fill assertion precedes fill; spec compiles against real RPC/schema and asserts DB state. No TODOs/placeholders/mock logic, no relaxed assertions, no out-of-scope edits. `qrcode`/`@types/qrcode` confirmed in package.json.

### Verification Outputs
- `npm run typecheck`: **PASS (exit 0)** — `next typegen` → "Types generated successfully", `tsc --noEmit` clean.
- `npm run lint`: **PASS (exit 0)** — warnings only (pre-existing `react`/`react-hooks`/`no-unused-vars` notices), 0 errors.
- `npm run test:unit`: **PASS (exit 0)** — `tests 248 / pass 248 / fail 0` (91 suites).
- `npm run test:db:local`: not the gate here; the isolated `scripts/promo-quota-db-check.sql` runner (reusing `scripts/local-pg.mjs`, both modes) returned **PASS (exit 0)** — `PASS: empty promo-quota-db-check` + `PASS: upgrade promo-quota-db-check` (all cases 1-10). (Full `test:db:local` remains blocked by the PRE-EXISTING `scripts/post-proposed-time-db-check.sql` failure, unrelated to Phase 5.)
- `npm run build`: **PASS (exit 0)** — Next.js compiled successfully, TypeScript clean, route manifest includes `/api/auth/promo`, `/api/auth/signup`, `/auth/invite-required`, `/api/employee/chat`, `/api/roadmap/generate`.
- `npm run promo -- --help`: **PASS (exit 0)** — printed full usage with no DB env required.
- `npm run test:e2e`: **SKIPPED (no safe local E2E environment).** The configured `NEXT_PUBLIC_SUPABASE_URL` is a REMOTE hosted project (`ojlgnqdhykgzgkbqyatd.supabase.co`); `e2e/support/env.ts:assertSafeEnvironment()` refuses remote hosts unless `E2E_ALLOW_REMOTE=1` (not set), and running would build+start a server, mutate a REAL remote database (create/delete accounts), and make live AI/crawl calls — not a safe local E2E run. Requirement to run: a disposable LOCAL Supabase (`E2E_SUPABASE_URL`/`E2E_SUPABASE_ANON_KEY`/`E2E_SUPABASE_SECRET_KEY` + `E2E_DATABASE_URL`) with email confirmation disabled and `E2E_AI_API_KEY`/`AI_API_KEY` set; the updated specs are typechecked (tsc) and lint-clean and exercise the QR/phone/promo/quota flow.

### Rejection Fixes Applied (round 7)
1. **`e2e/support/browser.ts` (promo/phone locators + genuine QR auto-fill):**
   - Added exported label regexes `PROMO_LABEL = /invite code|كود الدعوة/i`, `PHONE_LABEL = /phone|رقم الهاتف/i`, and `GOOGLE_BUTTON_LABEL = /continue with google|كمّل بحساب google/i` (matching `en.json` `auth.promoCode` = "Invite code" / `ar.json` = "كود الدعوة", and `auth.phoneNumber` = "Phone number" / "رقم الهاتف").
   - `registerThroughUi` now uses `PROMO_LABEL`/`PHONE_LABEL`. When `viaQrUrl` is true it only asserts `toHaveValue(promoCode)` (auto-fill genuinely exercised) and does NOT re-fill the promo input; the promo field is filled only in the `else` (manual) branch.
2. **`e2e/specs/01-auth-database.spec.ts` (Google hidden + real reuse rejection):**
   - Added a local `expectSignupRejected(page, opts)` helper (goto `/signup?promo=…`, assert auto-fill, fill Email/Phone/Password, submit, assert a `role="alert"` is visible and the URL stays on `/signup`).
   - The QR test now: (a) asserts the Google button (`GOOGLE_BUTTON_LABEL`) has `toHaveCount(0)` on both `/signin` and `/signup`; (b) in a fresh unauthenticated `browser.newContext({ baseURL })`, reuses the already-redeemed `promoCode` with a new email + new phone and asserts rejection (alert visible, URL stays `/signup`, `auth.users` count for the new email = 0, promo still `redeemed` with `redeemed_by_workspace_id` unchanged); (c) in another fresh context, uses a fresh `createPromoCode(...)` with the SAME phone and asserts rejection (alert visible, URL stays `/signup`, `workspace_access` count for the phone stays `1`, the fresh promo remains `active`). Contexts are closed in `finally`.
3. **`scripts/promo-codes.ts`:**
   - `cmdGrant` now normalizes `--phone` via `normalizePhone` from `../src/lib/phone` (fails cleanly on invalid input so local `01012345678` matches stored `+201012345678`) and sets `updated_at: new Date().toISOString()` on the `workspace_access` update.
   - `cmdList` now also selects `redeemed_by_workspace_id`, queries `workspace_access` for `heavy_tasks_used` + `heavy_tasks_limit` of the redeemed workspaces, and prints a `used/limit` column (e.g. `0/6`) instead of only the limit.
   - `loadEnv()` now strips unquoted inline `# ...` comments (`value.replace(/(?:^|\s+)#.*$/, '').trimEnd()`) so manual `.env` parsing matches `process.loadEnvFile` (quoted values preserved verbatim).

### Sub-Agents Run & Parent Audit (round 7)
- Edited directly by parent (no sub-agents). All 3 changed files re-read line-by-line: `browser.ts` exports the three label regexes and only asserts (never re-fills) the promo field under `viaQrUrl`; the spec adds the rejection helper + Google-hidden assertions + two unauthenticated reuse contexts (closed in `finally`) with DB-level assertions; `promo-codes.ts` normalizes `--phone`, writes `updated_at`, surfaces `used/limit` in `list`, and strips inline `.env` comments. Verified exact dictionary labels (`promoCode`, `phoneNumber`, `google`, `signUp` = "Create account") and `playwright.config.ts` (`baseURL` from `loadE2EEnv`, `browser` fixture available). No TODOs/placeholders/mock logic, no relaxed assertions, no out-of-scope edits. `test:e2e` was NOT run against remote Supabase.

### Verification Outputs (round 7)
- `npm.cmd run typecheck`: **PASS (exit 0)** — `next typegen` → "Types generated successfully", `tsc --noEmit` clean.
- `npm.cmd run lint`: **PASS (exit 0)** — warnings only (pre-existing `react`/`react-hooks`/`no-unused-vars`/`only-export-components` notices), 0 errors.
- `npm.cmd run test:unit`: **PASS (exit 0)** — `tests 248 / pass 248 / fail 0` (91 suites).
- `npm.cmd run build`: **PASS (exit 0)** — Next.js 16.4.6 compiled successfully, TypeScript clean, 59/59 static pages generated; route manifest includes `/api/auth/promo`, `/api/auth/signup`, `/auth/invite-required`, `/api/employee/chat`, `/api/roadmap/generate`.
- `npm.cmd run promo -- --help`: **PASS (exit 0)** — printed full usage with no DB env required (confirms the `../src/lib/phone` import resolves and `--help` returns before any DB access).
- `npm.cmd run test:e2e`: **NOT RUN** — per instruction, not executed against the configured remote Supabase. The updated specs are typechecked (tsc) and lint-clean.

### Phase 5 Supervisor Verdict
- Status: `APPROVED`
- Notes: Verified all 3 round-7 fixes in `e2e/support/browser.ts`, `e2e/specs/01-auth-database.spec.ts`, and `scripts/promo-codes.ts`. Direct Antigravity verification after final edit: isolated `scripts/promo-quota-db-check.sql` (`empty` + `upgrade` -> PASS), `npm.cmd run typecheck` (exit 0), `npm.cmd run lint` (0 errors, exit 0), `npm.cmd run test:unit` (248/248 across 91 suites, exit 0), `npm.cmd run build` (59/59 static pages, exit 0), and `npm.cmd run promo -- --help` (exit 0). Note: `npm run test:e2e` was intentionally NOT run because `.env` targets the remote Supabase project (`assertSafeEnvironment()` safety guard), and full `npm run test:db:local` hits the pre-existing `scripts/post-proposed-time-db-check.sql` failure unrelated to this feature.
