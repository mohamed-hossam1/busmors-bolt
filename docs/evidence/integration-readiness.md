# Integration readiness inventory

Snapshot: **19 November 2026, Africa/Cairo (EET, UTC+2)**. Owner: project owner. Scope: C01 baseline only; no deployment, remote migration, provider write, publication, or production-data change was performed. Secret values were not printed, copied, or committed.

This inventory separates **code/config presence** from **verified live behavior**. A variable or source file existing is not evidence that an integration works. Status values used here:

- `PASS` — a real request was executed and the observed result matches the check.
- `BLOCKED` — a required external prerequisite is missing or unreachable; a named owner action is required.
- `NOT LIVE VERIFIED` — code exists, but no real provider/session request was executed.
- `DEFERRED BY OWNER` — intentionally paused, requirements retained.

## Environment identity

| Item | Observed | Notes |
|---|---|---|
| Working copy | `/home/mohamed/Mohamed/busmora-bolt/busmors-bolt`, branch `main`, base commit `f3a1fe5` | 195 changed paths were present when C01 started; none were reverted. |
| Client environment file | `.env`, git-ignored and untracked | Contains exactly two variable names: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Values were not exposed. |
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
| 8 | Architecture | Preserve React/Vite + Supabase PostgreSQL/Auth/Storage/Edge Functions. No new backend. Product remains English-only. |

## Readiness matrix

### 1. Supabase — Auth endpoint

| Field | Value |
|---|---|
| Decision / scope | Reuse existing project; read-only verification only. |
| Code/config evidence | `src/lib/supabase.ts` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, uses PKCE and session persistence. |
| Actual check | `GET /auth/v1/health` and `GET /auth/v1/settings` with the configured publishable key, 19 November 2026. |
| Observed result | Health **HTTP 200** (`GoTrue`, API `v2.198.0`). Settings **HTTP 200**: `email: true`, `google: false`, `facebook: false`, `disable_signup: false`, `mailer_autoconfirm: false` (email confirmation required). |
| Status | **PASS** (reachability only) |
| Blocker | None for Auth connectivity. Google/Facebook are disabled providers (below). |
| Owner action | None for connectivity. Keep the project active through the competition. |
| Follow-up | C03 real email delivery; C04 Google. |

### 2. Supabase — application database and Edge Functions

| Field | Value |
|---|---|
| Decision / scope | Reuse the existing project as the backend; no production-data modification. |
| Code/config evidence | 24 migration files in `supabase/migrations/`; Edge Functions `ai-generate` and `oauth-connect` in `supabase/functions/`; `supabase/config.toml`. |
| Actual check | Read-only PostgREST probes with the configured publishable key: `/rest/v1/workspaces`, `workspace_settings`, `brain_nodes`, `tasks`, `documents`, `planned_posts`, `ai_keys`, `task_runs` with `select=*&limit=0`; `POST /functions/v1/ai-generate` without credentials. |
| Observed result | **Every probed table returned HTTP 404 `PGRST205`** — “Could not find the table `public.<name>` in the schema cache”. `POST /functions/v1/ai-generate` returned **HTTP 404 `NOT_FOUND`** — “Requested function was not found”. |
| Status | **BLOCKED** |
| Meaning | The configured project is reachable, but the application schema and functions are **not deployed to it**. This is not a stale-cache assumption: no app table was discovered and the function route is absent. Data persistence, RLS acceptance, AI calls, and storage-backed flows cannot be exercised against this project yet. |
| Owner action | (1) Confirm `ojlgnqdhykgzgkbqyatd.supabase.co` is the intended competition project. (2) Authorize applying the repository migrations and deploying the Edge Functions (this changes remote state and was **not** done in C01). (3) Do not create a second project unless the owner reverses decision 3. |
| Follow-up | C02/C39 (schema + migration verification), C03/C04 (auth on the real project), C10/C11 (function-backed execution). |
| Limits | C01 did not use service-role or the Supabase CLI; absence was established through browser-role HTTP probes only. A remote migration history comparison remains required. |

### 3. AI model provider — owner dashboard flow

