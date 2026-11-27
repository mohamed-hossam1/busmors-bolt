# Busmora Admin Promo Control Center — Executor Plan

> **WHO THIS DOCUMENT IS FOR:**
> This is an **Executor Blueprint** for Kilo Code (and its sub-agents) to replace the server/CLI promo script (`scripts/promo-codes.ts`) with a full-featured, secure **Admin Promo Control Center** UI under `/{lang}/admin/promos`.
> You are supervised by **Antigravity** (and the repo owner), who audits every modified file, re-runs all checks, and verifies the live UI flow in a real browser.

---

## 0. Mandatory Execution & Anti-Skip Rules (READ FIRST)

1. **STRICT PHASE-BY-PHASE LOCK (HARD STOP):**
   - Execute **ONLY** the single Phase assigned in your current prompt, and verify in `docs/plans/admin-promo-ui-status.md` that the prerequisite Phase is `APPROVED` (except Phase 1).
   - **NEVER** start Phase `N+1` on your own. After completing Phase `N`, update `docs/plans/admin-promo-ui-status.md` to `READY_FOR_REVIEW`, record exact verification outputs, and **STOP IMMEDIATELY**.

2. **SUB-AGENT DELEGATION PROTOCOL (`new_task` / Sub-agents):**
   - Each Phase lists disjoint sub-tasks (`Sub-agent A`, `Sub-agent B`) with strict non-overlapping file ownership.
   - Give each sub-agent its exact sub-task section, allowed file list, and these rules.
   - **Parent Audit Obligation:** Read every file modified/created by sub-agents line-by-line, fix any mismatches, and run the full Phase Verification Gate yourself before setting `READY_FOR_REVIEW`.

