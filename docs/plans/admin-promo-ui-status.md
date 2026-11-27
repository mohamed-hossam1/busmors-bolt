# Busmora Admin Promo Control Center — Phase Gate Status Ledger

> **SUPERVISION PROTOCOL:**
> - **Kilo Code** executes ONLY the active phase marked below (`READY_TO_START` or `REJECTED`), updates its report under that Phase section, sets status to `READY_FOR_REVIEW`, and **STOPS**.
> - **Antigravity (Supervisor)** audits `git diff`, reads every modified file, re-runs checks independently (including real browser testing after Phase 3), and marks `APPROVED` or `REJECTED`.
> - **NEVER** start a Phase whose prerequisite Phase is not `APPROVED`.

---

## Phase Status Overview

| Phase | Scope | Status | Approved By |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Pure `src/lib/promo.ts`, Admin Auth Hardening (`authRouting`, CSRF Origin check), Admin Promo Server + API Routes & Remove CLI Script | `APPROVED` | Antigravity |
| **Phase 2** | Admin Layout Nav (`AdminNav`), Admin Post-Login Routing (`proxy.ts`, `SignIn.tsx`) & Bilingual Dictionaries (`ar`/`en`) | `APPROVED` | Antigravity |
| **Phase 3** | Admin Promo Control Center UI (`PromoManager`, `PromoQrModal`, `/admin/promos`), Unit Tests & Full Verification | `APPROVED` | Antigravity |

---

## Phase 1 Report (Kilo Code fills after completing Phase 1)

### Files Created / Modified / Deleted
- [NEW] `src/lib/promo.ts` (browser-safe helpers: alphabet, regexes, normalizers, `formatRandomPromoCode`, `buildSignupUrl`, `csvCell`, `buildPromosCsv`; zero Node/`server-only` imports)
- [MODIFY] `src/lib/authRouting.ts` (added `'admin'` to allow-list, 3-segment admin path allowance in `safeReturnPath`, new pure `isSameOriginRequest`)
- [MODIFY] `src/server/admin/auth.ts` (added `requireAdminMutation(request)`; `requireAdminPage(nextPath?)` now redirects to `/signin?next=...`)
- [DELETE] `scripts/promo-codes.ts`
- [MODIFY] `package.json` (removed `"promo"` script; kept `qrcode` + `@types/qrcode`)
- [NEW] `tests/unit/admin-promos.test.ts` (offline unit tests for promo helpers, `isSameOriginRequest`, `safeReturnPath`)
- [NEW] `src/features/admin/promoTypes.ts` (client-safe promo types)
- [NEW] `src/server/admin/promos.ts` (`server-only`; `listAdminPromos`, `createAdminPromos`, `revokeAdminPromo`, `grantAdminHeavyTasks` with Zod validation, atomic/optimistic updates, `node:crypto` randomInt)
- [NEW] `src/app/api/admin/promos/route.ts` (GET list, POST create 201)
- [NEW] `src/app/api/admin/promos/[code]/revoke/route.ts` (POST, async params + decodeURIComponent)
- [NEW] `src/app/api/admin/promos/grant/route.ts` (POST)
- [NEW] `src/app/api/admin/me/route.ts` (GET -> `{ isAdmin, email }`)

### Sub-Agents Run & Parent Audit
- Sub-agent 1A (promo helpers, auth hardening, CLI removal, initial tests) and Sub-agent 1B (promo server module + API routes) ran in parallel with disjoint file ownership.
- Parent read every created/modified file line-by-line. Confirmed: `src/lib/promo.ts` has no Node/`server-only` imports; `node:crypto`/`fs` confined to `src/server/admin/promos.ts`; `'server-only'` only in server modules; `requireAdminMutation` enforces same-origin before `requireAdminIdentity`; `requireAdminPage(nextPath?)` builds `/signin?next=`; `safeReturnPath` allows `/admin` (<=3 segments) while rejecting `/admin/a/b/c` and `//evil.com`; CSV uses RFC 4180 quoting (no formula neutralization, `+20...` phones preserved); grant uses optimistic `.eq('heavy_tasks_limit', before)` retry loop; custom-code unique violation maps to 409 `PROMO_EXISTS`. No mismatches found.

