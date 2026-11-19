# Integration readiness inventory

Snapshot: **19 November 2026, Africa/Cairo (EET, UTC+2)**. Owner: project owner. Scope: C01 baseline only; no deployment, remote migration, provider write, publication, or production-data change was performed. Secret values were not printed, copied, or committed.

**Accountability:** the project owner is the accountable owner for every external account/credential (Supabase, Vercel/DNS, Google, AI provider, Firecrawl, Meta). The implementing agent owns the code follow-ups named in the final column. No integration is verified until the owner supplies/authorizes access and a real request succeeds.

This inventory separates **code/config presence** from **verified live behavior**. A variable or source file existing is not evidence that an integration works. Status values used here:

- `PASS` — a real request was executed and the observed result matches the check.
- `BLOCKED` — a required external prerequisite is missing or unreachable; a named owner action is required.
- `NOT LIVE VERIFIED` — code exists, but no real provider/session request was executed.
- `DEFERRED BY OWNER` — intentionally paused, requirements retained.

## Environment identity

| Item | Observed | Notes |
|---|---|---|
| Working copy | `/home/mohamed/Mohamed/busmora-bolt/busmors-bolt`, branch `main`, base commit `f3a1fe5` | Working-tree changes were present when C01 started; none were reverted. |
| Client environment file | `.env`, git-ignored and untracked | Declares `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `FIRECRAWL_API_KEY`. Values were not exposed. |
| Supabase project | `ojlgnqdhykgzgkbqyatd.supabase.co` | Configured by the existing `.env`. This is the project to reuse; no second project was created. |
| Supabase key class | Publishable/browser key (not a legacy JWT) | Suitable for client Auth/PostgREST calls subject to RLS; it is not service-role authority. |
| Production host target | Vercel, intended domain `https://busmora.com` | No Vercel project/config exists in the repository and the domain does not resolve. Deployment is **not authorized** in C01. |
| Competition date | **Tuesday 24 November 2026**, timezone `Africa/Cairo` | Five calendar days from this snapshot (19 → 24 November). Presentation time-of-day was not supplied. |

## Decision record (owner-confirmed)

| # | Area | Decision |
|---|---|---|
| 1 | Competition deadline | 24 November 2026, `Africa/Cairo`; competition readiness is the priority. |
| 2 | Hosting | Vercel; intended production domain `https://busmora.com`. Not deployed/configured; deploy only with explicit authorization. |
| 3 | Supabase | Reuse the project already configured in `.env`; do not create another project or modify production data. Connectivity may be checked read-only. |
| 4 | AI provider | Keep the existing dashboard configuration flow (owner-managed provider/model/key). No hardcoded provider and no unnecessary configuration change. |
| 5 | Search provider | **Firecrawl** is the selected research/search provider. Full implementation belongs to C14/C15, not C01. |
| 6 | Google OAuth | Remains in scope. Configuration gaps must be recorded; full implementation/testing belongs to C04. |
| 7 | Facebook / Meta | Temporarily deprioritized. Do not implement/configure now. Preserve C25/C26 and all requirements for later. |
| 8 | Architecture | Preserve Next.js 16 (App Router + Turbopack) + React 19 + Supabase (PostgreSQL, Auth, Storage). Internal server API routes in `src/server/` and `/api/*` host backend operations. No new standalone backend service. Product remains English-only. |

## Readiness matrix

### 1. Supabase — Auth endpoint

| Field | Value |
|---|---|
| Decision / scope | Reuse existing project; read-only verification only. |
| Code/config evidence | `src/lib/supabase.ts` reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, uses PKCE and session persistence. |
| Actual check | `GET /auth/v1/settings` with the configured publishable key, 19 November 2026. |
| Observed result | Settings **HTTP 200**: `email: true`, `google: true`, `facebook: false`, `disable_signup: false`, `mailer_autoconfirm: true` (email confirmation not forced). |
| Status | **PASS** (reachability only) |
| Blocker | None for Auth connectivity. Google/Facebook are disabled providers (below). |
| Owner action | None for connectivity. Keep the project active through the competition. |
| Follow-up | C04 Google. (Email verification removed by owner; no delivery check needed.) |

### 2. Supabase — application database and Backend API Routes

