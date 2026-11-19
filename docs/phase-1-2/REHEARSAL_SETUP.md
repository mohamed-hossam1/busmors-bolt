# Local run and rehearsal setup

Updated **19 November 2026**. Competition: **Tuesday 24 November 2026, timezone `Africa/Cairo` (EET, UTC+2)**. Hosting target: **Vercel**, intended production domain **https://busmora.com** — not deployed or DNS-configured, and deployment requires explicit owner authorization. No remote migration, deployment, provider write or publication has been performed in this implementation session. Exact presentation time-of-day was not supplied.

## Current environment findings (19 November 2026)

| Area | Observed status |
|---|---|
| Client env file | `.env` is git-ignored/untracked and declares `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `FIRECRAWL_API_KEY`. Values were not printed. |
| Supabase project | Existing project at `ojlgnqdhykgzgkbqyatd.supabase.co` (reuse per owner; no second project created). |
| Supabase Auth | `GET /auth/v1/settings` → **HTTP 200**. Email enabled, signups enabled, email confirmation disabled (direct onboarding), Google **disabled**, Facebook **disabled**. |
| Supabase database | Read-only PostgREST probes returned **HTTP 404 `PGRST205`** for `workspaces`, `workspace_settings`, `brain_nodes`, `tasks`, `documents`, `planned_posts`, `ai_keys` and `task_runs`. The application schema is **not present** in the configured project. |
| Supabase Edge Functions | Replaced by Next.js Server API Routes (`/api/ai`, `/api/crawl`, `/api/tasks`, `/api/oauth`) and `src/server/`; Supabase Edge Functions are no longer required or deployed. |
| AI provider | Dashboard BYOK flow is implemented (`SettingsPage` → `save_ai_key`; server-side `src/server/ai-generate.ts`); live generation requires applying database schema to Supabase. |
| Firecrawl | Selected search provider. No adapter or credential exists in the repository/`.env`; `api.firecrawl.dev` responds (HTTP 405 to an unauthenticated GET). Blocked on credential + C14. |
| Hosting | `busmora.com` has **no DNS record**; Vercel is reachable. Target is native Next.js deployment. |
| Local DB harness | `npm run test:db:local` is blocked: `/tmp/busmora-competition-pg/acceptance.log` and PostgreSQL binaries are absent. |

Full evidence, owner actions and follow-up tasks: [integration readiness inventory](../evidence/integration-readiness.md).

## Run locally

From `busmors-bolt`, install dependencies with `npm install`, then run `npm run dev`. The default origin is `http://localhost:3000`; use the same hostname throughout authentication. The application needs a Supabase project with the repository migrations applied.

The client and server environment configuration (`.env` or `.env.local` per `.env.example`):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
# Server-only variables (never prefix with NEXT_PUBLIC_)
SUPABASE_SERVICE_ROLE_KEY=
FIRECRAWL_API_KEY=
```

Only `NEXT_PUBLIC_` variables belong in browser code. Never put provider credentials, service-role keys, database passwords, or OAuth client secrets in `NEXT_PUBLIC_` variables.

Local checks: `npm run build`, `npm run lint`, `npm run test:crawl`, `npm run test:ai-gateway`, `npm run test:tasks`, `npm run test:foundation:ui`, `npm run test:intake:ui`, and `npm run test:brain-delete:ui`. Browser check scripts intercept API calls using clearly fictional data; they do not verify a real Supabase session or provider. Database scripts run against the disposable PostgreSQL harness, not hosted Supabase. See `IMPLEMENTATION_PROGRESS.md` for actual results and remaining gaps.

## Prepare the existing Supabase project

The owner chose to reuse the existing project and not create another one. Because the current project exposes Auth but not the application schema/functions, the following remote changes are **blocked pending owner authorization**:

1. Confirm that `ojlgnqdhykgzgkbqyatd.supabase.co` is the intended competition project. Do not silently switch projects.
2. Review the migrations in `supabase/migrations` in filename order. Use the Supabase migration workflow to compare applied migration history and apply missing migrations to that project. Do not run `scripts/local-db-bootstrap.sql` on Supabase: it emulates auth/storage tables solely for disposable PostgreSQL tests. See [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations).
3. Edge Functions deployment is not required on Supabase; backend operations run directly as Next.js API Routes and server modules.
4. Verify the English-only migration is included. It normalizes stored preferences while retaining business content. Confirm private `owner-media` storage and owner RLS with two dedicated identities.
5. Run the real email, recovery, Google, managed-model and data-persistence checks below. Record observed results separately from intercepted browser tests.

Do not create a second Supabase project unless the owner reverses the reuse decision. Do not modify production data for testing.

## Prepare Vercel hosting (requires authorization)

The target is Vercel with the intended domain `https://busmora.com`. Nothing is deployed yet.

