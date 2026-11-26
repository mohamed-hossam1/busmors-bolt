# Busmora Invite-Only Beta (Promo Codes + QR + Phone) & 6 Heavy-Task Quota — Executor Plan

> **WHO THIS DOCUMENT IS FOR:**
> This is an **Executor Blueprint** for Kilo Code (and its sub-agents).
> You are supervised by a strict Reviewer (**Antigravity** + the human owner) who audits your actual `git diff`, reads every modified file line-by-line, and re-runs all verification checks after every phase.

---

## 0. Mandatory Execution & Anti-Skip Rules (READ FIRST)

1. **STRICT PHASE-BY-PHASE LOCK (HARD STOP):**
   - Execute **ONLY** the single Phase assigned to you in the current prompt, AND verify in `docs/plans/beta-promo-quota-status.md` that the previous Phase is marked `APPROVED` (except Phase 1).
   - **NEVER** start Phase `N+1` on your own. When Phase `N` finishes, update `docs/plans/beta-promo-quota-status.md` to `READY_FOR_REVIEW`, paste your evidence report there, and **STOP IMMEDIATELY**.

2. **SUB-AGENT DELEGATION PROTOCOL (`new_task` / Sub-agents):**
   - Each Phase defines explicit, non-overlapping sub-tasks (`Sub-agent A`, `Sub-agent B`, etc.) with **strict file ownership**.
   - You MAY launch sub-agents in parallel (or sequence) **only within the active Phase**, giving each sub-agent:
     1. Its exact sub-task section from this file.
     2. The exact list of files it is allowed to create/edit (it MUST NOT touch files owned by another sub-agent!).
     3. The Zero-Shortcut Rules below.
   - **Parent Verification Obligation:** After sub-agents return, you (the main agent) MUST read every file they created/edited, fix any wiring or type mismatch, and run ALL commands in the Phase's **Verification Gate** yourself before writing the status report.

3. **ZERO-SHORTCUT & ANTI-HALLUCINATION RULES:**
   - **NEVER** write `// TODO`, `// ... rest of code`, `/* implement later */`, placeholder returns, or mock logic in production code.
   - **NEVER** edit or relax an existing test assertion just to make a test pass. Fix the implementation.
   - **NEVER** guess existing symbol names, migration columns, or helper APIs—read the referenced files first.
   - **NEVER** run live AI tests (`tests/live/*`). All unit tests MUST use deterministic mocks (`0` live API calls) per `AGENTS.md`.
   - **NEVER** claim a command passed unless you executed it *after your final edit* and observed exit code `0`. Paste the real raw command summary in `docs/plans/beta-promo-quota-status.md`.

4. **CRITICAL REPO CONSTRAINTS (Observed in Codebase):**
   - **Local Migration Harness (`scripts/local-db-bootstrap.sql`):** In local DB checks, `auth.users` has **only** `(id uuid PRIMARY KEY)` (no `email`, `phone`, or `raw_user_meta_data` columns!). Therefore, migrations MUST NEVER query `auth.users.email` or attach triggers to `auth.users`. Keep all new schema in `public`.
   - **Orchestrator Tool Allowlist (`tests/unit/orchestrator-tools.test.ts`):** `ROLE_TOOL_ALLOWLIST.orchestrator` MUST stay strictly 3 tools (`read_business_brain`, `propose_brain_change`, `delegate_to_director`). Do NOT add tools to the Orchestrator; enforce the heavy-task gate inside the `runDirector` wrapper in `src/server/employee/agents/orchestrator.ts`.
   - **Server-Only Guard (`src/server/supabase-admin.ts`):** `createAdminClient()` imports `'server-only'`. CLI scripts under `scripts/` MUST import `createClient` directly from `@supabase/supabase-js` instead of `@/server/supabase-admin`.
   - **i18n Type Safety (`src/lib/i18n.ts`):** `AppKey = keyof Dictionary['app']` comes from `src/app/[lang]/dictionaries/en.json`. Always keep `en.json` and `ar.json` keys 100% synchronized.

---

## Architecture Summary

- **Invite-Only Signup + Phone + QR Auto-Fill:**
  - Single-use promo codes in `public.promo_codes` (`active` → `reserved` → `redeemed` / `revoked`).
  - QR URLs point to `/{locale}/signup?promo={CODE}` (and `/signup` also accepts `?code={CODE}` safely without `src/proxy.ts` hijacking it for OAuth PKCE).
  - Switching language on `/signup` preserves `?promo=...` in the URL (`src/context/I18nContext.tsx`).
  - Phone number is collected on SignUp, normalized to E.164 (including Egyptian `01[0125]XXXXXXXX` and Arabic-Indic numerals `٠-٩` → `+201XXXXXXXXX`), and enforced **unique** across accounts (`public.workspace_access.phone_number`).
  - Google OAuth button (`GoogleButton.tsx`) is **hidden temporarily** (not deleted!) via `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=false`, and `/auth/callback` rejects uninvited OAuth attempts while `BETA_INVITE_ONLY` is active.
- **6 Heavy-Task Quota (Unlimited Orchestrator):**
  - **Uncounted / Unlimited:** Direct Orchestrator Q&A, Business Brain reads/proposals (`read_business_brain`, `propose_brain_change`), Roadmap `Ask Director` quick suggestions (`/api/roadmap/ask-director`), `prefill`, `checkin`, `revisions`.
  - **Counted (6 per account by default):**
    1. `delegate_to_director` in Employee Chat (including Roadmap `Run Step` via `/employee`).
    2. `POST /api/roadmap/generate` (`Generate Roadmap`).
  - **Atomic Reserve → Settle / Release Pattern (`public.heavy_task_runs`):**
    - Before running Director / Roadmap Generate, `reserve_heavy_task` locks `workspace_access` `FOR UPDATE` and claims 1 slot (blocking parallel tab double-spending).
    - If Director asks a **Clarification Card** (`ask_clarification` without saving deliverables/drafts) OR **fails/times out** (`released_clarification` / `released_failed`), the reserved slot is **released** (0 deducted).
    - Only when the task completes with real deliverables/drafts/Brain proposals/final reply (or `create_generated_roadmap` succeeds) does `settle_heavy_task` mark it `consumed` (`+1 used`).