### Verification Outputs
- `scripts/promo-codes.ts` deleted: confirmed (`DELETED_OK`). `package.json` has no `"promo"` script: confirmed (`NO_PROMO_SCRIPT`).
- `npm.cmd run typecheck` -> `✓ Types generated successfully`, `tsc --noEmit` exit 0 (no errors).
- `npm.cmd run lint` -> exit 0, 0 errors (only pre-existing `react(...)`/`react-hooks(...)`/`eslint(no-unused-vars)` warnings; none reference the new Phase 1 files).
- `npm.cmd run test:unit` -> `tests 275`, `pass 275`, `fail 0`, `skipped 0` (0 live AI/DB calls; promo/origin/routing suites all green, including the 2 new comma-separated `x-forwarded-host` origin cases).

### Fixes Applied After Supervisor Rejection
1. **`src/server/admin/promos.ts` (empty strings -> `null`):** Added `const batchLabel = input.batchLabel?.trim() || null` and `const note = input.note?.trim() || null` after schema parse; both `custom` and `auto` insert paths now use these normalized values, so blank form fields persist as `null` (no blank `batches` dropdown entries).
2. **`src/server/admin/promos.ts` (auto-mode collision retry):** Replaced the dead pre-loop collision check + single re-insert with a 3-attempt loop that, on each attempt, regenerates fresh candidates (`generateCandidates()`), re-checks `.in('code', candidateList)` for collisions, and only inserts when no candidate is taken; a `23505` on insert now `continue`s to regenerate fresh codes instead of re-inserting the same rows.
3. **`src/lib/authRouting.ts` (`x-forwarded-host` parsing):** `isSameOriginRequest` now takes `request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()` (first comma-separated host) before falling back to `host`/URL host.
4. **`tests/unit/admin-promos.test.ts`:** Added two cases covering matching vs mismatching origin against a comma-separated `x-forwarded-host` (`"app.busmora.com, internal-proxy"`).

### Phase 1 Supervisor Verdict
- Status: `APPROVED`
- Notes: Verified both fixes in `src/server/admin/promos.ts`, `src/lib/authRouting.ts`, and `tests/unit/admin-promos.test.ts`. Direct Antigravity checks after final edit: `npm.cmd run typecheck` (exit 0), `npm.cmd run lint` (0 errors, exit 0), `npm.cmd run test:unit` (275/275 across 100 suites, exit 0), CLI `scripts/promo-codes.ts` deleted & `"promo"` removed from `package.json`. Phase 2 unlocked (`READY_TO_START`).

---

## Phase 2 Report (Kilo Code fills after completing Phase 2)

### Files Created / Modified
- [NEW] `src/features/admin/AdminNav.tsx` (`'use client'`; `data-admin-nav`, `print:hidden`; Brand + ShieldCheck title, Promos/Traces tabs with active styling via `useLocalePathname`, email chip, `LanguageSwitcher`, Sign Out via `supabase.auth.signOut()` -> `router.replace('/signin')`, `t('signOut')`).
- [MODIFY] `src/app/[lang]/admin/layout.tsx` (async; `getAdminIdentity()`; renders `{session && <AdminNav email={session.user.email ?? null} />}` above `{children}`; `print:h-auto print:overflow-visible print:bg-white`).
- [MODIFY] `src/app/[lang]/admin/page.tsx` (`requireAdminPage('/admin/promos')` + redirect to `localizePath('/admin/promos', locale)`).
- [MODIFY] `src/app/[lang]/admin/traces/page.tsx` (`requireAdminPage('/admin/traces')`).
- [MODIFY] `src/app/[lang]/admin/traces/[id]/page.tsx` (`await params` first, then `requireAdminPage('/admin/traces/' + id)`).
- [MODIFY] `src/proxy.ts` (auth-route redirect now honors `next` via `safeReturnPath`, else `isAdminUser(...)` -> `/admin/promos` else `/employee`; `target.pathname = localizePath(targetPath, locale)`; added `localizePath`, `safeReturnPath`, `isAdminUser` imports).
- [MODIFY] `src/screens/auth/SignIn.tsx` (admin-aware post-login routing: `nextTarget = safeReturnPath(params.get('next'))`; `useEffect`+`useRef` single-resolution `/api/admin/me` probe when no `nextTarget`; `submit` routes to `nextTarget` or `/api/admin/me` result).
- [MODIFY] `src/app/[lang]/dictionaries/en.json` & `src/app/[lang]/dictionaries/ar.json` (added 77 synchronized `adminNav*`/`adminPromos*` keys under `app` after `adsKindClicks`; all existing keys/values preserved).

