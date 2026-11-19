# Real end-to-end suite

This suite deliberately has no request interception, model stubs, fixture database, or canned provider output. A passing assertion is backed by the running Next.js application and persisted Supabase state.

## Environment

Use a disposable Supabase project. Apply every migration, disable email confirmation for test registrations, and configure the same real provider credentials used by the application. Copy the `E2E_*` variables from `.env.example`. `E2E_SUPABASE_SERVICE_ROLE_KEY` is required for the AI gateway's usage-reservation RPC; without it, agent tests intentionally fail at that integration boundary. `E2E_DATABASE_URL` must be an administrative direct/pooler connection because teardown deletes only the generated `auth.users` UUIDs and relies on database cascades to remove their workspaces.

For a remote project, set `E2E_ALLOW_REMOTE=1`. This is intentionally not the default. The configured project must not contain important user data.

```bash
npm run test:e2e
```

The runner builds and starts the real Next.js production server in an isolated `.next-e2e` directory unless `E2E_EXTERNAL_SERVER=1` is set. Set `E2E_BASE_URL` when targeting a separately started build. Chrome is selected from `CHROME_PATH`, `/usr/bin/google-chrome`, or Playwright's installed browser.

## What is verified

- browser registration, Supabase identity/workspace/settings rows, foreign keys, atomic intake confirmation, version rows, audit rows, and RLS isolation;
- onboarding route protection, malformed/private URL rejection, actual public crawling, exact persisted source evidence, Brain graph integrity, approval, and Director context consumption;
- orchestrator decisions and persisted execution evidence for direct answers, content writing, campaigns, performance diagnosis, market research, and competitor research;
- task results, immutable Post/document versions, Deliverables rendering, Calendar visibility, exact scheduled instants, and due-Post background attempts;
- idempotency, cross-origin rejection, cross-workspace origin rejection, and absence of partial writes after validation failures.

Some tests are expected to expose unfinished product areas. In particular, a test remains red if research is not actually retrieved, if a future Post is only labelled `approved` rather than `scheduled`, or if no deployed worker claims a due Post. Do not weaken those assertions to make the suite green.

## Isolation and cleanup

The suite runs with one worker to avoid provider and signup-rate races. Each account email starts with `busmora-e2e-` and every user UUID is written to an ignored runtime registry. Global teardown deletes exactly those UUIDs from `auth.users`; cascading foreign keys remove their workspaces and related records. If the process is killed before teardown, rerun the suite once to clean accounts from the current runtime registry before provisioning new ones.