---

## Phase 1: Database Schema, Atomic RPCs & Local DB Acceptance Tests

**Dependency:** None. Can start immediately.
**Goal:** Add the Postgres tables, RLS policies, atomic promo/quota RPCs, backfill existing workspaces, and prove correctness via `npm run test:db:local`.

### Sub-agent 1A — Migration SQL
**Owned File (ONLY touch this file):**
- `[NEW] supabase/migrations/20261126000000_promo_codes_and_heavy_quota.sql`

**Exact Requirements:**
1. **Table `public.promo_codes`:**
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `code text NOT NULL UNIQUE CHECK (code = upper(btrim(code)) AND length(code) BETWEEN 4 AND 64)`
   - `status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reserved', 'redeemed', 'revoked'))`
   - `heavy_tasks_limit integer NOT NULL DEFAULT 6 CHECK (heavy_tasks_limit > 0)`
   - `batch_label text`
   - `note text`
   - `expires_at timestamptz`
   - `reservation_token uuid`
   - `reserved_until timestamptz`
   - `reserved_phone text`
   - `redeemed_by_workspace_id uuid UNIQUE REFERENCES workspaces(id) ON DELETE SET NULL`
   - `redeemed_phone text`
   - `redeemed_email text`
   - `redeemed_at timestamptz`
   - `created_at timestamptz NOT NULL DEFAULT now()`
   - Enable RLS. `REVOKE ALL ON promo_codes FROM PUBLIC, anon, authenticated; GRANT ALL ON promo_codes TO service_role;` (Zero direct access from browser clients).

2. **Table `public.workspace_access`:**
   - `workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE`
   - `promo_code_id uuid UNIQUE REFERENCES promo_codes(id) ON DELETE RESTRICT`
   - `phone_number text UNIQUE` (nullable only for backfilled pre-beta/admin workspaces; enforced `NOT NULL` by `finalize_promo_signup`)
   - `heavy_tasks_limit integer NOT NULL DEFAULT 6 CHECK (heavy_tasks_limit >= 0)`
   - `heavy_tasks_used integer NOT NULL DEFAULT 0 CHECK (heavy_tasks_used >= 0)`
   - `activated_at timestamptz NOT NULL DEFAULT now()`
   - `updated_at timestamptz NOT NULL DEFAULT now()`
   - Enable RLS. Policy `"owner read own access"` `FOR SELECT TO authenticated USING (workspace_id = auth.uid())`.
   - `REVOKE ALL ON workspace_access FROM PUBLIC, anon, authenticated; GRANT SELECT ON workspace_access TO authenticated; GRANT ALL ON workspace_access TO service_role;`

3. **Table `public.heavy_task_runs`:**
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
   - `source text NOT NULL CHECK (source IN ('director_chat', 'roadmap_generate'))`
   - `conversation_id uuid`
   - `trace_id uuid`
   - `status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'consumed', 'released_clarification', 'released_failed', 'expired'))`
   - `reserved_at timestamptz NOT NULL DEFAULT now()`
   - `expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')`
   - `settled_at timestamptz`
   - Index `heavy_task_runs_workspace_status_idx ON heavy_task_runs(workspace_id, status, expires_at)`.
   - Enable RLS. Policy `"owner read own heavy runs"` `FOR SELECT TO authenticated USING (workspace_id = auth.uid())`.
   - `REVOKE ALL ON heavy_task_runs FROM PUBLIC, anon, authenticated; GRANT SELECT ON heavy_task_runs TO authenticated; GRANT ALL ON heavy_task_runs TO service_role;`