### Sub-Agents Run & Parent Audit
- Sub-agent 2A (admin shell nav, layout, pages, `proxy.ts`, `SignIn.tsx`) and Sub-agent 2B (bilingual dictionaries) ran in parallel with strict disjoint file ownership (2A: components/app/proxy/auth; 2B: `en.json`/`ar.json` only).
- Parent read every created/modified file line-by-line. Confirmed: `AdminNav` is `'use client'`, uses `@/shared/i18n` `Link` + `useLocalePathname`/`useLocaleRouter`/`useTranslate`, `print:hidden`, RTL-safe `ms-auto`, sign-out uses existing `t('signOut')` (key present in both dicts). Layout is async and gates `AdminNav` on `getAdminIdentity()` with print overrides. `page.tsx`/traces pages pass correct `nextPath` to `requireAdminPage`. `proxy.ts` redirect honors `next` (via `safeReturnPath`) then admin `/admin/promos` else `/employee`, with idempotent `localizePath` (no duplicate locale) and preserved cookie/localStorage pattern; `isAdminUser` imported from pure `admin-identity` (no `'server-only'`). `SignIn.tsx` resolves admin routing via `/api/admin/me` with single-resolution ref (no flicker/race), `nextTarget` short-circuits the probe. No `'server-only'`/node imports leaked into client components. No `// TODO`/placeholders. No mismatches found.

### Verification Outputs
- Key parity: `en.app` = 1223 keys, `ar.app` = 1223 keys, `missingInAr []`, `extraInAr []` (100% synchronized); both files `JSON.parse` cleanly. `signOut`, `adminNavTitle` confirmed present in both.
- `npm.cmd run typecheck` -> `✓ Types generated successfully`, `tsc --noEmit` exit 0 (no errors).
- `npm.cmd run lint` -> exit 0, 0 errors (only pre-existing `react(only-export-components)`/`react-hooks`/`set-state-in-effect`/`no-unused-vars` warnings; the 3 new admin `layout`/`traces` warnings are the same `only-export-components` class as the pre-existing pages, none are errors and none reference new logic).
- `npm.cmd run test:unit` -> `tests 275`, `suites 100`, `pass 275`, `fail 0`, `skipped 0` (0 live AI/DB calls).

### Fixes Applied After Supervisor Rejection
1. **`src/screens/auth/SignIn.tsx` (race with `useRedirectIfAuthenticated`):** Removed the `useRedirectIfAuthenticated` hook import and call. Now reads `const { session } = useAuth()` directly and adds a `submittingRef` guard so the already-authenticated `useEffect` stays idle while `submit` runs. Routing (`nextTarget ?? (res.ok ? '/admin/promos' : '/employee')`) happens only after `/api/admin/me` resolves (or immediately when `nextTarget` is present); `submittingRef` resets on login error so retries work. No more race sending admins to `/employee` -> `/onboarding`.
2. **`src/proxy.ts` (next query-string mangling):** Replaced `target.search = ''; target.pathname = localizePath(...)` with `const resolved = new URL(localizePath(targetPath, locale), 'https://local.invalid'); target.pathname = resolved.pathname; target.search = resolved.search;` so any query string in `next` is preserved (no `%3F` encoding into the pathname).
3. **`src/features/admin/AdminNav.tsx` (signOut router cache):** Added `router.refresh()` after `router.replace('/signin')` so cached admin RSC payloads are cleared cleanly.