3. **ZERO-SHORTCUT & ANTI-HALLUCINATION RULES:**
   - **NEVER** leave `// TODO`, placeholder handlers, fake data, or skipped test assertions.
   - **NEVER** import `'server-only'` modules into client components (`src/features/admin/*.tsx`) or pure `src/lib/*.ts` helpers.
   - **NEVER** put `node:crypto` or `fs` imports in `src/lib/promo.ts` (it MUST remain browser-safe for client preview/CSV helpers). Server random code generation belongs in `src/server/admin/promos.ts` (using `node:crypto`'s `randomInt`).
   - **NEVER** run live AI tests (`tests/live/*`). All unit tests MUST use deterministic mocks (`0` live AI calls).
   - **NEVER** hardcode credentials or admin emails/passwords in code/plans. Always resolve operator identity via `ADMIN_USER_ID` / `ADMIN_EMAIL` through `@/server/admin/auth` and `@/server/admin/admin-identity`.
   - **NEVER** claim a command passed unless you ran it *after your final edit* and observed exit code `0`.

4. **CRITICAL REPO CONSTRAINTS (Observed in Codebase):**
   - **Existing Admin Auth (`src/server/admin/auth.ts`, `src/server/admin/admin-identity.ts`):**
     - `isAdminUser(user, env)` checks `ADMIN_USER_ID` CSV **OR** `ADMIN_EMAIL` CSV (lowercased) from `process.env`.
     - *(Note discovered during planning: in DB `auth.users`, `admin@busmora.com` has a valid confirmed account and matches via `ADMIN_EMAIL`, even if `ADMIN_USER_ID` differs locally; keep relying on `isAdminUser()`/`requireAdminIdentity()` without changing allow-list semantics.)*
   - **Existing DB Schema (`supabase/migrations/20261126000000_promo_codes_and_heavy_quota.sql`):**
     - Migration is ALREADY applied to remote & local DBs. **DO NOT** create a new migration unless strictly required (none is needed for this feature!).
     - `public.promo_codes` columns: `id`, `code`, `status` (`'active'|'reserved'|'redeemed'|'revoked'`), `heavy_tasks_limit`, `batch_label`, `note`, `expires_at`, `reservation_token`, `reserved_until`, `reserved_phone`, `redeemed_by_workspace_id`, `redeemed_phone`, `redeemed_email`, `redeemed_at`, `created_at`.
     - `public.workspace_access` columns: `workspace_id`, `promo_code_id`, `phone_number`, `heavy_tasks_limit`, `heavy_tasks_used`, `activated_at`, `updated_at`.
   - **i18n Type Safety (`src/lib/i18n.ts`):**
     - `AppKey = keyof Dictionary['app']` comes from `src/app/[lang]/dictionaries/en.json`. Both `en.json` and `ar.json` MUST stay 100% key-synchronized.
   - **Existing Design Tokens (`src/index.css` & `src/features/admin/TraceExplorer.tsx`):**
     - Reuse `.card`, `.stat-card`, `.input-field`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.badge`, `.sleek-scrollbar`, `.modal-panel`, `bg-ink-50`, `text-ink-900`, `primary-*`, and RTL-safe spacing (`ms-`, `me-`, `ps-`, `pe-`, `text-start`).
   - **Windows PowerShell Commands:** Always execute `npm.cmd run ...` (`typecheck`, `lint`, `test:unit`, `build`).

---

## Architecture Summary

```text
Admin Sign In (/signin as admin@busmora.com)
  ├── proxy.ts & SignIn.tsx detect isAdminUser / GET /api/admin/me
  └── Land directly on /{lang}/admin/promos

/{lang}/admin/layout.tsx
  ├── AdminNav bar (Promo Codes | Trace Explorer | Locale Switcher | Sign Out) [hidden on @media print]
  ├── /{lang}/admin        -> redirects to /{lang}/admin/promos
  ├── /{lang}/admin/promos -> PromoManager + PromoQrModal
  └── /{lang}/admin/traces -> Existing TraceExplorer & TraceInspector

/api/admin/promos (requireAdminIdentity + assertSameOrigin on mutations + createAdminClient)
  ├── GET  /api/admin/promos              -> list/filter codes + workspace_access usage + summary stats + batches
  ├── POST /api/admin/promos              -> auto-generate batch (1..100) OR create single custom code
  ├── POST /api/admin/promos/[code]/revoke-> revoke active code atomically
  ├── POST /api/admin/promos/grant        -> add +extra heavy tasks to workspace_access (with optimistic guard)
  └── GET  /api/admin/me                  -> returns { isAdmin: true, email } for post-login routing

Removed CLI tooling:
  - Delete scripts/promo-codes.ts
  - Remove "promo" script from package.json (keep qrcode & @types/qrcode for UI QR rendering)
```

---

## Phase 1: Domain Helpers, Admin Auth Hardening, Admin Promo APIs & CLI Removal

### Sub-agent 1A — Pure Promo Helpers, Admin Auth Hardening & CLI Removal
- **Allowed Files (strict):**
  - `[NEW] src/lib/promo.ts`
  - `[MODIFY] src/server/admin/auth.ts`
  - `[MODIFY] src/lib/authRouting.ts`
  - `[DELETE] scripts/promo-codes.ts`
  - `[MODIFY] package.json`
  - `[NEW] tests/unit/admin-promos.test.ts` (initial unit tests for `promo.ts`, `authRouting.ts`, `assertSameOrigin`)
- **Specifications:**
  1. **`src/lib/promo.ts`** (zero Node-only or `'server-only'` imports):
     - Export `PROMO_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'`.
     - Export `PROMO_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{3,63}$/` (4..64 chars, matches DB constraint `code = upper(btrim(code)) AND length(code) BETWEEN 4 AND 64`).
     - Export `PROMO_PREFIX_RE = /^[A-Z0-9][A-Z0-9_-]{0,19}$/` (1..20 chars so `PREFIX-XXXX-XXXX` always stays `<= 30 <= 64`).
     - Export `normalizePromoCodeInput(value: string): string` (`value.trim().toUpperCase()`).
     - Export `normalizePromoPrefix(value: string): string` (`value.trim().toUpperCase()`).
     - Export `isValidPromoCode(code: string): boolean`.
     - Export `formatRandomPromoCode(prefix: string, nextInt: (max: number) => number): string` returning `${prefix}-${seg1}-${seg2}` (`4` chars per segment from `PROMO_ALPHABET`).
     - Export `buildSignupUrl(origin: string, locale: 'ar' | 'en', code: string): string` (`${origin.replace(/\/+$/, '')}/${locale}/signup?promo=${encodeURIComponent(code)}`).
     - Export `csvCell(value: string): string` and `buildPromosCsv(rows: Array<{ code: string; status: string; signupUrl: string; heavyTasksLimit: number; heavyTasksUsed: number; redeemedEmail: string | null; phoneNumber: string | null; batchLabel: string | null; note: string | null; expiresAt: string | null; createdAt: string }>): string` (with safe CSV formula-neutralization or RFC 4180 quoting; sanitize leading `=`, `+`, `-`, `@` on untrusted text cells like `note`/`batchLabel`/`redeemedEmail` ONLY if needed without mutating URLs or phone numbers — wait: do NOT corrupt `+2010...` phone numbers! Use standard RFC 4180 quoting `if (/[",\n\r]/.test(value))`).
  2. **`src/server/admin/auth.ts`:**
     - Add `assertSameOrigin(request: Request): void` matching `requireApiIdentity` in `src/server/auth.ts`:
       - When `!['GET', 'HEAD'].includes(request.method)`: check `request.headers.get('origin')` vs `request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host`; if `origin && new URL(origin).host !== host` (or invalid URL in `origin`), throw `new Response('Forbidden', { status: 403 })`.
       - Export `assertSameOrigin` (or keep pure helper importable in unit tests if extracted or tested via mock `Request`). Wait: `src/server/admin/auth.ts` imports `'server-only'`, so place pure `isSameOriginRequest(request: Request): boolean` in `src/lib/adminOrigin.ts` OR put pure origin helper in `src/server/admin/admin-identity.ts` (zero `'server-only'`!) and call it from `src/server/admin/auth.ts` `requireAdminMutation(request: Request)`. Putting `isSameOriginRequest` in `src/server/admin/admin-identity.ts` reuses the already unit-tested pure module cleanly!
     - Export `requireAdminMutation(request: Request): Promise<AdminSession>` (`if (!isSameOriginRequest(request)) throw new Response('Forbidden', { status: 403 }); return requireAdminIdentity()`).
     - Update `requireAdminPage(nextPath?: string): Promise<AdminSession>`: if `!session`, build `target = nextPath ? '/signin?next=' + encodeURIComponent(nextPath) : '/signin'`, then `redirect(localizePath(target, locale))`.
  3. **`src/lib/authRouting.ts`:**
     - Add `'admin'` to `allowed` Set in `safeReturnPath`:
       ```ts
       const allowed = new Set(['employee', 'roadmap', 'brain', 'deliverables', 'scheduling', 'settings', 'onboarding', 'admin'])
       ```
     - Allow up to 3 path segments ONLY when `resource === 'admin'` (`part.length <= 3`, e.g. `/admin`, `/admin/promos`, `/admin/traces`, `/admin/traces/<id>`), keeping `part.length <= (part[0] === 'app' ? 2 : 1)` unchanged for all customer routes.
  4. **CLI Removal:**
     - Delete `scripts/promo-codes.ts`.
     - Remove `"promo": "tsx scripts/promo-codes.ts"` from `package.json` `"scripts"`. Keep `"qrcode"` and `"@types/qrcode"` installed.
  5. **Tests (`tests/unit/admin-promos.test.ts` & check `tests/unit/authRouting.test.ts`):**
     - Test `src/lib/promo.ts` (`normalizePromoCodeInput`, `isValidPromoCode`, `formatRandomPromoCode`, `buildSignupUrl`, `buildPromosCsv`), `isSameOriginRequest` (matching host, mismatched origin, malformed origin), and `safeReturnPath` for `/admin`, `/admin/promos`, `/ar/admin/promos`, `/admin/traces/abc` (allowed) vs `//evil.com`, `/admin/a/b/c` (rejected).

### Sub-agent 1B — Admin Promo Server Module & API Endpoints
- **Allowed Files (strict):**
  - `[NEW] src/features/admin/promoTypes.ts`
  - `[NEW] src/server/admin/promos.ts`
  - `[NEW] src/app/api/admin/promos/route.ts`
  - `[NEW] src/app/api/admin/promos/[code]/revoke/route.ts`
  - `[NEW] src/app/api/admin/promos/grant/route.ts`
  - `[NEW] src/app/api/admin/me/route.ts`
- **Specifications:**
  1. **`src/features/admin/promoTypes.ts`** (client-safe TypeScript types):
     - `AdminPromoStatus = 'active' | 'reserved' | 'redeemed' | 'revoked'`
     - `AdminPromoItem`: `{ id: string; code: string; status: AdminPromoStatus; heavyTasksLimit: number; heavyTasksUsed: number; remainingTasks: number; batchLabel: string | null; note: string | null; expiresAt: string | null; isExpired: boolean; redeemedByWorkspaceId: string | null; redeemedEmail: string | null; phoneNumber: string | null; redeemedAt: string | null; createdAt: string }`
     - `AdminPromoSummary`: `{ total: number; active: number; reserved: number; redeemed: number; revoked: number; totalHeavyUsed: number; totalHeavyLimit: number }`
     - `AdminPromoListResult`: `{ data: AdminPromoItem[]; page: number; pageSize: number; total: number; summary: AdminPromoSummary; batches: string[] }`
     - `CreatePromosInput`, `GrantHeavyTasksInput`, `GrantHeavyTasksResult`.
  2. **`src/server/admin/promos.ts`** (`import 'server-only'`):
     - Uses `createAdminClient()`, `randomInt` from `'node:crypto'`, `normalizePhone` from `'@/lib/phone'`, and helpers from `'@/lib/promo'`.
     - Define custom `PromoAdminError` class (`status: number`, `code: string`, `message: string`) OR map domain errors to `Response.json({ error, code }, { status })` cleanly in API routes (since `apiError(error)` passes `error instanceof Response` straight through!). Throwing `Response.json({ error, code }, { status })` or converting cleanly in `promos.ts` routes is 100% consistent with `src/server/auth.ts`.
     - **`listAdminPromos(filters)`:**
       - Queries `promo_codes` ordered by `created_at DESC` (with optional exact `status`, `batch` equality in SQL, OR fetches rows and filters cleanly if `q` spans `workspace_access.phone_number`).
       - Wait — let's handle search (`q`) + summary + batches accurately and fast:
         - Query all `promo_codes` rows (admin beta table is tens/hundreds of codes; select explicit columns: `id, code, status, heavy_tasks_limit, batch_label, note, expires_at, redeemed_by_workspace_id, redeemed_phone, redeemed_email, redeemed_at, created_at`) ordered by `created_at DESC` + query `workspace_access` rows (`workspace_id, promo_code_id, phone_number, heavy_tasks_limit, heavy_tasks_used`) for the referenced workspace IDs.
         - Join in memory (`workspaceMap.get(row.redeemed_by_workspace_id)`):
           - Use `workspace?.heavy_tasks_limit ?? row.heavy_tasks_limit` for `heavyTasksLimit` on redeemed workspaces (so `grant` immediately reflects in the table!).
           - `heavyTasksUsed = workspace?.heavy_tasks_used ?? 0`.
           - `remainingTasks = Math.max(0, heavyTasksLimit - heavyTasksUsed)`.
           - `phoneNumber = workspace?.phone_number ?? row.redeemed_phone ?? null`.
           - `isExpired = Boolean(row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) && row.status === 'active'`.
         - Compute `summary` across ALL promo rows (so KPI cards always reflect the true totals regardless of current table filters) and distinct non-empty `batches` sorted alphabetically!
         - Apply filters (`status`, `batch`, `q` substring match across `code`, `redeemedEmail`, `phoneNumber`, `batchLabel`, `note`) and slice `[offset, offset + pageSize]` returning `{ data, page, pageSize, total, summary, batches }`.
     - **`createAdminPromos(rawInput)`** (Zod schema):
       - Supports `{ mode: 'auto', count, prefix, limit, batchLabel?, note?, expiresDays? }` and `{ mode: 'custom', code, limit, batchLabel?, note?, expiresDays? }`:
         - `limit`: integer `1..1000` (default `6`)
         - `count`: integer `1..100` (default `1`)
         - `prefix`: normalized `PROMO_PREFIX_RE`, default `'BUSM'`
         - `code` (custom mode): normalized `PROMO_CODE_RE` (4..64 chars `[A-Z0-9_-]`)
         - `batchLabel`: trimmed nullable string `<= 64`
         - `note`: trimmed nullable string `<= 240`
         - `expiresDays`: nullable integer `1..3650` -> `new Date(Date.now() + expiresDays * 86_400_000).toISOString()`
       - For `custom` mode: check existence or handle Postgres unique violation `23505` -> return `409` `{ error: 'This promo code already exists.', code: 'PROMO_EXISTS' }`.
       - For `auto` mode: generate `count` unique candidates via `formatRandomPromoCode(prefix, randomInt)`, check against `promo_codes` (`in('code', candidates)`), regenerate any collisions (up to 3 rounds), insert batch, return created `AdminPromoItem[]`.
     - **`revokeAdminPromo(rawCode: string)`:**
       - Normalize code; validate non-empty; fetch current row `{ id, code, status }`.
       - If not found -> `404` `{ error: 'Promo code not found.', code: 'NOT_FOUND' }`.
       - If `status !== 'active'` -> `409` `{ error: 'Only active promo codes can be revoked.', code: 'CANNOT_REVOKE' }`.
       - Update `.update({ status: 'revoked' }).eq('id', row.id).eq('status', 'active').select('id').maybeSingle()`, returning `409` if race lost. Return updated status.
     - **`grantAdminHeavyTasks(rawInput)`** (Zod schema):
       - Accepts `{ workspaceId?: string (uuid), phone?: string, email?: string, extra: number (int 1..1000) }`. Requires at least one target (`workspaceId` | `phone` | `email`).
       - Resolves `workspaceId`:
         - `workspaceId`: direct lookup in `workspace_access`.
         - `phone`: `normalizePhone(phone)` (return `400` if invalid phone) -> lookup `.eq('phone_number', normalized)`.
         - `email`: lookup `promo_codes` `.eq('redeemed_email', email.trim().toLowerCase()).not('redeemed_by_workspace_id', 'is', null)` -> `workspace_access`.
       - If workspace row not found -> `404` `{ error: 'Workspace access record not found.', code: 'NOT_FOUND' }`.
       - Optimistic atomic update loop (up to 3 retries on concurrent limit change):
         `.from('workspace_access').update({ heavy_tasks_limit: before + extra, updated_at: new Date().toISOString() }).eq('workspace_id', workspaceId).eq('heavy_tasks_limit', before).select('workspace_id, heavy_tasks_limit, heavy_tasks_used').maybeSingle()`.
       - Returns `{ workspaceId, before, after, used }`.
  3. **API Routes:**
     - `src/app/api/admin/promos/route.ts`: `GET` (`requireAdminIdentity()`) & `POST` (`requireAdminMutation(request)` returning status `201`).
     - `src/app/api/admin/promos/[code]/revoke/route.ts`: `POST` (`requireAdminMutation(request)`, note URL-decode `decodeURIComponent(code)` from `await params`).
     - `src/app/api/admin/promos/grant/route.ts`: `POST` (`requireAdminMutation(request)`).
     - `src/app/api/admin/me/route.ts`: `GET` (`await requireAdminIdentity()`, returns `{ isAdmin: true, email: session.user.email }`).

### Phase 1 Verification Gate
- Run via `npm.cmd`: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test:unit`.
- Confirm `scripts/promo-codes.ts` is deleted and `"promo"` is absent from `package.json`.
- Update `docs/plans/admin-promo-ui-status.md` Phase 1 -> `READY_FOR_REVIEW` and **STOP**.

---

## Phase 2: Admin Navigation Shell, Post-Login Routing & Bilingual Dictionaries

### Sub-agent 2A — Admin Shell Navigation & Admin Login Redirect
- **Allowed Files (strict):**
  - `[NEW] src/features/admin/AdminNav.tsx`
  - `[MODIFY] src/app/[lang]/admin/layout.tsx`
  - `[MODIFY] src/app/[lang]/admin/page.tsx`
  - `[MODIFY] src/app/[lang]/admin/traces/page.tsx`
  - `[MODIFY] src/app/[lang]/admin/traces/[id]/page.tsx`
  - `[MODIFY] src/proxy.ts`
  - `[MODIFY] src/screens/auth/SignIn.tsx`
- **Specifications:**
  1. **`src/features/admin/AdminNav.tsx` (`'use client'`):**
     - Clean header bar (`data-admin-nav`, hidden when printing via `print:hidden`) matching Busmora styling (`border-b border-ink-200 bg-white px-4 py-3 sm:px-6`):
       - Brand (`Brand` or crisp `Busmora Admin` pill with `ShieldCheck` icon from `lucide-react`).
       - Nav tabs using `Link` from `@/shared/i18n` and `useLocalePathname()` active styling:
         - `/{lang}/admin/promos` — Promo Codes (`t('adminNavPromos')`)
         - `/{lang}/admin/traces` — Trace Explorer (`t('adminNavTraces')`)
       - End cluster: admin email chip (`email`), `LanguageSwitcher`, and Sign Out button (`supabase.auth.signOut()` -> `router.replace('/signin')`).
  2. **Admin Layout & Pages:**
     - `src/app/[lang]/admin/layout.tsx`: async layout calling `const session = await getAdminIdentity()`, rendering `{session && <AdminNav email={session.user.email ?? null} />}` above `{children}`, plus `print:h-auto print:overflow-visible print:bg-white` so printed QR sheets break pages cleanly!
     - `src/app/[lang]/admin/page.tsx`: `await requireAdminPage('/admin/promos'); redirect(localizePath('/admin/promos', await getRequestLocale()))`.
     - `src/app/[lang]/admin/traces/page.tsx`: `await requireAdminPage('/admin/traces')`.
     - `src/app/[lang]/admin/traces/[id]/page.tsx`: pass `'/admin/traces/' + id` after `await params`.
  3. **Seamless Admin Post-Login Routing (`src/proxy.ts` & `src/screens/auth/SignIn.tsx`):**
     - **`src/proxy.ts` (lines 73-81):** When `user` is already authenticated on `AUTH_ROUTES`:
       - Import `isAdminUser` from `'./server/admin/admin-identity'` (pure, zero Node deps!).
       - Check `const nextParam = safeReturnPath(request.nextUrl.searchParams.get('next'))` (import `safeReturnPath` from `'./lib/authRouting'`).
       - Redirect target: `nextParam ? localizePath(nextParam, locale) : isAdminUser({ id: user.id, email: user.email }) ? `/${locale}/admin/promos` : `/${locale}/employee``!
       - *(Careful: ensure `safeReturnPath` returns normalized path without duplicate locale, or use `localizePath(nextParam, locale)` cleanly so `/en/admin/promos` stays `/en/admin/promos` and `/admin/promos` becomes `/${locale}/admin/promos`!)*
     - **`src/screens/auth/SignIn.tsx`:**
       - Resolve explicit `nextTarget = safeReturnPath(params.get('next'))`.
       - When `session` already exists on `/signin` OR right after `supabase.auth.signInWithPassword({ email, password })` succeeds:
         - If `nextTarget`, route to `nextTarget`.
         - Otherwise call `fetch('/api/admin/me', { cache: 'no-store' })`: if `res.ok`, route to `'/admin/promos'`; else route to `'/employee'`.
       - Avoid rendering blank flicker or racing redirects when `session` changes during submit (track resolving state via `useEffect` when `session` becomes truthy without `nextTarget`, or inside `submit` before `router.replace`). Let's keep `useRedirectIfAuthenticated` untouched or bypass it on `SignIn.tsx` with a tiny `useEffect` in `SignIn.tsx` that respects `nextTarget` vs `/api/admin/me` so existing `SignUp.tsx` doesn't change!

### Sub-agent 2B — Bilingual Dictionaries (`en.json` & `ar.json`)
- **Allowed Files (strict):**
  - `[MODIFY] src/app/[lang]/dictionaries/en.json`
  - `[MODIFY] src/app/[lang]/dictionaries/ar.json`
- **Specifications:**
  - Preserve every existing key in `en.json` and `ar.json`.
  - Add synchronized `adminNav*` and `adminPromos*` keys under `app` covering:
    - Navigation (`adminNavTitle`, `adminNavPromos`, `adminNavTraces`, `adminBadge`)
    - Page header & summary cards (`adminPromosTitle`, `adminPromosSubtitle`, `adminPromosStatTotal`, `adminPromosStatActive`, `adminPromosStatRedeemed`, `adminPromosStatRevoked`, `adminPromosStatQuota`)
    - Create panel (`adminPromosCreateTitle`, `adminPromosModeAuto`, `adminPromosModeCustom`, `adminPromosCount`, `adminPromosPrefix`, `adminPromosCustomCode`, `adminPromosCustomCodePlaceholder`, `adminPromosLimit`, `adminPromosBatchLabel`, `adminPromosBatchPlaceholder`, `adminPromosExpiresDays`, `adminPromosExpiresPlaceholder`, `adminPromosNote`, `adminPromosNotePlaceholder`, `adminPromosQrLocale`, `adminPromosQrLocaleAr`, `adminPromosQrLocaleEn`, `adminPromosLinkPreview`, `adminPromosGenerateBtn`, `adminPromosCreateSingleBtn`, `adminPromosCreating`, `adminPromosCreatedNotice`)
    - Filters & table (`adminPromosSearchPlaceholder`, `adminPromosStatusAll`, `adminPromosBatchAll`, `adminPromosRefresh`, `adminPromosExportCsv`, `adminPromosPrintActive`, `adminPromosColCode`, `adminPromosColStatus`, `adminPromosColBatch`, `adminPromosColAccount`, `adminPromosColQuota`, `adminPromosColDates`, `adminPromosColActions`, `adminPromosEmpty`, `adminPromosLoading`, `adminPromosStatusActive`, `adminPromosStatusReserved`, `adminPromosStatusRedeemed`, `adminPromosStatusRevoked`, `adminPromosExpiredTag`)
    - Row & QR modal actions (`adminPromosCopyCode`, `adminPromosCopyLink`, `adminPromosCopied`, `adminPromosViewQr`, `adminPromosRevoke`, `adminPromosRevokeConfirm`, `adminPromosGrantTasks`, `adminPromosGrantTitle`, `adminPromosGrantExtraLabel`, `adminPromosGrantConfirm`, `adminPromosViewTraces`, `adminPromosQrModalTitle`, `adminPromosDownloadPng`, `adminPromosPrintCards`, `adminPromosClose`, `adminPromosUsageSummary`, `adminPromosRemainingLabel`, `adminPromosCancel`)

### Phase 2 Verification Gate
- Verify `Object.keys(en.app)` and `Object.keys(ar.app)` match 100% (0 missing/extra keys).
- Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test:unit`.
- Update `docs/plans/admin-promo-ui-status.md` Phase 2 -> `READY_FOR_REVIEW` and **STOP**.

---

## Phase 3: Admin Promo Control Center UI, QR Print/Download & Final Verification

### Sub-agent 3A — Admin Promo UI (`PromoQrModal.tsx`, `PromoManager.tsx`, `admin/promos/page.tsx`)
- **Allowed Files (strict):**
  - `[NEW] src/features/admin/PromoQrModal.tsx`
  - `[NEW] src/features/admin/PromoManager.tsx`
  - `[NEW] src/app/[lang]/admin/promos/page.tsx`
- **Specifications:**
  1. **`src/app/[lang]/admin/promos/page.tsx`:**
     - Server page calling `await requireAdminPage('/admin/promos')`.
     - Metadata: `title: 'Promo Codes · Busmora Admin'`.
     - Renders `<PromoManager />` inside `<div className="min-h-0 flex-1 overflow-y-auto sleek-scrollbar print:overflow-visible">`.
  2. **`src/features/admin/PromoQrModal.tsx` (`'use client'`):**
     - Generates client-side QR PNG data URLs via `QRCode.toDataURL(url, { width: 512, margin: 2 })` (using installed `qrcode` package) inside `useEffect` whenever `cards` + `origin` + `qrLocale` change.
     - Supports single card OR batch cards (`cards: AdminPromoItem[]`):
       - Displays clean card grid (QR image, bold monospace promo code, clickable/truncated signup link `${origin}/${qrLocale}/signup?promo=${code}`, limit & batch badge).
       - Per-card quick actions: **Copy Code**, **Copy Link**, **Download PNG** (`<a download="${card.code}.png" href={dataUrl}>`).
       - Top modal toolbar: **Download CSV** (`buildPromosCsv` Blob download), **Print QR Cards** (`window.print()`, styled with clean `@media print` rules so ONLY the `.promo-print-sheet` cards print cleanly across pages — zero sidebar/header/backdrop!).
       - Accessible dialog behavior: Escape closes (`useDialog`), backdrop click closes, focus-visible buttons.
  3. **`src/features/admin/PromoManager.tsx` (`'use client'`):**
     - Full interactive dashboard in crisp Busmora light admin style (`max-w-7xl mx-auto p-4 sm:p-6 space-y-6`):
       - **Header + KPI Stat Strip** (`Total`, `Active`, `Redeemed`, `Revoked`, `Heavy Tasks Used / Limit`).
       - **Create Promo Codes Card:**
         - Two-mode switcher: `Auto Generate` vs `Custom Code`.
         - Helpful presets for `Count` (`1`, `5`, `10`, `25`), `Prefix` (default `BUSM`), `Limit` (default `6`), optional `Batch`, `Expiry Days`, `Note`, and `QR Link Language` (`ar` / `en`) with live URL preview (`window.location.origin` fallback `''` until mounted so SSR hydration never mismatches!).
         - On creation success: clears error, updates summary/list cleanly, shows inline confirmation banner, AND automatically opens `PromoQrModal` with the newly created promo card(s) so the admin can immediately copy link, download PNG, export CSV, or print cards!
       - **Promo Codes & User Quotas Card (Filterable Table):**
         - Search input (debounced or Enter/Apply + instant client/server refresh), Status `<select>`, Batch `<select>`, Refresh, Export CSV (exports visible rows), Print Active QR Cards (opens `PromoQrModal` with currently listed `active` codes!).
         - Each row renders:
           - `Code` + Copy Code icon button + QR icon button (if `active`)
           - `Status` badge + `(Expired)` warning pill if past `expiresAt`
           - `Batch / Note`
           - `Redeemed Account`: `redeemedEmail` + `phoneNumber`
           - `Heavy Tasks`: `{used} / {limit}` + small visual progress bar + remaining text
           - `Created / Redeemed` timestamp
           - `Actions`:
             - `active`: Copy Signup Link + QR button + inline two-step **Revoke** (`Revoke` -> `Confirm? / Cancel`) calling `POST /api/admin/promos/${encodeURIComponent(code)}/revoke`.
             - `redeemed` (`redeemedByWorkspaceId`): **+ Grant Tasks** opening an inline modal/panel (`+1`, `+5`, `+10` quick chips or custom number input `1..1000`, calling `POST /api/admin/promos/grant`) + `<Link href={`/${lang}/admin/traces?workspaceId=${row.redeemedByWorkspaceId}`}>` to inspect traces!

### Sub-agent 3B — Additional Tests & Build Verification
- **Allowed Files (strict):**
  - `[MODIFY] tests/unit/admin-promos.test.ts` (add tests covering any UI/format helpers, Zod bounds, custom code validation, `grantAdminHeavyTasks` validation edge cases via pure helpers if extracted cleanly, ensuring high branch coverage with `0` live calls)
  - `[MODIFY] e2e/specs/01-auth-database.spec.ts`? (**Check first:** confirm no file in `e2e/` imports `scripts/promo-codes.ts`. If zero references exist, do NOT unnecessarily touch `e2e/`; optionally check `tsconfig.json` / `lint` include `src` and `e2e` cleanly!)
- **Note on `tsconfig` & types for `qrcode`:** verify `@types/qrcode` compiles cleanly under strict TypeScript in client components (`QRCode.toDataURL`).

### Phase 3 Verification Gate (Final)
1. Confirm `scripts/promo-codes.ts` does NOT exist and `package.json` has NO `"promo"` script.
2. Confirm ZERO references to `scripts/promo-codes` anywhere in `src/`, `tests/`, `e2e/`, `package.json` (except historical `docs/plans/beta-promo-quota-*` logs).
3. Run full checks via `npm.cmd`:
   - `npm.cmd run typecheck` -> exit `0`
   - `npm.cmd run lint` -> `0` errors, exit `0`
   - `npm.cmd run test:unit` -> all passing, `0` failed, `0` live AI calls
   - `npm.cmd run build` -> exit `0` (verify `/[lang]/admin/promos`, `/api/admin/promos`, `/api/admin/promos/[code]/revoke`, `/api/admin/promos/grant`, `/api/admin/me` appear in route manifest)
4. Update `docs/plans/admin-promo-ui-status.md` Phase 3 -> `READY_FOR_REVIEW` and **STOP**.

*(Post-Phase-3 Supervisor Verification by Antigravity: Audit all diffs, re-run verification commands, launch Next.js locally and verify the full Admin login (`admin@busmora.com`), `/admin/promos` UI, QR generation, and filter/actions in a real browser — cleaning up any disposable test promo row afterward!)*