4. **RPCs (all `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`):**
   - For all `service_role`-only RPCs below, apply `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION ... TO service_role;` (matching `scripts/meta-ads-db-check.sql` so `authenticated` raises `insufficient_privilege`), and if checking role inside the body use `coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role'`.
   - `check_promo_code(p_code text) RETURNS jsonb` (`service_role` only):
     - Normalize `v_code := upper(btrim(coalesce(p_code, '')))`.
     - If empty or not found -> `{ valid: false, reason: 'invalid' }`.
     - If `status = 'revoked'` -> `{ valid: false, reason: 'revoked' }`.
     - If `status = 'redeemed'` -> `{ valid: false, reason: 'used' }`.
     - If `expires_at IS NOT NULL AND expires_at <= now()` -> `{ valid: false, reason: 'expired' }`.
     - If `status = 'reserved' AND reserved_until > now()` -> `{ valid: false, reason: 'used' }`.
     - Otherwise (either `status = 'active'` or expired reservation) -> `{ valid: true, heavyTasksLimit: heavy_tasks_limit }`.
   - `reserve_promo_signup(p_code text, p_phone text, p_reservation_token uuid) RETURNS jsonb` (`service_role` only):
     - Validate `auth.role() = 'service_role'`, non-empty `p_code`, `p_phone`, `p_reservation_token`.
     - Acquire `PERFORM pg_advisory_xact_lock(hashtextextended('promo_phone:' || p_phone, 0));`.
     - Check duplicate phone in `workspace_access WHERE phone_number = p_phone` OR active reserved promo `promo_codes WHERE reserved_phone = p_phone AND status = 'reserved' AND reserved_until > now()`. If found, return `{ ok: false, errorCode: 'PHONE_ALREADY_REGISTERED' }`.
     - `SELECT * INTO v_promo FROM promo_codes WHERE code = upper(btrim(p_code)) FOR UPDATE;`
     - Validate availability (not found -> `'INVALID_PROMO_CODE'`, revoked -> `'PROMO_REVOKED'`, expired -> `'PROMO_EXPIRED'`, redeemed or active non-expired reservation -> `'PROMO_ALREADY_USED'`).
     - Update row: `status = 'reserved', reservation_token = p_reservation_token, reserved_until = now() + interval '2 minutes', reserved_phone = p_phone`.
     - Return `{ ok: true, promoId: v_promo.id, heavyTasksLimit: v_promo.heavy_tasks_limit }`.
   - `release_promo_signup(p_code text, p_reservation_token uuid) RETURNS void` (`service_role` only):
     - `UPDATE promo_codes SET status = 'active', reservation_token = NULL, reserved_until = NULL, reserved_phone = NULL WHERE code = upper(btrim(p_code)) AND status = 'reserved' AND reservation_token = p_reservation_token;`
   - `finalize_promo_signup(p_user_id uuid, p_code text, p_phone text, p_email text, p_reservation_token uuid) RETURNS jsonb` (`service_role` only):
     - Lock `promo_codes` row `FOR UPDATE` matching `code = upper(btrim(p_code)) AND reservation_token = p_reservation_token AND status = 'reserved'`. Raise `'PROMO_RESERVATION_INVALID'` if missing.
     - `INSERT INTO workspaces(id) VALUES (p_user_id) ON CONFLICT (id) DO NOTHING;`
     - `INSERT INTO workspace_settings(workspace_id) VALUES (p_user_id) ON CONFLICT (workspace_id) DO NOTHING;`
     - Update `promo_codes`: `status = 'redeemed', redeemed_by_workspace_id = p_user_id, redeemed_phone = p_phone, redeemed_email = lower(btrim(coalesce(p_email, ''))), redeemed_at = now(), reservation_token = NULL, reserved_until = NULL, reserved_phone = NULL`.
     - Insert into `workspace_access(workspace_id, promo_code_id, phone_number, heavy_tasks_limit, heavy_tasks_used)` values `(p_user_id, v_promo.id, p_phone, v_promo.heavy_tasks_limit, 0)`.
     - Return `{ ok: true, workspaceId: p_user_id, heavyTasksLimit: v_promo.heavy_tasks_limit }`.
   - `get_heavy_task_quota() RETURNS jsonb` (`authenticated` + `service_role`):
     - Reads `workspace_access` for `auth.uid()`. If not found, returns `{ activated: false, limit: 0, used: 0, reserved: 0, remaining: 0 }`.
     - Counts `v_reserved := count(*)` from `heavy_task_runs WHERE workspace_id = auth.uid() AND status = 'reserved' AND expires_at > now()`.
     - Returns `{ activated: true, limit: a.heavy_tasks_limit, used: a.heavy_tasks_used, reserved: v_reserved, remaining: greatest(0, a.heavy_tasks_limit - a.heavy_tasks_used - v_reserved) }`.
   - `reserve_heavy_task(p_workspace_id uuid, p_run_id uuid, p_source text, p_conversation_id uuid DEFAULT NULL, p_trace_id uuid DEFAULT NULL) RETURNS jsonb` (`service_role` only):
     - Validate `auth.role() = 'service_role'` and `p_source IN ('director_chat', 'roadmap_generate')`.
     - Lock `workspace_access` row `FOR UPDATE`. If not found -> return `{ allowed: false, reason: 'NO_WORKSPACE_ACCESS', limit: 0, used: 0, reserved: 0, remaining: 0 }`.
     - Expire stale runs: `UPDATE heavy_task_runs SET status = 'expired', settled_at = now() WHERE workspace_id = p_workspace_id AND status = 'reserved' AND expires_at <= now();`.
     - Count active `reserved` runs. If `a.heavy_tasks_used + v_reserved >= a.heavy_tasks_limit` -> return `{ allowed: false, reason: 'QUOTA_EXHAUSTED', limit: a.heavy_tasks_limit, used: a.heavy_tasks_used, reserved: v_reserved, remaining: 0 }`.
     - `INSERT INTO heavy_task_runs(id, workspace_id, source, conversation_id, trace_id, status) VALUES (p_run_id, p_workspace_id, p_source, p_conversation_id, p_trace_id, 'reserved');`
     - Return `{ allowed: true, runId: p_run_id, limit: a.heavy_tasks_limit, used: a.heavy_tasks_used, reserved: v_reserved + 1, remaining: greatest(0, a.heavy_tasks_limit - a.heavy_tasks_used - v_reserved - 1) }`.
   - `settle_heavy_task(p_workspace_id uuid, p_run_id uuid) RETURNS jsonb` (`service_role` only):
     - Lock `workspace_access` `FOR UPDATE` and `heavy_task_runs` (`id = p_run_id AND workspace_id = p_workspace_id`) `FOR UPDATE`.
     - If already `consumed` -> idempotently return current quota without incrementing again.
     - If `status IN ('reserved', 'expired')` -> update run to `status = 'consumed', settled_at = now()` and `UPDATE workspace_access SET heavy_tasks_used = heavy_tasks_used + 1, updated_at = now() WHERE workspace_id = p_workspace_id RETURNING * INTO a;`.
     - Return updated quota snapshot `{ settled: true, limit, used, reserved, remaining }`.
   - `release_heavy_task(p_workspace_id uuid, p_run_id uuid, p_reason text) RETURNS jsonb` (`service_role` only):
     - Validate `p_reason IN ('released_clarification', 'released_failed')`.
     - `UPDATE heavy_task_runs SET status = p_reason, settled_at = now() WHERE id = p_run_id AND workspace_id = p_workspace_id AND status = 'reserved';`
     - Return updated quota snapshot `{ released: true, limit, used, reserved, remaining }`.

5. **Backfill Existing Workspaces:**
   - `INSERT INTO workspace_access (workspace_id, heavy_tasks_limit, heavy_tasks_used) SELECT id, 6, 0 FROM workspaces ON CONFLICT (workspace_id) DO NOTHING;`
   - **Remember:** Do NOT query `auth.users` columns other than `id` anywhere in this SQL file.

### Sub-agent 1B — Postgres Acceptance Check
**Owned Files (ONLY touch these files):**
- `[NEW] scripts/promo-quota-db-check.sql`
- `[MODIFY] scripts/local-migration-check.mjs` (add `'promo-quota-db-check.sql'` to `checks` array)