### Post-Fix Verification Outputs
- `npm.cmd run typecheck` -> `✓ Types generated successfully`, `tsc --noEmit` exit 0 (no errors).
- `npm.cmd run lint` -> exit 0, 0 errors (only pre-existing warnings; none reference `SignIn.tsx`, `proxy.ts`, or `AdminNav.tsx`).
- `npm.cmd run test:unit` -> `tests 275`, `suites 100`, `pass 275`, `fail 0`, `skipped 0` (0 live AI/DB calls).

### Phase 2 Supervisor Verdict
- Status: `APPROVED`
- Notes: Verified all 3 post-rejection fixes in `src/screens/auth/SignIn.tsx`, `src/proxy.ts`, and `src/features/admin/AdminNav.tsx`, plus 1223/1223 key parity between `en.app` and `ar.app`. Direct Antigravity checks: `npm.cmd run typecheck` (exit 0), `npm.cmd run lint` (0 errors, exit 0), `npm.cmd run test:unit` (275/275 across 100 suites, exit 0). Phase 3 unlocked (`READY_TO_START`).

---

## Phase 3 Report (Kilo Code fills after completing Phase 3)

### Files Created / Modified
- [NEW] `src/app/[lang]/admin/promos/page.tsx` (server component; `metadata.title = 'Promo Codes · Busmora Admin'`; `await requireAdminPage('/admin/promos')`; renders `<PromoManager />` inside `min-h-0 flex-1 overflow-y-auto sleek-scrollbar print:overflow-visible`).
- [NEW] `src/features/admin/PromoQrModal.tsx` (`'use client'`; `useDialog(true, onClose)`; client-side QR via `QRCode.toDataURL(url,{width:512,margin:2})` in an async `Promise.all(...).then(setUrls)` effect guarded by a `cancelled` flag; `ar`/`en` locale toggle; `origin` via `useSyncExternalStore` (SSR-safe `''`, no sync setState-in-effect); Download CSV via `buildPromosCsv`; Print Cards via `window.print()`; injected scoped `@media print` `<style>` that hides the dashboard (`body * { visibility:hidden }`) and prints ONLY `.promo-print-sheet`/`.promo-print-card` across pages; per-card Copy Code / Copy Link / Download PNG with transient `copiedCode`; exports only default component).
- [NEW] `src/features/admin/PromoManager.tsx` (`'use client'`; full dashboard: KPI `.stat-card` strip, create card with Auto/Custom modes + count presets 1/5/10/25 + prefix/limit/batch/expiry/note + QR-locale + live `buildSignupUrl` preview, filter row + table (status badges via `statusClasses`+`statusLabel`, quota progress bar + remaining, `formatDateTime`), two-step inline Revoke -> `POST /api/admin/promos/${encodeURIComponent(code)}/revoke`, inline `GrantDialog` -> `POST /api/admin/promos/grant`, localized `Link` to `/admin/traces?workspaceId=`, Export CSV of visible rows, Print Active QR; create success opens `PromoQrModal` with created items; `origin` via `useSyncExternalStore`; exports only default component, helpers module-private).
- [MODIFY] `tests/unit/admin-promos.test.ts` (appended offline describe blocks extending branch coverage of `src/lib/promo.ts`: normalize idempotency/empty, `isValidPromoCode` 4/64/65/hyphen/3-char boundaries, `PROMO_CODE_RE`/`PROMO_PREFIX_RE` length 20/21 + underscore, `formatRandomPromoCode` last-alphabet-char, `buildSignupUrl` multi-slash collapse + space encoding, `csvCell` empty/lone-quote/CR, `buildPromosCsv` all-fields row with `+20...` phone NOT neutralized + comma/newline quoting + header+N line count; existing tests preserved; imports only `node:test`/`node:assert` + `src/lib/promo` + `src/lib/authRouting`).
- [MODIFY] `src/lib/promo.ts` (added DOM-safe `downloadTextFile(content, filename, mimeType)` guarded by `typeof document === 'undefined'`; shared by both admin promo client components).
- [MODIFY] `src/features/admin/format.ts` (added `active`/`redeemed`/`reserved`/`revoked` semantic colors to `STATUS_STYLES`).
- [MODIFY] `src/features/admin/PromoManager.tsx` & `src/features/admin/PromoQrModal.tsx` (post-rejection fixes: QR `initialLocale` sync, live prefix preview, distinct `copiedKey`s, `errorGeneric` fallbacks, count/limit bounds + custom-code disable, shared `downloadTextFile`, multi-page print height).