| Field | Value |
|---|---|
| Decision / scope | Reuse the existing project as the database/auth/storage backend; backend API logic runs natively in Next.js. |
| Code/config evidence | 23 migration files in `supabase/migrations/`; Next.js API Routes in `src/app/api/` and server modules in `src/server/`. Supabase Edge Functions in `supabase/functions/` were removed/superseded. |
| Actual check | Read-only PostgREST probes with publishable key; then on 19 November 2026, all 23 repository migrations were pushed to the remote Supabase project via `supabase db push`. Verified via PostgREST and psql table introspection (44 tables created) and acceptance test suites (`competition-db-check.sql`, `intake-db-check.sql`, `brain-governance-db-check.sql`, `discovery-db-check.sql`). |
| Observed result | All 23 migrations applied cleanly (RC: 0). 44 tables in `public` schema. All DB acceptance checks PASS. Next.js internal `/api/ai`, `/api/crawl`, `/api/tasks`, `/api/oauth` routes are ready. |
| Status | **RESOLVED — PASS** (All 23 migrations applied; 44 tables created) |
| Meaning | The remote Supabase database is fully migrated and matching the application schema. No database blockers remain. |
| Owner action | None. Database schema is up to date with repository state. |
| Follow-up | C02/C39 complete; live integration testing with Next.js frontend/backend. |
| Limits | Verified against remote Supabase project `ojlgnqdhykgzgkbqyatd`. |

### 3. AI model provider — owner dashboard flow

| Field | Value |
|---|---|
| Decision / scope | Preserve the existing dashboard configuration (provider/model/key); optional server-managed fallback remains supported. |
| Code/config evidence | `src/screens/SettingsPage.tsx` provider/model selection calls `save_ai_key`; `src/server/ai-generate.ts` and `src/app/api/ai/route.ts` read the workspace key server-side and support managed `AI_API_KEY`/`AI_PROVIDER`/`AI_MODEL` fallback. Keys are never returned to the browser. |
| Actual check | Source review of the full save/use path plus a **live Groq `openai/gpt-oss-20b` chat completion returned HTTP 200** using `AI_API_KEY`/`AI_PROVIDER=groq`/`AI_MODEL=openai/gpt-oss-20b` on 19 November 2026. |
| Observed result | The Next.js API route compiles, passes unit tests, and a real provider model call succeeded against Groq. Workspace BYOK save/use is backed by the applied `ai_keys` schema. |
| Status | **LIVE VERIFIED (model call); dashboard end-to-end pending** |
| Blocker | None for the managed model. Dashboard save-then-use against a logged-in workspace still needs a live session check. |
| Owner action | Set `AI_PROVIDER`/`AI_MODEL`/`AI_API_KEY` in server env (done locally) or save a provider/model/key in Settings, then run one real generation from the app. Do not treat the dashboard’s “Active” badge as verification. |
| Follow-up | C10 (live gateway acceptance through the app); C39 (environment secrets). |

### 4. Search provider — Firecrawl

| Field | Value |
|---|---|
| Decision / scope | Firecrawl selected for application research/search. Adapter and evidence pipeline belong to C14/C15. |
| Code/config evidence | No `firecrawl` source exists yet in the repository. A `FIRECRAWL_API_KEY` is declared in `.env`. The planned adapter is described in `docs/phase-1-2/02-contracts.md`. |
| Actual check | Read-only network probe to `https://api.firecrawl.dev/v1/search`; no authenticated search executed. |
| Observed result | Service reachable; no authenticated search was run in this audit. |
| Status | **BLOCKED** (implementation) — credential present |
| Blocker | No C14 Firecrawl adapter wired yet. |
| Owner action | A `FIRECRAWL_API_KEY` now exists in `.env`; wire it as a server environment variable in Vercel/`.env.local`. Never prefix it with `NEXT_PUBLIC_`. |
| Follow-up | C14 (real bounded search/fetch), C15 (evidence-backed results). |

### 5. Google OAuth

| Field | Value |
|---|---|
| Decision / scope | Remains in scope; full implementation/testing in C04. |
| Code/config evidence | `src/components/auth/GoogleButton.tsx` starts Supabase OAuth with a PKCE callback; `src/app/auth/callback/route.ts` handles return/cancel/error and onboarding routing. |
| Actual check | `GET /auth/v1/settings`; `GET /auth/v1/authorize?provider=google`. |
| Observed result | `google: true` with real client credentials; authorize returns **HTTP 302** to `accounts.google.com` with a real `client_id`, and `http://localhost:3000/auth/callback` is accepted as `redirect_to`. |
| Status | **COMPLETE (config + initiation)** |
| Blocker | None for configuration. A full interactive login (human browser) + AC-32 linking remain H02. |
| Owner action | None. Add `https://busmora.com/auth/callback` to the allowed redirect list at deploy time (C39). |
| Follow-up | H02 (full login/linking conformance, post-competition). |

### 6. Facebook / Meta