**Exact Requirements for `scripts/promo-quota-db-check.sql`:**
Run inside `BEGIN; ... ROLLBACK;` with `\set ON_ERROR_STOP on` (follow the `SET LOCAL ROLE authenticated` / `SET LOCAL ROLE service_role` + `set_config('request.jwt.claim.role', ...)` pattern in `scripts/meta-ads-db-check.sql`):
1. Insert 2 test users in `auth.users(id)`.
2. As `service_role`, insert a promo code `BETA-TEST-0001`, verify `check_promo_code` returns `valid = true`.
3. Verify `reserve_promo_signup` succeeds once and rejects a second concurrent attempt (`PROMO_ALREADY_USED`), and rejects a duplicate phone (`PHONE_ALREADY_REGISTERED`) on a second promo code.
4. Verify `release_promo_signup` restores `'active'`, then `reserve_promo_signup` + `finalize_promo_signup` creates `workspaces`, `workspace_settings`, `workspace_access`, and sets promo `status = 'redeemed'`.
5. Switch `SET LOCAL ROLE authenticated` as User 1:
   - Verify User 1 CANNOT `SELECT` from `promo_codes` (`insufficient_privilege`).
   - Verify User 1 CANNOT `UPDATE` `workspace_access` (`insufficient_privilege`).
   - Verify `get_heavy_task_quota()` returns `{ activated: true, limit: 6, used: 0, reserved: 0, remaining: 6 }`.
   - Verify User 1 CANNOT call `settle_heavy_task` or `release_heavy_task` (`insufficient_privilege`).
6. Switch back to `service_role`:
   - Reserve 1 run → `release_heavy_task(..., 'released_clarification')` → `used` stays `0`, `remaining` returns to `6`.
   - Reserve 1 run → `settle_heavy_task` twice (idempotency check!) → `used` is `1` (NOT `2`).
   - Consume 5 more runs → 6/6 used → next `reserve_heavy_task` returns `allowed = false, reason = 'QUOTA_EXHAUSTED'`.
7. Delete User 1 from `auth.users` → verify cascade deletes `workspace_access` & `heavy_task_runs` cleanly without FK failure, while `promo_codes` row remains `status = 'redeemed'` with `redeemed_by_workspace_id IS NULL`.

### Phase 1 Verification Gate
Run and record exact output in `docs/plans/beta-promo-quota-status.md`:
1. `npm run test:db:local`
2. `npm run lint`
3. `npm run typecheck`
**STOP AFTER PHASE 1.** Wait for Antigravity review & `APPROVED` verdict before touching Phase 2.

---

## Phase 2: Shared Utilities, Feature Flags, Routing & Locale Fixes + Unit Tests

**Dependency:** Phase 1 MUST be `APPROVED` in `docs/plans/beta-promo-quota-status.md`.
**Goal:** Implement phone normalization, auth flags, quota types, fix QR URL `?code=` routing in `proxy.ts` and query-string preservation in `I18nContext.tsx`, and cover phone logic with unit tests.

### Sub-agent 2A — Phone Normalization Utility + Unit Tests
**Owned Files:**
- `[NEW] src/lib/phone.ts`
- `[NEW] tests/unit/phone.test.ts`