### Sub-Agents Run & Parent Audit
- Sub-agent 3A (`PromoQrModal.tsx`, `PromoManager.tsx`, `admin/promos/page.tsx`) and Sub-agent 3B (`tests/unit/admin-promos.test.ts` + stale-ref scan) ran in parallel with strict disjoint file ownership (3A: `src/features/admin/Promo*` + `src/app/[lang]/admin/promos/page.tsx`; 3B: `tests/unit/admin-promos.test.ts` only).
- 3B stale-ref scan: ZERO references to `scripts/promo-codes`/`promo-codes.ts` in `src/`, `tests/`, `e2e/`, `package.json` (only historical `docs/plans/beta-promo-quota-*` logs). `e2e/` and `tsconfig.json` left untouched (no edits needed).
- Parent read every created/modified file line-by-line from disk. Confirmed: client components import no `'server-only'`/node modules; `qrcode` imported client-side only; `origin` uses `useSyncExternalStore` (no synchronous setState in any effect body; QR generation defers `setState` into the async `.then`); hooks called unconditionally before any early return (rules-of-hooks satisfied); every visible string uses an existing Phase-2 `adminNav*`/`adminPromos*` key (no invented keys, no hardcoded UI text); print stylesheet scoped so only `.promo-print-sheet` cards print (no nav/backdrop/sidebar); RTL-safe utilities + design tokens reused; no `// TODO`/placeholders/fake data/unused vars; CSV export reuses `buildPromosCsv` (phone `+20...` preserved, RFC 4180 quoting). No mismatches found.