1. Create the Vercel project from this repository (or authorize the owner to do so) as a native Next.js application.
2. Build command: `npm run build` (Next.js default Turbopack build; no custom output directory or SPA rewrites needed).
3. Set environment variables in Vercel project settings: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `FIRECRAWL_API_KEY`).
4. Add `busmora.com` in Vercel and configure DNS only when the owner authorizes it. Then add `https://busmora.com/auth/callback` to Supabase Auth redirect URLs.

Deployment remains a later action requiring explicit authorization. This checklist is preparation, not a claim that C01–C40 scope is ready for release.

## Authentication

The inspected public auth configuration responded successfully: **email enabled, email confirmation disabled (direct onboarding), Google disabled, Facebook disabled**. No actual login/email delivery was tested. Re-check the chosen rehearsal project's settings rather than assuming they match.

Set the Supabase Auth Site URL to the selected app origin. Add these exact redirect patterns for development, and the equivalent URLs for the selected HTTPS rehearsal origin:

```text
http://localhost:3000/auth/callback
http://localhost:3000/auth/callback?flow=recovery
https://busmora.com/auth/callback
https://busmora.com/auth/callback?flow=recovery
```

If using `127.0.0.1` or port 5173 during testing, add those origins too. Use exact deployed URLs rather than a broad wildcard. The app stores the intended internal resource separately and uses PKCE. Email signup proceeds directly to onboarding without email verification. Password recovery links honor the requested redirect URL. See [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) and [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

For Google, create/configure a Google OAuth web client with the app origins, add the Supabase project's callback URL from its Google provider settings as the authorized redirect URI, and enable Google in Supabase with the client ID and secret. The Google callback is the Supabase callback, while `/auth/callback` is the application's return URL. Add the dedicated identity as a test user if the Google consent app is in testing. See [Supabase Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google). Current blocker: `google: false` on the project.

Verify: fresh signup and email receipt; expired/cancelled links; verification → setup; password reset and new password; returning login → Director; safe deep link return; logout; Google success/cancel; actual provider and verification labels in Settings. Same-email linking and the wider H02 identity suite remain separate follow-up checks.

## Server credentials and configuration

Server-side operations run in Next.js (`src/server/` and `src/app/api/`). Configure secrets in Vercel project environment settings or `.env.local` (never prefix with `NEXT_PUBLIC_`). Do not paste them into source, logs or this document.

| Variable | Use / status |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Edge runtime backend access; never browser configuration. |
| `AI_API_KEY`, `AI_PROVIDER`, `AI_MODEL` | Optional server-managed fallback implemented in `ai-generate`; the owner's dashboard BYOK path remains the primary configured flow. Provider/model must be tested with an actual request. |
| `AI_BASE_URL` | Optional custom OpenAI-compatible provider base. |
| `AI_ALLOWED_BASE_URLS` | Comma-separated approved custom bases; required for custom destinations. |
| `FIRECRAWL_API_KEY` | **Proposed name** for the C14 application search credential. Not configured; confirm the final name during C14 and never expose it to the browser. |
| `OAUTH_APP_URL` | Legacy social OAuth application return origin. Current legacy social flow is not the planned Page-selection/publishing implementation. |

The existing database also contains server-only `app_secrets` and encrypted owner BYOK configuration. Their values were not inspected. Shared crawl extraction uses its existing server key reader; configure/test it separately if using that path. No client may call plaintext key readers; the grants migration must be deployed together with the gateway changes.

Facebook/Meta integration is **temporarily deferred by the owner**. Do not configure or implement C25/C26 now; their requirements remain in the plan. The future publisher/cron/reconciliation work will be documented here when resumed. A Codex search-tool connection is not an application research credential. Do not treat the legacy social OAuth callback as proof of a working Page connection or publication.

## Real rehearsal evidence still required

The selected project needs end-to-end checks for database upgrades and ownership on actual Supabase, signup/verification/recovery/Google, real public website ingestion, model success and outage, retrieval with inspectable Firecrawl sources, and file import/storage. Facebook consent/Page selection, explicit approved test publication/read-back and scheduled delivery remain deferred. The current progress file identifies incomplete product work. Never label intercepted API tests or local PostgreSQL results as live integration passes.

Record each check using the evidence template in `05-demo-and-verification.md`, including environment, timestamp, observed HTTP/provider result, and status (`passed | failed | not_run | externally_blocked`).