**Exact Requirements:**
- `normalizePhone(raw: string): { ok: true; normalized: string } | { ok: false; errorCode: 'REQUIRED' | 'INVALID_PHONE' }`:
  - Convert Arabic-Indic digits (`٠-٩`) and Eastern Arabic digits (`۰-۹`) to ASCII `0-9`.
  - Strip spaces, `-`, `(`, `)`, `.`.
  - Handle Egyptian numbers:
    - `01[0125]\d{8}` → `+20${cleaned.slice(1)}` (e.g. `01012345678` → `+201012345678`)
    - `201[0125]\d{8}` → `+${cleaned}`
    - `00201[0125]\d{8}` → `+${cleaned.slice(2)}`
    - `+201[0125]\d{8}` → valid `+201XXXXXXXXX`
    - Reject malformed Egyptian mobile like `010123` or `01912345678`.
  - Handle general international E.164:
    - Convert leading `00` to `+`.
    - Validate `^\+[1-9]\d{7,14}$` (note: if starts with `+20`, must match `^\+201[0125]\d{8}$` or valid landline? Let's accept Egyptian mobile `+201[0125]\d{8}` and international `^\+[1-9]\d{7,14}$` excluding `+200...`).
- `tests/unit/phone.test.ts`: Test Egyptian `010/011/012/015`, `+20`, `0020`, `201...`, Arabic-Indic digits `٠١٠١٢٣٤٥٦٧٨`, formatting characters `(010) 1234-5678`, international `+971501234567`, empty string, short digits, and letters.

### Sub-agent 2B — Auth Flags, Types & Routing Fixes
**Owned Files:**
- `[NEW] src/lib/authFlags.ts`
- `[MODIFY] src/lib/types.ts`
- `[MODIFY] src/proxy.ts`
- `[MODIFY] src/context/I18nContext.tsx`

**Exact Requirements:**
1. `src/lib/authFlags.ts`:
   - `export function isGoogleAuthEnabled(): boolean { return process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === 'true' }`
   - `export function isBetaInviteOnly(): boolean { return process.env.BETA_INVITE_ONLY !== 'false' }`
2. `src/lib/types.ts`:
   - Export `HeavyTaskQuotaSummary`:
     `{ activated: boolean; limit: number; used: number; reserved: number; remaining: number }`
   - Add optional `heavyTasks?: HeavyTaskQuotaSummary | null` to `WorkspaceSettings`.
3. `src/proxy.ts`:
   - Fix line 29: `if (segment !== 'auth' && !AUTH_ROUTES.test(withoutLocale(pathname)) && request.nextUrl.searchParams.has('code'))`
   - Verify `/signup?code=XYZ`, `/ar/signup?code=XYZ`, `/en/signup?promo=XYZ`, and `/signup?promo=XYZ` all land on `/{locale}/signup?...` WITHOUT redirecting to `/auth/callback`!
   - Keep OAuth PKCE `?code=` redirect working on `/` and other non-auth routes.
4. `src/context/I18nContext.tsx`:
   - In `setLocale`, preserve current search params (`const search = typeof window !== 'undefined' ? window.location.search : ''`) when calling `router.push(localize(cleanPath, next) + search)` so toggling language on `/signup?promo=...` keeps the promo code intact.

### Phase 2 Verification Gate
1. `npm run typecheck`
2. `npm run lint`
3. `npm run test:unit`
**STOP AFTER PHASE 2.** Wait for Antigravity review & `APPROVED` verdict before touching Phase 3.

---

## Phase 3: Server Auth Gate, Promo/Signup APIs, & Auth UI (Google Hiding + QR Pre-Fill + Phone)

**Dependency:** Phase 2 MUST be `APPROVED` in `docs/plans/beta-promo-quota-status.md`.
**Goal:** Enforce invite-only promo + phone registration on server and UI, hide Google OAuth temporarily without deleting it, and support QR URL auto-fill.

### Sub-agent 3A — Server Auth Guard & API Endpoints
**Owned Files:**
- `[NEW] src/app/api/auth/promo/route.ts`
- `[NEW] src/app/api/auth/signup/route.ts`
- `[MODIFY] src/server/auth.ts`
- `[MODIFY] src/app/auth/callback/route.ts`
- `[MODIFY] src/app/api/workspace/route.ts`

**Exact Requirements:**
1. **`GET /api/auth/promo` (`src/app/api/auth/promo/route.ts`):**
   - Rate-limit by IP (e.g., max 30 requests / 60s per IP using an in-memory bounded Map helper, returning `429` if exceeded).
   - Read `code` query param (`url.searchParams.get('code') ?? ''`). If empty/too long, return `{ valid: false, reason: 'invalid' }`.
   - Call `createAdminClient().rpc('check_promo_code', { p_code: code })`. Return `200` JSON `{ valid, reason?, heavyTasksLimit? }` with zero user PII.
2. **`POST /api/auth/signup` (`src/app/api/auth/signup/route.ts`):**
   - Rate-limit by IP (e.g., max 10 requests / 10 min per IP).
   - Validate body with Zod: `email` (valid email), `password` (min 8, max 128), `phone` (string), `promoCode` (string).
   - Normalize phone using `normalizePhone(body.phone)`. If `!ok`, return `400` `{ error: 'Invalid phone number.', code: 'INVALID_PHONE' }`.
   - Normalize promo code `promoCode.trim().toUpperCase()`. If empty, return `400` `{ error: 'Promo code is required.', code: 'INVALID_PROMO_CODE' }`.
   - Execute two-phase atomic signup via `admin = createAdminClient()`:
     1. `reservationToken = crypto.randomUUID()` → call `admin.rpc('reserve_promo_signup', { p_code: normalizedCode, p_phone: normalizedPhone, p_reservation_token: reservationToken })`. If `!data.ok`, return `409`/`400` with `{ error: ..., code: data.errorCode }`.
     2. Create auth user: `admin.auth.admin.createUser({ email: normalizedEmail, password: body.password, email_confirm: true, user_metadata: { phone_number: normalizedPhone } })`.
        - If `createError` (e.g. duplicate email): ALWAYS call `admin.rpc('release_promo_signup', { p_code: normalizedCode, p_reservation_token: reservationToken })` in rollback! Return `409` `{ error: 'Email already registered.', code: 'EMAIL_ALREADY_EXISTS' }` (or `400` for password/auth rejection).
     3. Finalize DB state: call `admin.rpc('finalize_promo_signup', { p_user_id: createdUser.id, p_code: normalizedCode, p_phone: normalizedPhone, p_email: normalizedEmail, p_reservation_token: reservationToken })`.
        - If finalize fails: call `admin.auth.admin.deleteUser(createdUser.id)` AND `admin.rpc('release_promo_signup', ...)`, then return `500`.
     4. Create SSR session cookies: call `const serverSupabase = await createServerSupabase(); await serverSupabase.auth.signInWithPassword({ email: normalizedEmail, password: body.password })`. Return `201` `{ ok: true, redirectTo: '/onboarding' }`.
3. **`src/server/auth.ts`:**
   - Add `hasActivatedWorkspaceAccess(userId: string, email?: string | null): Promise<boolean>`:
     - If `!isBetaInviteOnly()` return `true`.
     - If `isAdminUser({ id: userId, email: email ?? null })` return `true`.
     - Check `workspace_access` via `createAdminClient().from('workspace_access').select('workspace_id').eq('workspace_id', userId).maybeSingle()`. Return `Boolean(data?.workspace_id)`.
   - Enforce in `requireWorkspace()`: if `!(await hasActivatedWorkspaceAccess(identity.user.id, identity.user.email))`, redirect to `localizePath('/signin?error=invite_required', await getRequestLocale())`.
   - Enforce in `requireApiIdentity()`: if `!(await hasActivatedWorkspaceAccess(identity.user.id, identity.user.email))`, throw `Response.json({ error: 'Beta invite required.', code: 'INVITE_REQUIRED' }, { status: 403 })`.
4. **`src/app/auth/callback/route.ts`:**
   - After `exchangeCodeForSession` and `getUser()`, when `isBetaInviteOnly() || !isGoogleAuthEnabled()`:
     - Check `hasActivatedWorkspaceAccess(user.id, user.email)`.
     - If false: `await supabase.auth.signOut()`; check if user has no `workspaces` row (`createAdminClient().from('workspaces').select('id').eq('id', user.id).maybeSingle()`) and if none, delete the unintended OAuth-created `auth.users` row (`admin.auth.admin.deleteUser(user.id)`), then redirect to `localized('/signin') + '?error=invite_required'`.
5. **`src/app/api/workspace/route.ts`:**
   - Call `supabase.rpc('get_heavy_task_quota')` (or `getWorkspaceHeavyQuota(user.id)`) and include `heavyTasks` in the JSON response alongside `managedModel`.

### Sub-agent 3B — Auth UI (`SignUp`, `SignIn`, `AuthLayout`, Dictionaries)
**Owned Files:**
- `[MODIFY] src/components/auth/AuthLayout.tsx`
- `[MODIFY] src/screens/auth/SignUp.tsx`
- `[MODIFY] src/screens/auth/SignIn.tsx`
- `[MODIFY] src/app/[lang]/dictionaries/ar.json`
- `[MODIFY] src/app/[lang]/dictionaries/en.json`

**Exact Requirements:**
1. **`AuthLayout.tsx`:**
   - In `AuthField`, treat `type === 'tel'` as `dir="ltr"` with `text-left placeholder:text-start`, add optional `autoComplete`, `disabled`, `readOnly`, and optional helper/status element without breaking existing `SignIn`, `ResetPassword`, or `NewPassword` callers.
2. **`SignUp.tsx`:**
   - Hide Google OAuth cleanly: render `<GoogleButton />` ONLY if `isGoogleAuthEnabled()` is `true` (do NOT modify or delete `src/components/auth/GoogleButton.tsx`).
   - Read `searchParams.get('promo') ?? searchParams.get('code') ?? ''` via `useSearchParams()`.
   - Maintain `promoCode`, `phone`, `email`, `password` state:
     - Pre-fill `promoCode` from URL (`trim().toUpperCase()`).
     - Auto-validate when arrived via URL (or on blur/manual check) via `GET /api/auth/promo?code=...` and show a concise status pill (`valid` green badge vs `used/invalid/expired/revoked` warning). Keep the field editable so users without QR URL can type their code, or edit if needed.
     - Validate phone client-side with `normalizePhone(phone)` before submitting.
     - Submit via `fetch('/api/auth/signup', { method: 'POST', ... })`, handle all error codes (`INVALID_PROMO_CODE`, `PROMO_ALREADY_USED`, `PROMO_EXPIRED`, `PROMO_REVOKED`, `PHONE_ALREADY_REGISTERED`, `INVALID_PHONE`, `EMAIL_ALREADY_EXISTS`) with localized messages, and on `201` call `await refreshSettings()` (from `useAuth()`) then `router.replace('/onboarding'); router.refresh()`.
3. **`SignIn.tsx`:**
   - Conditionally render `<GoogleButton />` ONLY if `isGoogleAuthEnabled()` is `true`.
   - Show localized alert when `params.get('error') === 'invite_required'`.
4. **`ar.json` & `en.json`:**
   - Add matching keys under `"app"` for:
     - `promoCode`, `promoCodePlaceholder`, `promoCodeRequired`, `promoCodeChecking`, `promoCodeValid` (e.g. `كود الدعوة صالح · يشمل {limit} مهام متقدمة`), `promoCodeInvalid`, `promoCodeUsed`, `promoCodeExpired`, `promoCodeRevoked`, `inviteRequiredError`
     - `phoneNumber`, `phonePlaceholder`, `phoneInvalid`, `phoneAlreadyRegistered`, `emailAlreadyExists`
     - `heavyTasksRemaining` (`المهام المتقدمة: {remaining} / {limit}` / `Heavy tasks: {remaining} / {limit}`), `orchestratorUnlimitedHint` (`أسئلة الشات العامة والـ Business Brain غير محدودة` / `General chat & Business Brain Q&A are unlimited`), `heavyTasksExhaustedTitle`, `heavyTasksExhaustedBody`, `roadmapQuotaExhausted`

### Phase 3 Verification Gate
1. `npm run typecheck`
2. `npm run lint`
3. `npm run test:unit`
4. `npm run build`
**STOP AFTER PHASE 3.** Wait for Antigravity review & `APPROVED` verdict before touching Phase 4.

---

## Phase 4: Heavy-Task Quota Enforcement (`Orchestrator -> Director` + `Roadmap Generate`), UI Counters & Unit Tests

**Dependency:** Phase 3 MUST be `APPROVED` in `docs/plans/beta-promo-quota-status.md`.
**Goal:** Enforce the 6-heavy-task limit across `delegate_to_director` and `POST /api/roadmap/generate` using atomic reserve/settle/release, leave Orchestrator & `Ask Director` unlimited, surface live counters in UI, and add full mocked unit tests.

### Sub-agent 4A — Heavy Task Quota Engine, Orchestrator/Roadmap Gates & Unit Tests
**Owned Files:**
- `[NEW] src/server/quota/heavy-tasks.ts`
- `[MODIFY] src/server/employee/run-state.ts`
- `[MODIFY] src/server/employee/agents/orchestrator.ts`
- `[MODIFY] src/server/employee/reply.ts`
- `[MODIFY] src/app/api/employee/chat/route.ts`
- `[MODIFY] src/app/api/roadmap/generate/route.ts`
- `[NEW] tests/unit/heavy-task-quota.test.ts`

**Exact Requirements:**
1. **`src/server/quota/heavy-tasks.ts`:**
   - `classifyDirectorOutcome(result: DirectorOutput): 'consume' | 'released_clarification' | 'released_failed'`:
     - `'consume'` if `result.deliverables.length > 0 || result.drafts.length > 0 || result.brainProposals.length > 0` OR (`result.status === 'completed' && !result.clarification && result.text.trim().length > 0`).
     - `'released_clarification'` if `result.clarification !== null`.
     - `'released_failed'` otherwise.
   - Define `HeavyTaskGate` interface (`getQuota`, `reserve`, `settle`, `release`) and implement `createSupabaseHeavyTaskGate(workspaceId: string)` using `createAdminClient()` RPCs (`get_heavy_task_quota`, `reserve_heavy_task`, `settle_heavy_task`, `release_heavy_task`).
   - Note: If `isAdminUser` or `!isBetaInviteOnly()`? Wait — even admins who want to test should still see valid quota if they have a `workspace_access` row, OR let `createSupabaseHeavyTaskGate` enforce `workspace_access` uniformly for all users (admins can grant themselves extra tasks via `npm run promo -- grant`!). Keeping behavior uniform avoids hidden bypasses.
2. **`src/server/employee/run-state.ts`:**
   - Add `quotaExhausted?: boolean` and `heavyTasks?: HeavyTaskQuotaSummary` to `EmployeeRunState` (default `quotaExhausted: false`).
3. **`src/server/employee/agents/orchestrator.ts`:**
   - Add optional `heavyTaskGate?: HeavyTaskGate` and `heavyTasksRemaining?: number | null` to `RunOrchestratorOptions`.
   - Do **NOT** modify `ORCHESTRATOR_TOOL_NAMES` or `ROLE_TOOL_ALLOWLIST.orchestrator`.
   - In `buildOrchestratorSystemPrompt(heavyTasksRemaining?: number | null)`: if `heavyTasksRemaining === 0`, append a concise runtime note telling the Orchestrator that this workspace has `0` heavy tasks left so it must still answer direct/Business Brain questions normally, and if the user asks for a marketing task requiring delegation, inform them honestly that their 6 beta heavy tasks are used up.
   - Inside `runDirector` callback inside `runOrchestrator`:
     1. If `options.heavyTaskGate` is set, call `const reservation = await options.heavyTaskGate.reserve({ source: 'director_chat', conversationId: options.conversationId ?? null, traceId: options.traceContext.traceId })`.
     2. If `!reservation.allowed`:
        - Set `structured.quotaExhausted = true` and `structured.heavyTasks = reservation.quota`.
        - Return an unavailable `DirectorOutput` (`status: 'partial'`, `stopReason: 'error'`, empty deliverables/drafts) AND inside `summarizeDirectorResult` or the tool return object in `orchestrator.ts` / `orchestrator-tools.ts`, wait: `createOrchestratorToolDefinitions` wraps `deps.runDirector` and returns `summarizeDirectorResult(result)`. If `result.text` contains a clear system signal OR if `structured.quotaExhausted` is checked in `orchestrator.ts` / `reply.ts`, make sure the Orchestrator LLM sees `{ status: 'quota_exhausted', ... }` or a clear message `"QUOTA_EXHAUSTED: 0 of 6 heavy tasks remaining. Do NOT retry delegate_to_director. Inform the owner politely in their language that all 6 beta heavy tasks have been used up, while general chat and Business Brain questions remain unlimited."` so the model immediately responds honestly without retrying `delegate_to_director`!
     3. If `reservation.allowed`:
        - Execute `runDirector(...)` inside `try / catch`:
          - On return: `const decision = classifyDirectorOutcome(directorResult)` → if `'consume'` call `await options.heavyTaskGate.settle(reservation.runId)`; else call `await options.heavyTaskGate.release(reservation.runId, decision)`.
          - On thrown error: call `await options.heavyTaskGate.release(reservation.runId, 'released_failed')` and rethrow.
4. **`src/server/employee/reply.ts`:**
   - In `ensureNonEmptyReply`: if `state.quotaExhausted` is true and model prose is empty, return a clear Arabic/English message explaining that the 6 beta heavy tasks have been used up while normal chat and Business Brain Q&A remain unlimited.
5. **`src/app/api/employee/chat/route.ts`:**
   - Instantiate `const heavyTaskGate = createSupabaseHeavyTaskGate(workspaceId)` and fetch `const initialQuota = await heavyTaskGate.getQuota()`.
   - Pass `heavyTaskGate` and `heavyTasksRemaining: initialQuota.remaining` to `runOrchestrator(...)`.
   - Fetch `const updatedQuota = await heavyTaskGate.getQuota()` after `runOrchestrator` finishes and include `heavyTasks: updatedQuota` + `quotaExhausted: result.structured.quotaExhausted === true` in both JSON response and SSE `done` event payload.
6. **`src/app/api/roadmap/generate/route.ts`:**
   - Instantiate `const heavyTaskGate = createSupabaseHeavyTaskGate(user.id)`.
   - Before calling `generateRoadmapPlan`, call `const reservation = await heavyTaskGate.reserve({ source: 'roadmap_generate' })`.
   - If `!reservation.allowed`: return `Response.json({ error: 'All 6 beta heavy tasks have been used.', code: 'HEAVY_TASK_QUOTA_EXHAUSTED', quota: reservation.quota }, { status: 403 })`.
   - Wrap `generateRoadmapPlan` + `create_generated_roadmap` RPC in `try / catch`:
     - Only after `create_generated_roadmap` succeeds without error, call `const settled = await heavyTaskGate.settle(reservation.runId)`.
     - On ANY error (LLM generation error, validation error, RPC error), call `await heavyTaskGate.release(reservation.runId, 'released_failed')` in `catch` before rethrowing.
   - Return `heavyTasks: settled` in the `200` JSON response.
   - Do **NOT** modify `/api/roadmap/ask-director/route.ts` (remains free/unlimited per spec!).
7. **`tests/unit/heavy-task-quota.test.ts` (0 live API calls):**
   - Test `classifyDirectorOutcome` across all combinations (deliverable, draft, brainProposal, completed text, clarification card, partial/failed empty).
   - Test `runOrchestrator` with fake `runTurn` + in-memory `HeavyTaskGate`:
     - Direct Orchestrator Q&A / Brain tool → `reserve` called `0` times.
     - Director returns `ask_clarification` → `reserve` called once, `release('released_clarification')` called once, `settle` called `0` times, remaining stays unchanged.
     - Follow-up answering clarification produces deliverable → `settle` called once, remaining decrements by `1`.
     - Director fails/throws → `release('released_failed')` called once, remaining stays unchanged.
     - When `remaining === 0`, `delegate_to_director` blocks `runDirector` completely and sets `structured.quotaExhausted = true` while direct Orchestrator Q&A still succeeds.

### Sub-agent 4B — UI Quota Badges, Live Sync & Exhausted Banners
**Owned Files:**
- `[MODIFY] src/context/AuthContext.tsx`
- `[MODIFY] src/components/AppShell.tsx`
- `[MODIFY] src/screens/EmployeePage.tsx`
- `[MODIFY] src/features/roadmap/api.ts`
- `[MODIFY] src/features/roadmap/DiscoveryWizard.tsx`

**Exact Requirements:**
1. `AuthContext.tsx`:
   - Track `heavyTasks: HeavyTaskQuotaSummary | null` (initialized from `initial?.settings?.heavyTasks ?? null` and updated by `refreshSettings()` from `/api/workspace`, plus expose `setHeavyTasks` or rely on `refreshSettings`).
2. `AppShell.tsx`:
   - Display a compact, readable quota badge in the sidebar (and mobile drawer) showing `{remaining} / {limit}` heavy tasks left with an explicit hint that general chat is unlimited.
3. `EmployeePage.tsx`:
   - Read `heavyTasks` from JSON / SSE `done` responses and update `useAuth()` (via `setHeavyTasks` / `refreshSettings`).
   - Show a clean quota pill in the chat workspace and a clear warning banner when `remaining === 0` ("All 6 heavy tasks used — general & Business Brain Q&A remain unlimited").
4. `src/features/roadmap/api.ts` & `src/features/roadmap/DiscoveryWizard.tsx`:
   - Preserve `code` (`HEAVY_TASK_QUOTA_EXHAUSTED`) on thrown error from `generateRoadmap`.
   - Disable "Generate Roadmap" / "Regenerate" button cleanly when `heavyTasks?.remaining === 0` with localized notice, and call `refreshSettings()` after successful generation (or 403) so the UI badge stays synced. Leave `Ask Director` button untouched and active!

### Phase 4 Verification Gate
1. `npm run typecheck`
2. `npm run lint`
3. `npm run test:unit`
4. `npm run build`
**STOP AFTER PHASE 4.** Wait for Antigravity review & `APPROVED` verdict before touching Phase 5.

---

## Phase 5: Local Promo/QR CLI Script & E2E Test Alignment

**Dependency:** Phase 4 MUST be `APPROVED` in `docs/plans/beta-promo-quota-status.md`.
**Goal:** Deliver the standalone CLI script for generating single-use promo codes & QR assets, and update Playwright E2E tests to exercise the new signup/QR/phone/quota flow.

### Sub-agent 5A — CLI Script & QR Package
**Owned Files:**
- `[MODIFY] package.json`
- `[NEW] scripts/promo-codes.ts`

**Exact Requirements:**
1. Install `qrcode` (`dependencies` or `devDependencies`, e.g., `npm install qrcode` and `npm install -D @types/qrcode`) and add `"promo": "tsx scripts/promo-codes.ts"` to `package.json`.
2. `scripts/promo-codes.ts` (must NOT import `'server-only'`):
   - Reads `.env` / environment for `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`).
   - Supports subcommands:
     - `generate`: `--count <n>` (default 10), `--prefix <str>` (default `BUSM`), `--limit <n>` (default 6), `--base-url <url>` (default `http://localhost:3000`), `--locale <ar|en>` (default `ar`), `--batch <label>`, `--expires-days <n>`, `--out <dir>` (default `.scratch/promo-qr/<timestamp>`).
       - Generates unambiguous random codes (e.g. `BUSM-7K9P-3M4X` from alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`).
       - Inserts into `promo_codes`.
       - Builds URL `${baseUrl}/${locale}/signup?promo=${code}`.
       - Writes QR PNG image per code (`<out>/<CODE>.png`), `codes.csv`, and a clean printable/shareable `cards.html` containing each QR image, promo code, and signup URL.
     - `list`: `--status <active|reserved|redeemed|revoked|all>`, `--batch <label>` — prints formatted table showing `code`, `status`, `redeemed_email`, `redeemed_phone`, and `used / limit`.
     - `revoke`: `--code <CODE>` — revokes an unredeemed code (`status = 'revoked'`).
     - `grant`: `--email <email>` OR `--phone <phone>`, `--extra <n>` — adds extra `heavy_tasks_limit` to an existing user's `workspace_access`.
   - `--help` prints clear usage without requiring DB connection.

### Sub-agent 5B — E2E Helpers & Specs
**Owned Files:**
- `[MODIFY] e2e/support/accounts.ts`
- `[MODIFY] e2e/support/browser.ts`
- `[MODIFY] e2e/specs/01-auth-database.spec.ts`

**Exact Requirements:**
1. Update `e2e/support/accounts.ts`:
   - `createAccount` generates a valid unique phone number (e.g. `+2010...` derived uniquely per run) and inserts a one-time promo code using `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` (or admin helper), then signs up via `POST /api/auth/signup` (or calls `finalize_promo_signup` + `signUp`) so every test account has valid `workspace_access`!
2. Update `e2e/support/browser.ts`:
   - `registerThroughUi(page, { email, password, phone, promoCode, viaQrUrl })`: visits `/signup?promo=${promoCode}` (when `viaQrUrl` is true, asserts the promo field is auto-filled!), fills phone, email, password, submits, and waits for `/onboarding`.
3. Update `e2e/specs/01-auth-database.spec.ts`:
   - Verify Google button is hidden on `/signin` and `/signup`.
   - Verify QR URL `/signup?promo=...` auto-fills the code, registers with phone + email + password, and persists `workspace_access` (`heavy_tasks_limit = 6`, `heavy_tasks_used = 0`).
   - Verify attempting to reuse the same promo code OR register with the same phone number on a second account is rejected cleanly.

### Phase 5 Final Verification Gate
1. `npm run typecheck`
2. `npm run lint`
3. `npm run test:unit`
4. `npm run test:db:local`
5. `npm run build`
6. `npm run promo -- --help`
7. `npm run test:e2e` (if local Supabase E2E environment is configured; otherwise report exact environment requirement)
**STOP AFTER PHASE 5.** Report final verification output in `docs/plans/beta-promo-quota-status.md`.
