# Local run and rehearsal setup

Updated 18 November 2026. Competition: next week; exact date not supplied. The owner has not selected a rehearsal URL or dedicated test Supabase project. No remote migration, deployment, provider write or publication has been performed in this implementation session.

## Run locally

From `busmors-bolt`, install the lockfile dependencies with `npm ci`, then run `npm run dev -- --host 127.0.0.1`. The default origin is `http://localhost:5173`; use the same hostname throughout authentication. The application needs a Supabase project with the repository migrations applied. A build alone does not provide its backend.

The existing `.env` has these public client variable names (values intentionally omitted):

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

Only these public client settings belong in the Vite build. Never put provider credentials, service-role keys, database passwords, or OAuth client secrets in a `VITE_` variable.

Local checks: `npm run build`, `npm run lint`, `npm run test:crawl`, `npm run test:foundation:ui`, `npm run test:intake:ui`, and `npm run test:brain-delete:ui`. Browser check scripts intercept API calls using clearly fictional data; they do not verify a real Supabase session or provider. Database scripts run against the disposable PostgreSQL harness, not hosted Supabase. See `IMPLEMENTATION_PROGRESS.md` for actual results and remaining gaps.

## Select and prepare a rehearsal project

1. Select a dedicated Supabase project and a web-host origin. Record identifiers only in the progress file. Do not reuse customer production data for the walkthrough.
2. Review the migrations in `supabase/migrations` in filename order. Use the Supabase migration workflow to compare applied migration history and apply missing migrations to the chosen test project. Do not run `scripts/local-db-bootstrap.sql` on Supabase: it emulates auth/storage tables solely for disposable PostgreSQL tests. See [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations).
3. Verify the English-only migration is included. It normalizes stored preferences while retaining business content. Confirm private `owner-media` storage and owner RLS with two dedicated identities.
4. Run the real email, recovery, Google, managed-model and data-persistence checks below. Record observed results separately from intercepted browser tests.
5. Configure the web host to build with `npm ci && npm run build`, serve `dist`, and rewrite non-asset routes to `index.html`. Direct requests to `/brain`, `/auth/callback`, `/auth/new-password` and all other application routes must reach React. The build embeds public Supabase settings: rebuild after changing the selected project.

Deployment remains a later action requiring authorization for the selected target. This checklist is preparation, not a claim that the unfinished C01–C40 scope is ready for release.

## Authentication

The inspected public auth configuration responded successfully: email enabled, Google disabled, email confirmation disabled. No actual login/email delivery was tested. Re-check the chosen rehearsal project's settings rather than assuming they match.

Set the Supabase Auth Site URL to the selected app origin. Add these exact redirect patterns for development, and the equivalent URLs for the selected HTTPS rehearsal origin:

```text
http://localhost:5173/auth/callback
http://localhost:5173/auth/callback?flow=recovery
```

If using `127.0.0.1` instead of `localhost`, add that origin's two URLs too. Use exact deployed URLs rather than a broad wildcard. The app stores the intended internal resource separately and uses PKCE. Verification/recovery must finish in the same browser that initiated the flow. Configure email confirmation and an email delivery provider, and review email templates to honor the requested redirect URL. See [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) and [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

For Google, create/configure a Google OAuth web client with the app origins, add the Supabase project's callback URL from its Google provider settings as the authorized redirect URI, and enable Google in Supabase with the client ID and secret. The Google callback is the Supabase callback, while `/auth/callback` is the application's return URL. Add the dedicated identity as a test user if the Google consent app is in testing. See [Supabase Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

Verify: fresh signup and email receipt; expired/cancelled links; verification → setup; password reset and new password; returning login → Director; safe deep link return; logout; Google success/cancel; actual provider and verification labels in Settings. Same-email linking and the wider H02 identity suite remain separate follow-up checks.

## Server credentials and functions

Set secrets only through Supabase's server configuration; [Edge Function secrets documentation](https://supabase.com/docs/guides/functions/secrets). Do not paste them into source, logs or this document.

| Variable | Use / status |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Edge runtime backend access; never browser configuration. |
| `AI_API_KEY`, `AI_PROVIDER`, `AI_MODEL` | Managed model fallback implemented in `ai-generate`; provider/model must be tested with an actual request. |
| `AI_BASE_URL` | Optional custom OpenAI-compatible provider base. |
| `AI_ALLOWED_BASE_URLS` | Comma-separated approved custom bases; required for custom destinations. |
| `OAUTH_APP_URL` | Legacy social OAuth application return origin. Current legacy social flow is not yet the planned Page-selection/publishing implementation. |

The existing database also contains server-only `app_secrets` and encrypted owner BYOK configuration. Their values were not inspected. Shared crawl extraction currently uses its existing server key reader; configure/test it separately if using that path. No client may call plaintext key readers; the new grants migration must be deployed together with the gateway changes.

The future application research provider (C14), full Facebook Page connection (C25), publisher/cron/reconciliation (C26), and their final secret names will be documented here when implemented. A Codex search-tool connection is not an application research credential. Do not treat the legacy social OAuth callback as proof of a working Page connection or publication.

## Real rehearsal evidence still required

The selected project needs end-to-end checks for database upgrades and ownership on actual Supabase, signup/verification/recovery/Google, real public website ingestion, model success and outage, retrieval with inspectable sources, Facebook consent/Page selection, explicit approved test publication/read-back, scheduled delivery/recovery, and file import/storage. The current progress file identifies incomplete product work. Never label intercepted API tests or local PostgreSQL results as live integration passes.