| Field | Value |
|---|---|
| Decision / scope | Preserve the existing dashboard configuration (provider/model/key); optional server-managed fallback remains supported. |
| Code/config evidence | `src/pages/SettingsPage.tsx` provider/model selection calls `save_ai_key`; `supabase/functions/ai-generate/index.ts` reads the workspace key server-side and supports managed `AI_API_KEY`/`AI_PROVIDER`/`AI_MODEL` fallback. Keys are never returned to the browser. |
| Actual check | Source review of the full save/use path. No provider request was made. |
| Observed result | The flow is implemented, but it cannot execute against the configured project: `ai_keys` and the `save_ai_key` RPC are absent (404), and `ai-generate` is not deployed (404). The earlier `npm run test:ai-gateway` 6/6 pass uses fixture provider responses only. |
| Status | **BLOCKED / NOT LIVE VERIFIED** |
| Blocker | Missing database schema, missing deployed function, and no owner-supplied key in this session. |
| Owner action | After migrations/functions are applied, save the intended provider/model/key in Settings and run one real generation. Alternatively authorize server-managed AI secrets. Do not treat the dashboard’s “Active” badge as verification. |
| Follow-up | C10 (live gateway acceptance); C39 (environment secrets). |

### 4. Search provider — Firecrawl

| Field | Value |
|---|---|
| Decision / scope | Firecrawl selected for application research/search. Adapter and evidence pipeline belong to C14/C15. |
| Code/config evidence | No `firecrawl` source or Edge Function exists in the repository. No Firecrawl variable appears in `.env`. The planned adapter is described in `docs/phase-1-2/02-contracts.md`. |
| Actual check | Read-only network probe to `https://api.firecrawl.dev/v1/search` (no credential). |
| Observed result | **HTTP 405** for an unauthenticated `GET`; the service is reachable from this environment. No credential was available, and no search was executed. |
| Status | **BLOCKED** (credential + implementation) |
| Blocker | No application Firecrawl API key and no C14 adapter. |
| Owner action | Provide a Firecrawl API key for use as a Supabase Edge Function secret (proposed name: `FIRECRAWL_API_KEY`; confirm at implementation time). Do not put it in a `VITE_` variable. |
| Follow-up | C14 (real bounded search/fetch), C15 (evidence-backed results). |

### 5. Google OAuth

| Field | Value |
|---|---|
| Decision / scope | Remains in scope; full implementation/testing in C04. |
| Code/config evidence | `src/components/auth/GoogleButton.tsx` starts Supabase OAuth with a PKCE callback; `src/pages/auth/AuthCallback.tsx` handles return/cancel/error and onboarding routing. |
| Actual check | `GET /auth/v1/settings` on the configured project. |
| Observed result | `google: false` — the Google provider is disabled. No Google login was attempted. |
| Status | **BLOCKED** |
| Blocker | Google provider disabled; no confirmed client ID/secret or authorized redirect URLs for `http://localhost:5173` and the intended `https://busmora.com`. |
| Owner action | Create/confirm the Google OAuth web client, add the Supabase callback as an authorized redirect URI, enable Google in Supabase, and add `https://busmora.com/auth/callback` plus the local callback patterns. Enable the dedicated test identity. |
| Follow-up | C04 (real login/cancel test); H02 (explicit-linking conformance, post-competition). |

### 6. Facebook / Meta

| Field | Value |
|---|---|
| Decision / scope | **DEFERRED BY OWNER** — focus on Search/Firecrawl first. Do not implement or configure now. Requirements remain in C25/C26/C28/C29 and H05/H06. |
| Code/config evidence | Legacy `supabase/functions/oauth-connect` and connection tables exist; no working Page-selection UI. |
| Actual check | `GET /auth/v1/settings` only; no Meta API request was made. |
| Observed result | `facebook: false` — the Supabase Facebook provider is disabled. |
| Status | **DEFERRED BY OWNER** |
| Blocker | Owner priority, credentials and provider configuration; also unfinished C25 implementation. |
| Owner action | No action before Search/Firecrawl. When resuming, provide an authorized Page and Meta app credentials, then authorize C25/C26 work. |
| Follow-up | C25, C26 (retained, not removed). |

### 7. Email authentication and delivery