### Verification Outputs
- Stale refs: `scripts/promo-codes.ts` absent; `package.json` has no `"promo"` script; zero `scripts/promo-codes` references in `src/`/`tests/`/`e2e/`/`package.json`.
- `npm.cmd run typecheck` -> `✓ Types generated successfully`, `tsc --noEmit` exit 0 (no errors).
- `npm.cmd run lint` -> exit 0, 0 errors. Only warnings: pre-existing `react(only-export-components)` / `react-hooks(exhaustive-deps)` / `set-state-in-effect` / `no-unused-vars` classes. The 2 new-file warnings are the same accepted classes as existing code: `admin/promos/page.tsx:5` (`only-export-components`, identical to `admin/traces/page.tsx`) and `PromoManager.tsx:116` (`set-state-in-effect` on `void load()`, identical to `TraceExplorer.tsx:64`).
- `npm.cmd run test:unit` -> `tests 296`, `suites 108`, `pass 296`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0` (0 live AI/DB calls; all new promo-helper cases green).
- `npm.cmd run build` -> exit 0 (Turbopack, 64/64 static pages). Route manifest includes `ƒ /[lang]/admin/promos`, `ƒ /api/admin/promos`, `ƒ /api/admin/promos/[code]/revoke`, `ƒ /api/admin/promos/grant`, `ƒ /api/admin/me`.

### Fixes Applied After Supervisor Rejection
1. **QR locale sync, live prefix preview, distinct copy keys (`PromoManager.tsx` & `PromoQrModal.tsx`):**
   - `PromoQrModal` now accepts `initialLocale?: 'ar' | 'en'` and initializes `useState<'ar' | 'en'>(initialLocale ?? 'ar')`; `PromoManager` passes `initialLocale={createQrLocale}` so the Create-form locale selection syncs into the opened QR modal.
   - `PromoManager` `linkPreview` now reflects the typed prefix in Auto mode: `` `${normalizePromoPrefix(prefix) || 'BUSM'}-XXXX-XXXX` `` (no longer hardcoded `'BUSM-XXXX-XXXX'`).
   - Both components track distinct copy keys (`'code:' + code` vs `'link:' + code`) via a single `copiedKey` state, so clicking "Copy Code" no longer shows "Copied" on "Copy Link" (and vice-versa).
2. **Multi-page `@media print` height (`PromoQrModal.tsx`):** In `PRINT_STYLES`, replaced `inset: 0 !important;` on `.promo-print-sheet` with `top: 0 !important; left: 0 !important; right: 0 !important; bottom: auto !important; height: auto !important;` so batches larger than one page never clip on print page 2+.
3. **Error fallbacks, bounds & single CSV download (`PromoManager.tsx` + `src/lib/promo.ts`):**
   - `load`, `submitCreate`, `revoke`, and `GrantDialog.submit` now always fall back to `t('errorGeneric')` (`data.error || t('errorGeneric')` and `err instanceof Error && err.message ? err.message : t('errorGeneric')`), so non-JSON/500 responses never yield an invisible `""` error. `load`'s `useCallback` deps now include `t`.
   - `count` input has `min={1} max={100}`, `limit` input has `min={1} max={1000}`, and the Create submit is disabled while `mode === 'custom' && !normalizePromoCodeInput(customCode)`.
   - Extracted one shared DOM-safe helper `downloadTextFile(content, filename, mimeType)` into `src/lib/promo.ts` (guarded by `if (typeof document === 'undefined') return` so node unit tests never touch `document`); both `PromoManager` and `PromoQrModal` now call it instead of duplicating `downloadCsv`/`downloadBlob` (both local helpers removed).
4. **Promo status badge colors (`src/features/admin/format.ts`):** Added `active: 'bg-emerald-100 text-emerald-700'`, `redeemed: 'bg-primary-100 text-primary-700'`, `reserved: 'bg-amber-100 text-amber-700'`, and `revoked: 'bg-red-100 text-red-700'` to `STATUS_STYLES` so promo status badges render clear semantic colors.

### Post-Fix Verification Outputs
- `errorGeneric` confirmed present in both `en.json` (line 293) and `ar.json` (line 293).
- `npm.cmd run typecheck` -> `✓ Types generated successfully`, `tsc --noEmit` exit 0 (no errors).
- `npm.cmd run lint` -> exit 0, 0 errors. Only pre-existing warning classes (`react(only-export-components)` / `react-hooks(exhaustive-deps)` / `set-state-in-effect` / `no-unused-vars`). The single `PromoManager.tsx` warning is `set-state-in-effect` on `void load()` (same accepted class as `TraceExplorer.tsx:64`); no new errors introduced.
- `npm.cmd run test:unit` -> `tests 296`, `suites 108`, `pass 296`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0` (0 live AI/DB calls).
- `npm.cmd run build` -> exit 0 (Turbopack, 64/64 static pages). Route manifest includes `ƒ /[lang]/admin/promos`, `ƒ /api/admin/promos`, `ƒ /api/admin/promos/[code]/revoke`, `ƒ /api/admin/promos/grant`, `ƒ /api/admin/me`.

### Phase 3 Supervisor Verdict
- Status: `APPROVED`
- Notes: Verified all 4 post-rejection fixes in `src/features/admin/PromoManager.tsx`, `src/features/admin/PromoQrModal.tsx`, `src/features/admin/format.ts`, and `src/lib/promo.ts`. Direct Antigravity checks: `npm.cmd run typecheck` (exit 0), `npm.cmd run lint` (0 errors, exit 0), `npm.cmd run test:unit` (296/296 across 108 suites, 0 live AI calls), `npm.cmd run build` (64/64 static pages, exit 0). Live headless Chrome verification against local Next.js server (`http://localhost:3099`): unauthenticated `/ar/admin/promos` -> `/ar/signin?next=%2Fadmin%2Fpromos`, admin login (`admin@busmora.com`) -> `/en/admin/promos`, Custom code + Auto batch of 2 generated with real QR PNGs (`data:image/png;base64,...`), EN/AR QR modal link toggle, 2-step Revoke, Arabic RTL (`/ar/admin/promos`) + Trace Explorer navigation, `/ar/signup?promo=...` QR auto-fill + hidden Google button, `0` console/page errors, all 3 temporary test rows cleaned up from DB.