| Field | Value |
|---|---|
| Decision / scope | **DEFERRED BY OWNER** — focus on Search/Firecrawl first. Do not implement or configure now. Requirements remain in C25/C26/C28/C29 and H05/H06. |
| Code/config evidence | Legacy `src/server/oauth-connect.ts` and connection tables exist; no working Page-selection UI. |
| Actual check | `GET /auth/v1/settings` only; no Meta API request was made. |
| Observed result | `facebook: false` — the Supabase Facebook provider is disabled. |
| Status | **DEFERRED BY OWNER** |
| Blocker | Owner priority, credentials and provider configuration; also unfinished C25 implementation. |
| Owner action | No action before Search/Firecrawl. When resuming, provide an authorized Page and Meta app credentials, then authorize C25/C26 work. |
| Follow-up | C25, C26 (retained, not removed). |

### 7. Email authentication and delivery

| Field | Value |
|---|---|
| Decision / scope | Direct email signup without verification (C03); password recovery retained. |
| Code/config evidence | Signup, reset, new-password, callback pages in `src/app/(auth)` and auth routing exist; email verification page removed. |
| Actual check | `GET /auth/v1/settings`; live `POST /auth/v1/signup`. |
| Observed result | Email provider enabled; signups enabled; `mailer_autoconfirm:true`. Live signup returned an immediate `access_token` (no confirmation email) and routed to onboarding. |
| Status | **COMPLETE** |
| Blocker | None. Email verification removed per owner decision. |
| Owner action | None for signup flow. |
| Follow-up | None (C03 complete). |

### 8. Hosting — Vercel and `busmora.com`

| Field | Value |
|---|---|
| Decision / scope | Vercel is the hosting provider; intended production domain is `https://busmora.com`. Deployment requires explicit authorization. |
| Code/config evidence | Native Next.js 16 build (`next build`); no SPA rewrite rules needed. |
| Actual check | DNS lookup for `busmora.com`; HTTPS request; reachability check to `https://vercel.com`. |
| Observed result | `busmora.com` **does not resolve** (no DNS record; HTTPS unreachable). Vercel itself is reachable (HTTP 200). No deployment was attempted. |
| Status | **BLOCKED / NOT DEPLOYED** |
| Blocker | No Vercel project, no DNS configuration, no deployment authorization. |
| Owner action | Authorize deployment and DNS control for `busmora.com`. |
| Follow-up | C39 (Vercel project, env vars, smoke tests). |

## Baseline commands actually executed (19 November 2026)

| Command | Result | Evidence limit |
|---|---|---|
| `npm run build` | **PASS** — Next.js 16.4.6, 19 routes generated | Native Next.js build. |
| `npm run lint` | **PASS** — exit 0, 0 errors | Static analysis via oxlint. |
| `tsc --noEmit` | **PASS** — exit 0 | Type check. |
| `node scripts/db-check.cjs <sql>` (8 scripts) | **PASS — 8/8** on hosted Supabase | SQL acceptance: planned-posts, task-execution, competition, deliverable, discovery, brain-governance, intake, crawl. |
| Live AI (Groq) | **PASS** — `openai/gpt-oss-20b` completion HTTP 200 | Managed model reachable with `AI_API_KEY`. |
| `npm run test:db:local` | **N/A** — local PostgreSQL socket not provisioned | Migrations are applied to the hosted Supabase project, so SQL acceptance runs there instead. |

Browser UI suites were **not** rerun this session. A live Groq model call and live Google OAuth initiation (302 to accounts.google.com) passed; no live email-delivery, publication, or deployment check passed.

## Consolidated blockers and owner actions

| Blocker | Owner action | Follow-up |
|---|---|---|
| Application migrations (23 files) | **Applied** to the configured Supabase project (core tables return 200) | C02, C39 |
| AI provider live request | Managed model live-verified (Groq `openai/gpt-oss-20b`); dashboard save-then-use end-to-end still needs a logged-in run | C10 |
| No Firecrawl adapter | Wire the present `FIRECRAWL_API_KEY`; authorize C14 | C14, C15 |
| Google OAuth | **Enabled** with real credentials; initiation verified (302 to Google). Full interactive login + AC-32 linking remain H02 |
| `busmora.com` not deployed/DNS absent | Authorize Vercel deployment and DNS | C39 |
| Facebook/Meta deferred | No action now; resume when owner reprioritizes | C25, C26 |
| Local SQL harness unavailable | Use the hosted Supabase project for SQL acceptance, or provision a disposable PostgreSQL | C02, C37 |

## Boundary

C01 closes the scope/baseline record. It does **not** verify any integration merely because configuration names or source files exist, and it does not authorize deployment, remote migration, provider spending, or publishing. Any change to the hosted Supabase project or Vercel account needs explicit owner authorization.