| Field | Value |
|---|---|
| Decision / scope | Required for email signup/verification/recovery (C03). |
| Code/config evidence | Signup/verification/reset/new-password/callback pages and auth routing exist. |
| Actual check | `GET /auth/v1/settings`. |
| Observed result | Email provider enabled; signups enabled; `mailer_autoconfirm: false`, so **email confirmation is required**. No email was sent because that would create/modify auth data. |
| Status | **NOT LIVE VERIFIED** |
| Blocker | No real confirmation/recovery email has been sent or received; SMTP/template and redirect configuration are unverified. The earlier plan text that said “email confirmation disabled” is superseded by this observation. |
| Owner action | Confirm the email delivery provider/SMTP and templates; use a dedicated test mailbox. |
| Follow-up | C03 (real delivery, expiry/replay, recovery). |

### 8. Hosting — Vercel and `busmora.com`

| Field | Value |
|---|---|
| Decision / scope | Vercel is the hosting provider; intended production domain is `https://busmora.com`. Deployment requires explicit authorization. |
| Code/config evidence | Vite build outputs `dist`; `public/_redirects` is a Netlify-style SPA rule. No `vercel.json` or `.vercel/` project file exists. |
| Actual check | DNS lookup for `busmora.com`; HTTPS request; reachability check to `https://vercel.com`. |
| Observed result | `busmora.com` **does not resolve** (no DNS record; HTTPS unreachable). Vercel itself is reachable (HTTP 200). No deployment was attempted. |
| Status | **BLOCKED / NOT DEPLOYED** |
| Blocker | No Vercel project, no DNS configuration, no deployment authorization. |
| Owner action | Authorize deployment and DNS control for `busmora.com`. Decide whether to deploy a preview first. |
| Follow-up | C39 (Vercel project, SPA rewrites, env vars, smoke tests). |

## Baseline commands actually executed (19 November 2026)

| Command | Result | Evidence limit |
|---|---|---|
| `npm run build` | **PASS** — TypeScript + Vite, `✓ built in 3.47s` | Frontend bundle only; Edge Functions and deployment not covered. |
| `npm run lint` | **PASS** — exit 0, **11 warnings**, no errors | Static analysis only. |
| `npm run test:crawl` | **PASS — 26/26** | Fictional fixtures/intercepted APIs; no live site extraction. |
| `npm run test:ai-gateway` | **PASS — 6/6** | Fixture provider responses; not a live model request. |
| `npm run test:tasks` | **PASS — 7/7** | Local runner behavior; not live Supabase execution. |
| `npm run test:db:local` | **BLOCKED** — `FileNotFoundError: /tmp/busmora-competition-pg/acceptance.log` | Disposable PostgreSQL cluster absent; `postgres`/`initdb`/`pg_ctl` are not installed in this environment. No SQL acceptance is claimed. |

Browser UI suites were **not** rerun in C01; earlier passes remain historical evidence. No live provider, Google, Meta, email, publication, or deployment check passed.

## Consolidated blockers and owner actions

| Blocker | Owner action | Follow-up |
|---|---|---|
| Application schema absent from the configured Supabase project | Confirm the project, then authorize migrations/functions deployment | C02, C39 |
| `ai-generate` not deployed; no live AI request | Deploy functions; save a key in Settings and run one real generation | C10 |
| No Firecrawl credential or adapter | Provide a server-side Firecrawl key; authorize C14 | C14, C15 |
| Google provider disabled | Enable Google + redirect URLs + test identity | C04 |
| No email delivery evidence | Configure SMTP/templates and test with a dedicated mailbox | C03 |
| `busmora.com` not deployed/DNS absent | Authorize Vercel deployment and DNS | C39 |
| Facebook/Meta deferred | No action now; resume when owner reprioritizes | C25, C26 |
| Local SQL harness unavailable | Install/provision disposable PostgreSQL or use an authorized test project | C02, C37 |

## Boundary

C01 closes the scope/baseline record. It does **not** verify any integration merely because configuration names or source files exist, and it does not authorize deployment, remote migration, provider spending, or publishing. Any change to the hosted Supabase project or Vercel account needs explicit owner authorization.
