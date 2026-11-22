# Implementation plan: Deliverables routing, Facebook post previews, and Meta publishing

**Written:** 21 November 2026 · **Revised:** 22 November 2026 (review findings and owner decisions applied; Phase 0 local DB checks added; Facebook-side edit/delete ruled out)\
**Audience:** the coding agent that implements this plan, which may be a smaller model. Follow every step literally. If a step is ambiguous, read §0 again; if it is still ambiguous, stop and ask the owner instead of guessing.\
**Status:** not started.

---

## 0. Read this first

### 0.1 What the owner wants (business view)

1. **Save to Deliverables, into the right section.** When the Marketing Director chat produces a substantial result (a campaign plan, a diagnosis, a set of posts, a long answer), the chat **asks** the owner: "Save this to Deliverables → *Section name*?" with **Save** and **Not now** buttons. Nothing is saved to Deliverables automatically. **Save** stores the document in the correct section (`deliverables.type`).
2. **See posts the way Facebook will show them.** Each generated post is shown in a **Facebook-style preview** (page avatar, page name, time, text, "See more", Like / Comment / Share bar). Only Meta's **Facebook Page** is in scope.
3. **Calendar & Publishing shows when posts will go out.** The Director **proposes** a date and time for each post. Proposed times appear in the calendar marked *Proposed*.
4. **Two-step approval (owner decision, 22 Nov 2026).**
   - **Step 1, content approval:** every draft post shows **Approve** and **Reject**. Approve means "the text is right". It does **not** authorize publishing.
   - **Step 2, after Approve**, the post shows three actions:
     - **Schedule**: a dialog with the proposed time (editable, workspace timezone) and the lateness allowance shown. Confirming creates the **publish approval** bound to the exact version, Page and time. Approved scheduled posts are published automatically at that time by a background job.
     - **Publish now**: a confirmation dialog with the Facebook preview and Page name, then publish immediately.
     - **I'll publish it myself**: copy caption, then **I published it** (owner-reported).
   - If no Facebook Page is connected, **Schedule** and **Publish now** are visible but **disabled** with the text "Connect a Facebook Page in Settings". **I'll publish it myself** stays available.
   - Editing the text of an approved or scheduled post returns it to **draft**, revokes any schedule, and requires Approve again.
5. **Click a day → see that day's posts.** The day panel lists every post planned for that day (proposed or scheduled) with the actions above.
6. Publishing goes through **Composio** (managed Facebook OAuth app, so BUSMORA does not need its own Meta App Review), behind a `PublishingProvider` adapter so the provider can be swapped later.

### 0.2 Decisions already made by the owner (do not re-open)

| Topic | Decision |
|---|---|
| Saving to Deliverables | **Always ask first.** No automatic deliverable saving. |
| Which results get the "Save?" offer | Substantial results only (§1.2). Short chat replies get no offer. |
| Publishing provider | **Composio** managed OAuth, wrapped in a `PublishingProvider` adapter. |
| Approval | **Two steps** (§0.1 item 4): content Approve/Reject, then Schedule / Publish now / I'll publish it myself. |
| Scheduling | **Automatic publishing at the scheduled time** + a **Publish now** button. |
| Dates | **AI proposes dates; the owner confirms the exact time** in the Schedule dialog. |
| Platform | **Facebook Page only.** |
| Media | **Text (and links inside text) only.** No image upload in this plan. |
| Research | Market research / competitor analysis execution is **out of scope**. Routing for their future document types exists, but do not implement research. |
| UI | **Do not redesign or restyle existing UI.** New elements reuse the existing design system (§0.4). |
| Language | Product UI strings are **English only** (repo decision of 18 Nov 2026). |
| Compatibility | The project is in development with no customers. **No backward-compatibility or data-migration work** is needed. |
| Post drafts as a Deliverable | Kept: `content_posts` / `content_calendar` documents are a **read-only snapshot** of the drafts at save time, with a line pointing to Calendar & Publishing. The live, editable post stays only in Publishing. This is a documented deviation from PRD FR-41 ("Social Posts live only in Publishing"); record it in the end-of-session report. |
| Lateness allowance | Shown in the Schedule dialog as a select: 5, 15, **30 (default)**, 60, 120 minutes. Publish now uses 30. |
| Context holds | The owner can resolve a Brain-context hold with **"I reviewed it, keep this text"** (§5.1.7). |
| Deleting posts with publish history | **Refused** with a clear message (keeps the provider evidence). |
| "Auto-publish is active" claims | Shown only when the publisher has actually run in the last 5 minutes (heartbeat, §6.1). |
| Test adapter | A `FakePublishingProvider` exists for development and tests only (§4.5). |
| Posts on Facebook (owner decision, 22 Nov 2026) | BUSMORA only **creates** posts on Facebook. It never edits, deletes, unpublishes or reads back a post on Facebook, and it does not sync changes the owner makes on Facebook. Editing a post's text **inside BUSMORA before it is published** stays in scope (it returns the post to draft, §5.1.1). A published post is read-only in BUSMORA. |
| Database checks | Run only against a **local** PostgreSQL (`LOCAL_PG_URL`, localhost only), never against the shared Supabase project (Phase 0). |

### 0.3 Repository rules you must obey

1. **Next.js 16 is not the Next.js you know.** Before writing any route handler, server action, `after()`, `cookies()`, or config change, read the relevant guide in `node_modules/next/dist/docs/` (see `AGENTS.md`). Heed deprecation notices.
2. Architecture is fixed: **Next.js 16 App Router + React 19 + Supabase**. Server code lives in `src/server/*` and `src/app/api/*`. Screens live in `src/screens/*`. **Do not** add a separate backend, queue, Redis, Temporal, or worker cluster.
3. **Database changes go in timestamped migration files** in `supabase/migrations/` (format `YYYYMMDDHHMMSS_name.sql`). You **may edit** a migration file, including older ones, **as long as the owner has not applied it yet**. If you do not know whether a file has been applied, ask the owner. No backfill is needed.
4. **Do not run `supabase db push`** or apply any migration yourself. The Supabase project is shared by the team. Write the migration, then **stop and ask the owner** before anything is applied (§7).
5. Writes to `planned_posts`, `post_versions`, `post_approvals`, `publish_attempts`, `post_holds`, `platform_connections`, `deliverables`, `deliverable_offers` go through **checked RPCs** (`SECURITY DEFINER`, `SET search_path=public`, ownership check `workspace_id=auth.uid()` for user RPCs), never direct client table writes. Follow the style of `supabase/migrations/20261119020000_planned_posts_rpcs.sql`.
6. Every RPC must `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon` and then `GRANT EXECUTE ... TO authenticated` (user RPCs) or `TO service_role` only (server-only RPCs: everything in §4.6 and the claim/record/stale/heartbeat RPCs in §5–§6). For server-only RPCs also `REVOKE ... FROM authenticated`.
7. **No secrets in the browser.** Composio keys and the cron secret are server-only env vars (never `NEXT_PUBLIC_`). Never print secrets in logs.
8. **No fake success.** Never show "Published" without provider evidence. Never simulate agent activity. If something is not configured, show a truthful blocked state. The fake provider (§4.5) exists only outside production, and its Page name always contains "(fake)".
9. **Never trigger an external send** from page render, page load, task completion, connection callbacks, or reconnect. Only from (a) the owner pressing Publish now after confirming, or (b) the scheduled job for a post with an active publish approval.
10. Workspace id = the authenticated Supabase user id (`auth.uid()`), as everywhere in this repo.
11. **Checks after every phase:** `npm run lint`, `npm run typecheck`, `npm run build`. After any phase that writes a migration, also run `npm run test:db:local` and `npm run test:posts:db`. Both need `LOCAL_PG_URL` (Phase 0) and only ever touch disposable databases on localhost. If `LOCAL_PG_URL` is not set or the local server is not running, write "not run: <the script's error message>" in the report. Never point either script at the shared Supabase project. Do not "fix" checks by deleting assertions, RLS, or approval logic.
12. Do not commit `.env`. Do not touch unrelated files. Keep diffs focused.

### 0.4 UI rules ("do not change the UI")

- Do **not** change layout, colors, spacing, fonts, or behavior of existing screens except where a step says so.
- New UI uses existing classes from `DESIGN.md` / `src/index.css`: `.card`, `.badge`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.input-field`, `.modal-panel`, and the Tailwind tokens (`ink-*`, `primary-*`, `accent-*`, plus Tailwind's default `emerald-*`, `amber-*`, `red-*`, which exist because `tailwind.config.js` uses `theme.extend`).
- **Dialogs.** `useDialog(open, onClose)` in `src/hooks/useDialog.ts` is only a focus-trap and Escape-key hook. It does not render anything and has no confirm API. Every dialog in this plan is built like the existing edit dialog in `src/screens/CalendarPage.tsx` lines 315–331: a state variable (for example `const [confirm, setConfirm] = useState<...|null>(null)`), a call `useDialog(!!confirm, () => setConfirm(null))`, and the markup `<div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-3 sm:p-4" onClick={close}><div role="dialog" aria-modal="true" aria-label="..." className="card modal-panel w-full max-w-lg p-4 sm:p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>...</div></div>`. Do not add a modal library.
- Icons come from `lucide-react` (already installed).
- All new strings go into the English dictionary in `src/lib/i18n.ts`. Components read them with `const { t } = useCopy()` (`src/hooks/useCopy`). `t(key, values)` replaces `{name}` placeholders (`src/lib/i18n.ts` line 182), so write keys like `'Saved to {section}'` and call `t('offerSaved', { section })`.
- The Facebook preview (§3) is the only intentionally "foreign-looking" element: it imitates Facebook's post layout using neutral Tailwind colors, placed inside an existing `.card`.

### 0.5 How the current code works (verified 22 Nov 2026)

| Area | File | Current behavior |
|---|---|---|
| Chat submit | `src/app/api/tasks/route.ts` | `submit` → RPC `enqueue_task`; then `after()` runs `dispatchTasks` with a user-token Supabase client. |
| Task execution | `src/server/task-executor.ts` | Route phase: `parseRoute` → `mode ∈ reply/clarify/task`. **`mode='reply'` skips the generate phase** and goes straight to persist (line 87). Generate phase (lines 90–111): `content_creation`/`campaign_planning` → `parsePosts(text, quantity)`; `performance_diagnosis` → markdown doc; other `simple_answer` → `chat` operation; research intents throw `research_unavailable`. Persist phase calls RPC `save_task_result` (line 114). |
| Task context | `src/server/task-backend.ts` → `context()` | Returns `region: {country, currency, target_market, timezone}` from `workspace_settings`. Stored in `task.checkpoint.context`. |
| Result saving | RPC `save_task_result`, latest body in `supabase/migrations/20261119070000_task_attempts.sql` lines 33–89 | If `p_result.document` is an object → inserts into `deliverables` + `deliverable_versions` + a `deliverable_card` message (lines 44–54). Each post → `planned_posts` row (`status='draft'`, `scheduled_for=NULL`) + `post_versions` rev 1 + a `post_reference` message (lines 55–65). Context-dependency loop (lines 66–81). Then a `text_response` message, `task_results`, task status, notification. |
| Doc types | `deliverables.type` CHECK (core schema) | `research_report, competitor_analysis, content_posts, content_calendar, performance_diagnosis, general`. Today campaign briefs are saved as `general`. |
| Deliverables page | `src/screens/DeliverablesPage.tsx` | Filter chips per type; RPC `list_deliverables`. Reads `searchParams.get('document')` at line 61. |
| Chat rendering | `src/screens/EmployeePage.tsx` | `post_reference` branch at line 747 (link card to `/scheduling?post=<id>`, heading "Draft Post · review in Scheduling"); `deliverable_card` branch at line 754 (document card / `PostPreviewCard` grid). Markdown is rendered with `src/components/chat/MarkdownContent.tsx`. |
| Post preview | `src/components/chat/PostPreview.tsx` | Generic card (platform badge, caption, hashtags). Also used by `src/components/chat/AgentCanvas.tsx` (~line 50). |
| AI prompts | `src/server/ai/operations.ts` | `copy` and `campaign` prompts say "No invented dates". `validateOutput` (lines 13–31) ignores unknown keys. |
| Calendar | `src/screens/CalendarPage.tsx`, `src/lib/calendar.ts` (`zonedParts`, `dayKey`, …), `src/server/calendar-actions.ts` (`loadPosts`, `updatePosts`, `deletePosts`) | Month/Week + Unscheduled. Memos at lines 102–112, `selectedPosts` at line 119, day panel at lines 260–288, Unscheduled list at lines 291–311, `PostChip` at line 500, `PostCard` at line 521 (caption block ~566–572, buttons ~583–615). Every card shows **Approve / Edit / Reject** (`update_post` with status `approved`/`rejected`); approved cards show **Copy caption** + **I published it**. No real publishing. |
| Post RPCs | `supabase/migrations/20261119020000_planned_posts_rpcs.sql` | `create_post`, `update_post(p_ids uuid[], p_expected_version, p_caption, p_status)` (batch; status ∈ approved/rejected/published), `delete_post(p_ids uuid[])`. |
| Post schema | `planned_posts` | `version, current_version_id, approval_state (unapproved/approved/rejected), execution_state (idle/scheduled/submitted/confirmed/failed/uncertain/held/cancelled/owner_reported), published_at, scheduled_for (nullable), publish_result, status (draft/pending_approval/approved/rejected/scheduled/publishing/published/failed)`. |
| Publishing tables (exist, unused) | `post_versions` (has nullable `page_id`, `connection_id`, `scheduled_time`), `post_approvals` (UNIQUE `post_version_id`), `publish_attempts` (UNIQUE `post_version_id`; NOT NULL `workspace_id, post_id, post_version_id, connection_id, authorization_generation, state`), `post_holds` | Created in `20261118020000_competition_contracts.sql` (lines 336–390). **The FKs from `publish_attempts` to `planned_posts` and `post_versions` are `ON DELETE NO ACTION`** (lines 509–510). |
| Holds | `mark_brain_context_changed` in `20261118025000_brain_governance.sql` | Inserts `post_holds` for changed Brain context and sets `execution_state='held'` (or `uncertain` if submitted). **No RPC resolves holds today.** |
| Connections | `platform_connections` (`UNIQUE(workspace_id, platform)`, `status ∈ connected/expired/disconnected`, `authorization_generation`, `permissions`, `page_id`, `page_name`, `account_name`, `external_account_id`) | Client cannot write (REVOKE). Owner SELECT policy `"select own connections"`. `src/server/oauth-connect.ts` is an old direct-Graph-API flow; it is **not** used for publishing. |
| Settings | `src/screens/SettingsPage.tsx` | One settings card (line 131); no connections UI. |
| Admin DB client | `src/server/supabase-admin.ts` → `createAdminClient()` | Uses `SUPABASE_SECRET_KEY`. Server-only. |
| Auth helpers | `src/server/auth.ts` → `getIdentity()` (returns `{supabase, user}` or null), `requireApiIdentity(request)` (throws a `Response`), `apiError()` | Use these in new routes/actions. API error bodies follow `ApiFailure` in `src/lib/contracts.ts`: `{code, messageKey, details?}`. |
| DB checks | `scripts/planned-posts-db-check.sql` | Drives `update_post` approve → publish → edit. Must be updated when Phase 5 changes `update_post`. |
| DB check runners (before Phase 0) | `scripts/local-migration-check.py` (`npm run test:db:local`), `scripts/db-check.cjs` (`npm run test:posts:db`) | The `.py` runner needs Python (not installed on the owner's machine) and a Unix socket at `/tmp/busmora-competition-pg` port 55438. `db-check.cjs` runs `psql` against **`DATABASE_URL`, which is the shared team Supabase project**. Phase 0 replaces both. |

---

## Phase 0: Local database checks on Windows (do this before Phase 1)

**Goal:** `npm run test:db:local` and `npm run test:posts:db` run on the owner's Windows machine with Node only, against disposable databases on a **local** PostgreSQL, and can never touch the shared Supabase project. Then record a baseline on the current migrations before any phase changes the schema.

### P0.1 Environment (owner provides; verify, do not invent)

- PostgreSQL 17 from the EDB installer, listening on `localhost:5432`, superuser `postgres`.
- `.env` contains `LOCAL_PG_URL=postgresql://postgres:<password>@localhost:5432/postgres`. Never print, log or echo this value or the password, including in the end-of-session report. A password with characters such as `@ : / # %` must be URL-encoded in this URL (the owner's job; if parsing fails, say so without showing the value).
- **Python is not installed.** The new scripts use Node only (Node 24 is installed) and **no new npm dependencies**.
- The EDB installer does **not** put `psql` on `PATH` (verified: `psql` is not on `PATH` on this machine today). The scripts resolve `psql` in this order: env `PSQL` (full path to `psql.exe`), then `psql` on `PATH` (probe with `spawnSync(cmd, ['--version'])`), then `C:\Program Files\PostgreSQL\17\bin\psql.exe` if it exists. If none works, exit 2 with "psql not found. Add C:\Program Files\PostgreSQL\17\bin to PATH or set PSQL in .env."
- Add to `.env.example`, with empty values and comments:
  ```
  LOCAL_PG_URL=   # local disposable DB checks only (npm run test:db:local / test:posts:db); must be localhost
  PSQL=           # optional full path to psql.exe if it is not on PATH
  ```

### P0.2 Shared helper: `scripts/local-pg.mjs` (new)

One module holds everything both runners need, so the localhost guard and the secret handling exist in one place. Exports:

1. `loadLocalEnv()`: for each of `LOCAL_PG_URL` and `PSQL`, use `process.env` if set; otherwise read `.env` at the repo root with a tiny parser: split lines, skip blank lines and lines starting with `#`, split on the first `=`, trim; if the value is wrapped in one pair of `'` or `"`, strip them; otherwise cut it at the first ` #` (inline comment, as used in `.env.example`) and trim again. No variable expansion. Only these two keys are read. **`DATABASE_URL` is never read.**
2. `localConnection()`: missing `LOCAL_PG_URL` → exit 2 "LOCAL_PG_URL is not set. See .env.example." Parse with `new URL()`. Protocol must be `postgres:` or `postgresql:`. `url.hostname` must be exactly `localhost`, `127.0.0.1`, `::1` or `[::1]`; anything else → exit 2 "LOCAL_PG_URL must point to localhost. Refusing to run." (do not include the URL or host in the message). Return `{ host, port: url.port || '5432', user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), adminDb: url.pathname.slice(1) || 'postgres' }`.
3. `runPsql(conn, db, args)`: `spawnSync(psql, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, ...args], { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, PGHOST, PGPORT, PGUSER, PGPASSWORD, PGCONNECT_TIMEOUT: '10', PGCLIENTENCODING: 'UTF8' } })`. The connection goes **only through these env vars**, never as a URL argument (arguments show up in process lists and in error text). Append `stdout + stderr` to the log through `redact()`. Non-zero exit or `error` → throw an `Error` whose message is the redacted last 4000 characters of stderr.
4. `redact(text)`: replaces every occurrence of the password and of the full `LOCAL_PG_URL` string with `***`. Every line written to the console or the log goes through it.
5. `logPath`: `path.join(os.tmpdir(), 'busmora-db-check', 'acceptance-' + <ISO timestamp with ':' replaced by '-'> + '.log')`; create the folder with `mkdirSync(..., { recursive: true })`.
6. `createDisposableDb(conn)`: name `'busmora_check_' + crypto.randomBytes(6).toString('hex')`; assert it matches `/^busmora_check_[0-9a-f]{12}$/` before putting it in SQL; run `CREATE DATABASE <name> TEMPLATE template0 ENCODING 'UTF8'` on `adminDb` (template0 + UTF8 avoids Windows code-page clusters breaking non-ASCII text in migrations). Return the name.
7. `dropDisposableDb(conn, name)`: same name check, then `DROP DATABASE IF EXISTS <name> WITH (FORCE)` on `adminDb`. Callers call it in `finally`, so it runs on success, failure and Ctrl+C (also register `process.once('SIGINT', ...)` to drop and exit 130).
8. `buildSchema(conn, db, mode)`, `mode ∈ 'empty' | 'upgrade'`: run `scripts/local-db-bootstrap.sql`; then every `supabase/migrations/*.sql` sorted by file name with plain `Array.prototype.sort()` (code-unit order, the same order Python's `sorted` gave; it keeps the two `20261119030000_*` files in a fixed order). In `upgrade` mode, run `scripts/migration-upgrade-fixture.sql` immediately before the file whose name starts with `20261118020000`, and `scripts/migration-upgrade-assert.sql` after the last migration. Pass relative paths with forward slashes to `-f`.

Note: `local-db-bootstrap.sql` creates the cluster-wide roles `anon`, `authenticated`, `service_role` (guarded with `IF NOT EXISTS`). They stay in the local cluster after the database is dropped. That is expected and harmless.

### P0.3 `scripts/local-migration-check.mjs` (replaces `scripts/local-migration-check.py`)

Same work as the Python script (read it before deleting it):
1. For each mode in `['empty', 'upgrade']`, in order: `createDisposableDb` → `buildSchema(mode)` → run these checks, in this order: `competition-db-check.sql`, `intake-db-check.sql`, `brain-governance-db-check.sql`, `task-execution-db-check.sql`, `deliverable-db-check.sql`, `discovery-db-check.sql`, `planned-posts-db-check.sql`. All seven exist today; a missing one is a **failure**, not a silent skip. (`crawl-db-check.sql` was not in the old list; leave it out.) → print `PASS: <mode> migration path and database acceptance checks` → `dropDisposableDb` in `finally`.
2. Stop at the first failure: print `FAIL: <mode> at <file>` and the redacted error, drop the database, exit 1.
3. At the end print `Full log: <logPath>`.
4. Exit codes: 0 pass, 1 a migration or check failed, 2 setup problem (no `LOCAL_PG_URL`, non-local host, `psql` not found, cannot connect).

Then: in `package.json` set `"test:db:local": "node scripts/local-migration-check.mjs"` and **delete** `scripts/local-migration-check.py`.

### P0.4 `scripts/db-check.cjs` (rewrite; used by `test:posts:db`)

Today it runs `psql "$DATABASE_URL"`, i.e. against the shared Supabase project. Rewrite it so no test ever touches that database:
- Usage stays `node scripts/db-check.cjs <sql-file>`; `package.json` `test:posts:db` stays as is.
- Wrap the body in `async function main()` and load the helper with `await import('./local-pg.mjs')` (a `.cjs` file may import ESM dynamically).
- The `postgres` database named in `LOCAL_PG_URL` has no BUSMORA schema, so the script creates a disposable database, runs `buildSchema(conn, db, 'empty')`, runs the given file, and drops the database in `finally`. Prints `PASS: <file>` or `FAIL: <file>` + redacted error. Same exit codes as P0.3.
- Replace the header comment with: "Runs one self-contained .sql check in a disposable database on the LOCAL PostgreSQL from LOCAL_PG_URL. Never uses DATABASE_URL."

### P0.5 Baseline run (before any schema change)

1. Run `npm run test:db:local`, then `npm run test:posts:db`, on the migrations exactly as they are now (before Phase 1).
2. Record the result in the end-of-session report under **Phase 0 baseline** (§10): `PASS` per mode, or the exact `FAIL: <mode> at <file>` line plus the first `ERROR:` line from psql (redacted).
3. If the failure is in the new runner itself (paths, quoting, encoding, `psql` lookup), fix the runner and run again. `planned-posts-db-check.sql` has so far only run on hosted Supabase (it was not in the old local list), so it may need a Supabase object the local stub lacks. A missing stub is a runner problem: add the smallest stub to `scripts/local-db-bootstrap.sql` and list it in the report. If an **existing migration or check script** fails, do **not** edit it to make the baseline pass: record the failure, stop, and ask the owner before starting Phase 1. A failing baseline makes every later DB check meaningless.

### P0.6 Phase 0 acceptance checks

1. `LOCAL_PG_URL` not set in `.env` or the environment, and `DATABASE_URL` set → both scripts exit 2 with "LOCAL_PG_URL is not set…" and do not connect anywhere.
2. In PowerShell: `$env:LOCAL_PG_URL='postgresql://u:p@db.example.com:5432/postgres'; npm run test:db:local` → exit 2, "Refusing to run", no connection attempt; same for `npm run test:posts:db`. Then `Remove-Item Env:LOCAL_PG_URL`.
3. With the real `.env`: `npm run test:db:local` prints `PASS: empty …` and `PASS: upgrade …`; `npm run test:posts:db` prints `PASS: scripts/planned-posts-db-check.sql`.
4. After the runs, `SELECT count(*) FROM pg_database WHERE datname LIKE 'busmora_check_%'` (run through the helper, not by pasting the URL) returns 0.
5. The log file and console output contain neither `postgresql://` nor the password. Check with a one-off Node snippet in your scratch directory that imports `scripts/local-pg.mjs`, reads the log, searches it for `LOCAL_PG_URL` and the password, and prints only `found` or `not found`.
6. `scripts/local-migration-check.py` no longer exists; `package.json` contains no `python`.
7. `npm run lint` passes.

---

## 1. Phase 1: Save-to-Deliverables offer with correct section routing

**Goal:** substantial chat results stop being auto-saved. The chat shows a "Save to Deliverables?" card. **Save** writes a deliverable of the correct `type`. **Not now** dismisses it.

### 1.1 Database migration: `supabase/migrations/20261121100000_deliverable_save_offers.sql`

1. Extend the message type CHECK:
   ```sql
   ALTER TABLE messages DROP CONSTRAINT messages_type_check;
   ALTER TABLE messages ADD CONSTRAINT messages_type_check CHECK (type IN (
     'text','text_response','form','structured_form','task_status','deliverable_card',
     'knowledge_notification','budget_extension_request','error','post_reference','deliverable_offer'));
   ```
2. Create table `deliverable_offers`:
   ```sql
   CREATE TABLE deliverable_offers (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
     task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     conversation_id uuid NOT NULL,
     message_id uuid,
     proposed_type text NOT NULL CHECK (proposed_type IN ('research_report','competitor_analysis','content_posts','content_calendar','performance_diagnosis','general')),
     title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
     content text NOT NULL CHECK (length(content) BETWEEN 1 AND 80000),
     source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
     limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
     post_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
     state text NOT NULL DEFAULT 'offered' CHECK (state IN ('offered','saved','dismissed')),
     deliverable_id uuid,
     created_at timestamptz NOT NULL DEFAULT now(),
     decided_at timestamptz,
     UNIQUE (task_id, proposed_type),
     UNIQUE (workspace_id, id)
   );
   ALTER TABLE deliverable_offers ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "owner read" ON deliverable_offers FOR SELECT TO authenticated USING (workspace_id = auth.uid());
   REVOKE ALL ON deliverable_offers FROM PUBLIC, anon, authenticated;
   GRANT SELECT ON deliverable_offers TO authenticated;
   GRANT ALL ON deliverable_offers TO service_role;
   ```
3. `CREATE OR REPLACE FUNCTION save_task_result(p_task_id uuid,p_run_id uuid,p_result jsonb,p_partial boolean DEFAULT false)`: copy the **entire body** from `20261119070000_task_attempts.sql` lines 33–89 and make **exactly** these changes (nothing else):
   - a. In `DECLARE`, add `doc jsonb; o deliverable_offers;`.
   - b. Replace the document block (lines 44–54) with:
     ```sql
     IF jsonb_typeof(p_result->'document')='object' THEN
      doc:=p_result->'document';
      IF length(coalesce(doc->>'title','')) NOT BETWEEN 1 AND 200 OR length(coalesce(doc->>'content','')) NOT BETWEEN 1 AND 80000 THEN RAISE EXCEPTION 'INVALID_DOCUMENT'; END IF;
     END IF;
     ```
     (No `deliverables`, `deliverable_versions`, or `deliverable_card` insert any more.)
   - c. In the context loop (lines 66–81), **delete** the two lines that start with `IF doc_id IS NOT NULL` (line 69 and line 76). Keep the post dependency lines unchanged.
   - d. **After** the `text_response` message insert (line 82–83) and **before** `output:=...` (line 84), add:
     ```sql
     IF doc IS NOT NULL THEN
      INSERT INTO deliverable_offers(workspace_id,task_id,conversation_id,proposed_type,title,content,source_refs,limitations,post_ids)
       VALUES(t.workspace_id,t.id,t.conversation_id,coalesce(doc->>'type','general'),doc->>'title',doc->>'content',
              coalesce(p_result->'sourceRefs','[]'),coalesce(p_result->'limitations','[]'),post_ids)
       RETURNING * INTO o;
      INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload)
       VALUES(t.workspace_id,t.conversation_id,'agent','deliverable_offer',o.title,
              jsonb_build_object('offerId',o.id,'taskId',t.id,'proposedType',o.proposed_type,'title',o.title,
                                 'preview',left(o.content,600),'postCount',jsonb_array_length(post_ids),'state','offered'))
       RETURNING id INTO msg_id;
      UPDATE deliverable_offers SET message_id=msg_id WHERE id=o.id;
      message_ids:=message_ids||jsonb_build_array(msg_id);
     END IF;
     ```
     The offer card is therefore the last message of the result, after the reply text.
   - e. Change `output:=...` to `output:=jsonb_build_object('taskId',t.id,'documentId',NULL,'offerId',o.id,'postIds',post_ids,'messageIds',message_ids);`. (`doc_id` stays declared but is always NULL; you may remove the variable.)
4. New user RPC `accept_deliverable_offer(p_offer_id uuid) RETURNS jsonb`:
   - `SELECT * INTO o FROM deliverable_offers WHERE id=p_offer_id AND workspace_id=auth.uid() FOR UPDATE;` If not found → `RAISE EXCEPTION 'NOT_FOUND'`.
   - If `o.state='saved'` → `RETURN jsonb_build_object('deliverableId',o.deliverable_id,'type',o.proposed_type)` (idempotent double-click).
   - `state='dismissed'` is allowed to continue (the owner changed their mind).
   - Read the task: `SELECT * INTO t FROM tasks WHERE id=o.task_id AND workspace_id=o.workspace_id`.
   - `INSERT INTO deliverables(workspace_id,task_id,title,type,content,origin,context_refs,source_refs,limitations) VALUES(o.workspace_id,o.task_id,o.title,o.proposed_type,o.content,t.origin,coalesce(t.checkpoint->'contextRefs','[]'),o.source_refs,o.limitations) RETURNING * INTO d;`
   - `INSERT INTO deliverable_versions(workspace_id,deliverable_id,version,title,content,context_refs,source_refs,limitations) VALUES(d.workspace_id,d.id,d.version,d.title,d.content,d.context_refs,d.source_refs,d.limitations);`
   - Document dependencies. For each `ref` in `coalesce(t.checkpoint->'contextRefs','[]')`:
     - Look up `brain_nodes` by `(ref->>'nodeId')::uuid` in the same workspace. If not found → `UPDATE deliverables SET stale_reason='Business context was deleted after this result was generated.' WHERE id=d.id;` and continue.
     - Insert `context_dependencies(workspace_id,node_id,node_version,consumer_type,consumer_id,consumer_version)` = `(d.workspace_id, node.id, (ref->>'version')::integer, 'document', d.id, 1)`.
     - If `node.version<>(ref->>'version')::integer OR node.approval_state<>'approved' OR NOT node.is_current` → `UPDATE deliverables SET stale_reason='Business context changed after this result was generated: '||node.title WHERE id=d.id;`. Do **not** call `mark_brain_context_changed` here.
   - If `jsonb_array_length(o.post_ids)>0`: `UPDATE planned_posts SET deliverable_id=d.id WHERE workspace_id=o.workspace_id AND id IN (SELECT (value#>>'{}')::uuid FROM jsonb_array_elements(o.post_ids));`
   - `UPDATE deliverable_offers SET state='saved', deliverable_id=d.id, decided_at=now() WHERE id=o.id;`
   - `UPDATE messages SET payload=payload||jsonb_build_object('state','saved','deliverableId',d.id) WHERE id=o.message_id AND workspace_id=o.workspace_id;`
   - `INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id) VALUES(o.workspace_id,auth.uid(),'deliverable_saved','deliverable',d.id);`
   - `RETURN jsonb_build_object('deliverableId',d.id,'type',d.type);`
5. New user RPC `dismiss_deliverable_offer(p_offer_id uuid) RETURNS void`: ownership check as above (`NOT_FOUND`). If `state='offered'` → `state='dismissed', decided_at=now()` and `UPDATE messages SET payload=payload||jsonb_build_object('state','dismissed') WHERE id=o.message_id`. If already `saved` or `dismissed` → do nothing.
6. REVOKE/GRANT both RPCs per rule 0.3.6 (user RPCs → `authenticated`).
7. Update the message-kind list in `docs/phase-1-2/02-contracts.md` line 141 to include `deliverable_offer`.

> Existing `deliverable_card` messages keep rendering as today. No backfill.

### 1.2 Section routing rules (deterministic, in TypeScript, not by the AI)

Create `src/lib/deliverableRouting.ts`:

```ts
import type { Deliverable } from './types'
import type { TaskIntent } from '../features/tasks/types'

export type DeliverableType = Deliverable['type']

/** Maps a finished task to the Deliverables section it belongs to. */
export function sectionForTask(intent: TaskIntent, postsWithProposedTimes: number): DeliverableType {
  switch (intent) {
    case 'market_research': return 'research_report'        // future; research is not implemented yet
    case 'competitor_analysis': return 'competitor_analysis' // future
    case 'performance_diagnosis': return 'performance_diagnosis'
    case 'campaign_planning': return postsWithProposedTimes > 0 ? 'content_calendar' : 'general'
    case 'content_creation': return 'content_posts'
    case 'simple_answer': return 'general' // only offered when isSubstantialReply() is true
  }
}

/** A plain chat reply is offered for saving only when it is long-form. */
export function isSubstantialReply(text: string): boolean {
  const t = text.trim()
  const listItems = t.match(/^\s*(?:[-*]|\d+[.)])\s/gm)?.length ?? 0
  return t.length >= 900 || /^#{1,3}\s/m.test(t) || listItems >= 5
}

/** Title for a saved chat reply: its first markdown heading, else the first 80 characters of the request. */
export function replyTitle(reply: string, request: string): string {
  const heading = reply.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim()
  return (heading || request.trim().slice(0, 80) || 'Director answer').slice(0, 200)
}
```

Rules table (copy into a code comment above `sectionForTask`):

| Intent | Offer? | Section (`type`) | Document content |
|---|---|---|---|
| `simple_answer` (both `mode='reply'` and `mode='task'`) | Only if `isSubstantialReply(reply)` | `general` | The reply markdown. Title = `replyTitle(reply, task.user_request)`. |
| `content_creation` | Yes | `content_posts` | `postsMarkdown(posts, timezone)` (§1.4). |
| `campaign_planning` with a brief and ≥1 proposed time | Yes | `content_calendar` | Brief markdown + `scheduleTable(posts, timezone)`. |
| `campaign_planning` with a brief and no times | Yes | `general` | Brief markdown. |
| `campaign_planning` without a brief | No offer | — | (Posts are still saved as drafts.) |
| `performance_diagnosis` | Yes | `performance_diagnosis` | The diagnosis markdown. |
| `market_research` / `competitor_analysis` | Not reachable yet | `research_report` / `competitor_analysis` | Future. |

### 1.3 Executor changes: `src/server/task-executor.ts`

1. Import `sectionForTask`, `isSubstantialReply`, `replyTitle` from `../lib/deliverableRouting` and `postsMarkdown`, `scheduleTable` from `../lib/deliverableMarkdown`.
2. Define once, inside `executeTask` after `prompt` (line 79): `const timezone = () => task.checkpoint.context?.region?.timezone || 'UTC'`.
3. **Route phase, `mode='reply'` (line 87).** Replace the output with:
   ```ts
   const document = isSubstantialReply(route.reply) ? { document: { title: replyTitle(route.reply, task.user_request), content: route.reply, type: 'general' as const } } : {}
   await checkpoint({ ...task.checkpoint, route, phase: 'persist', output: { reply: route.reply, posts: [], ...document } })
   ```
4. **Generate phase, posts branch (lines 95–104).**
   - `content_creation`: set `document = { title: ('Post drafts: ' + task.user_request.trim().slice(0, 80)).slice(0, 200), content: postsMarkdown(draft.posts, timezone()), type: 'content_posts' }`.
   - `campaign_planning` with `hasBrief`: `const timed = draft.posts.filter(p => p.proposedAt).length`; `document = { title: draft.title!, content: draft.content! + (timed ? '\n\n' + scheduleTable(draft.posts, timezone()) : ''), type: sectionForTask('campaign_planning', timed) }`.
   - `campaign_planning` without a brief: no document (unchanged).
   - Reply text (replace line 104's string): `` `${draft.posts.length} draft ${draft.posts.length===1?'Post is':'Posts are'} ready for your review in Calendar & Publishing. Nothing has been approved or published.` ``
5. **Generate phase, other branch (lines 106–108).**
   - Diagnosis: reply `'Your diagnosis is ready. Choose whether to save it to Deliverables.'`; document unchanged except `type: sectionForTask('performance_diagnosis', 0)`.
   - Non-diagnosis `simple_answer`: if `isSubstantialReply(text)` add `document: { title: replyTitle(text, task.user_request), content: text, type: 'general' }`.
6. Update the `save_task_result` return type on line 114 to `{taskId:string;documentId:string|null;offerId:string|null;postIds:string[];messageIds:string[]}`, and add `offerId?: string|null` to `TaskOutputRefs` in `src/features/tasks/types.ts`.
7. Do **not** change routing, retries, checkpoints, or abort handling.

### 1.4 Deterministic markdown builders: `src/lib/deliverableMarkdown.ts`

Pure functions, no AI calls, no I/O. Use `formatWorkspaceTime` from `src/lib/region.ts`.

- `postsMarkdown(posts: TaskOutput['posts'], timezone: string): string` →
  `# Post drafts` + blank line + `_Snapshot at save time. The live posts are in Calendar & Publishing._` then, for each post (1-based `n`): `## Post n`, the caption, a blank line, the hashtags (if any), then `*Proposed time:* <formatWorkspaceTime(proposedAt, timezone)>` if `proposedAt`, then `*Status:* Draft. Review and approve in Calendar & Publishing.`
- `scheduleTable(posts: TaskOutput['posts'], timezone: string): string` → `## Schedule` + a markdown table `| # | Proposed time | First line of caption |`, one row per post; posts without `proposedAt` show `Not set`. Escape `|` in captions as `\|`.

### 1.5 Chat UI: `src/screens/EmployeePage.tsx`

1. In the message renderer, add a branch **directly before** the `deliverable_card` branch (line 754):
   `if (msg.type === 'deliverable_offer') return <DeliverableOfferCard msg={msg} />`
2. Create `src/components/chat/DeliverableOfferCard.tsx` (client component):
   - Layout copies the agent bubble of the `deliverable_card` branch (lines 762–766): Bot avatar circle + `.card max-w-[95%] sm:max-w-[85%] p-3.5 sm:p-4`.
   - Shows: badge `t('type_' + proposedType)` (keys exist, e.g. `type_content_posts`), the title, a 3-line clamped preview (`<MarkdownContent content={preview} className="line-clamp-3 text-sm text-ink-700" />`), and `t('offerQuestion', { section })`.
   - Buttons: `.btn-primary` `t('offerSave')` and `.btn-secondary` `t('offerNotNow')`.
   - Save → `acceptDeliverableOffer(offerId)` (§1.6). While pending, disable both buttons. On success, replace the buttons with `t('offerSaved', { section })` + a link `t('offerOpen')` to `'/deliverables?document=' + deliverableId`.
   - Not now → `dismissDeliverableOffer(offerId)`; then show muted `t('offerDismissed')` with a small text button `t('offerSave')` that calls accept again.
   - Initial state comes from `msg.payload.state` (`offered | saved | dismissed`) and `msg.payload.deliverableId`, so a refresh shows the right state.
   - Errors: inline `text-xs text-red-600`, buttons stay enabled for retry.
3. Do not change other message renderers except §3.4.

### 1.6 Server actions: `src/server/deliverable-offers.ts`

```ts
'use server'
import { getIdentity } from './auth'
export async function acceptDeliverableOffer(offerId: string): Promise<{ deliverableId?: string; type?: string; error?: string }>
export async function dismissDeliverableOffer(offerId: string): Promise<{ error?: string }>
```
- Validate `offerId` against `/^[0-9a-f-]{36}$/i`. No identity → `{ error: 'Sign in again.' }`.
- Call the RPCs with `identity.supabase.rpc('accept_deliverable_offer', { p_offer_id })` / `dismiss_deliverable_offer`. Check the returned `error` (Supabase does not throw). Map a message containing `NOT_FOUND` to "This result no longer exists." and anything else to "Could not save. Please retry." Never return raw DB errors.

### 1.7 Copy strings (add to `src/lib/i18n.ts`)

`offerQuestion: 'Save this to Deliverables → {section}?'`, `offerSave: 'Save to Deliverables'`, `offerNotNow: 'Not now'`, `offerSaved: 'Saved to {section}'`, `offerDismissed: 'Not saved. You can still save it.'`, `offerOpen: 'Open'`. `{section}` is `t('type_' + proposedType)`.

### 1.8 Phase 1 acceptance checks

1. Ask "Write 3 Facebook posts for our offer" → 3 post references, the reply text, then one offer card "Save this to Deliverables → Content Posts?". Deliverables page shows **nothing new** before clicking.
2. Click **Save** → card shows "Saved to Content Posts"; Deliverables → **Content Posts** lists the document; its content lists the 3 posts.
3. Double-click Save quickly → only **one** deliverable exists.
4. Ask for a campaign plan → offer says **General** (in Phase 1 there are no proposed times yet; after Phase 2 it says **Content Calendar**).
5. Ask "diagnose why sales are slow" → offer says **Performance Diagnosis**.
6. Ask "hi" → normal reply, **no** offer card.
7. Ask a question that yields a long structured answer (≥ 5 list items or a heading) → offer says **General**.
8. Click **Not now**, refresh → card still shows the dismissed state; Save from there still works.
9. All checks in rule 0.3.11 pass.

---

## 2. Phase 2: AI-proposed post times (Facebook only)

**Goal:** every generated post carries a **proposed** date/time that shows in the calendar as *Proposed* (not scheduled).

### 2.1 Prompt changes: `src/server/ai/operations.ts`

1. `copy` prompt: remove "No invented dates or destinations." `campaign` prompt: remove "No invented dates."
2. In both, change the post JSON shape to `{"caption":"...","hashtags":"...","visualBrief":"...","proposedLocalTime":"YYYY-MM-DDTHH:mm"}` and add: "`proposedLocalTime` is a suggested publish time as local wall-clock time in the workspace timezone given in `context.region.timezone`, between 1 hour and 60 days after `now`, between 09:00 and 21:00, at least 1 day apart unless the user asked otherwise. If the user gave explicit dates, use them. These are suggestions the owner will confirm. The destination is a Facebook Page; do not output a platform."
3. Do **not** change `validateOutput`: it already ignores unknown keys, so a missing or malformed `proposedLocalTime` never rejects the response.

### 2.2 Prompt payload: `src/server/task-executor.ts`

In `prompt()` (line 79), add `now: new Date().toISOString()` to the JSON object. The region with `timezone` is already in `context`.

### 2.3 Parsing and time conversion

1. In `src/lib/calendar.ts`, add `localToInstant(local: string, timeZone: string): string | null`, without new libraries:
   - Accept only `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/`; else `null`.
   - Let `guess = Date.UTC(y, m-1, d, hh, mm)`. Compute the zone offset at `guess` from `zonedParts(new Date(guess), timeZone)` (offset = zoned wall time as UTC millis − `guess`). `candidate = guess − offset`. Recompute the offset at `candidate` and set `candidate = guess − offset2`.
   - Verify `zonedParts(new Date(candidate), timeZone)` has the same year, month, day, hour and minute as the input. If not (DST gap) → `null`. Else return `new Date(candidate).toISOString()`.
   - This function is used on the server (here) and in the browser (§5.4 Schedule dialog).
2. Change `parsePosts` in `src/server/task-executor.ts` to `parsePosts(text: string, quantity: number, timeZone: string, now: Date)`:
   - Force `platform: 'facebook'` for every post (remove the instagram branch).
   - `const instant = typeof post.proposedLocalTime === 'string' ? localToInstant(post.proposedLocalTime, timeZone) : null`.
   - Keep `instant` only if `now + 1 hour ≤ instant ≤ now + 60 days`; else `null`.
   - Push `proposedAt: instant` (UTC ISO or null) on each post.
   - Update the call at line 97: `parsePosts(await call(...), route.quantity, timezone(), new Date())`.
3. In `src/features/tasks/types.ts`, add `proposedAt?: string | null` (UTC ISO) to the post shape in `TaskOutput['posts']`, and narrow `platform` to `'facebook'`.

### 2.4 Database: `supabase/migrations/20261121110000_post_proposed_time.sql`

1. `ALTER TABLE planned_posts ADD COLUMN proposed_for timestamptz;` This is the **proposed** time. `scheduled_for` keeps meaning the time of the **active publish approval**, set only by `schedule_post` (Phase 5).
2. `CREATE OR REPLACE FUNCTION save_task_result(...)`: copy the **entire body from `20261121100000_deliverable_save_offers.sql`** (the Phase 1 version) and make exactly these changes in the posts loop:
   - Before the `INSERT INTO planned_posts`, compute the time safely:
     ```sql
     prop:=NULL;
     BEGIN prop:=nullif(item->>'proposedAt','')::timestamptz; EXCEPTION WHEN others THEN prop:=NULL; END;
     IF prop IS NOT NULL AND prop<=now() THEN prop:=NULL; END IF;
     ```
     (Declare `prop timestamptz;`.)
   - Add `proposed_for` to the `planned_posts` insert column list with value `prop`.
   - Add `'proposedAt',prop` to the `post_versions.provenance` `jsonb_build_object`.
   - Add `'proposedFor',p.proposed_for` to the `post_reference` message payload `jsonb_build_object`.
3. **Version lineage of `save_task_result`** (the newest file that defines it is what runs):
   `20261119070000_task_attempts.sql` → `20261121100000_deliverable_save_offers.sql` (Phase 1 changes) → `20261121110000_post_proposed_time.sql` (Phase 1 body + the three Phase 2 changes). Each file holds the complete function. No later phase changes `save_task_result`. Self-check after writing: diff the new body against the previous file's body and confirm that only the listed lines differ.
4. Add to `PlannedPost` in `src/lib/types.ts`: `proposed_for: string | null`, `version: number`, `approval_state: 'unapproved' | 'approved' | 'rejected'`, `execution_state: 'idle' | 'scheduled' | 'submitted' | 'confirmed' | 'failed' | 'uncertain' | 'held' | 'cancelled' | 'owner_reported'`, `published_at: string | null`, `current_version_id: string | null`, `holds?: { reason: string; kind: string }[]`. Change `scheduled_for` to `string | null`. (`loadPosts` uses `select('*')`, so the fields arrive.) Do §2.5 in the same change, so the type errors are fixed by `planTime()`, not by guards that hide posts.

### 2.5 Calendar placement rule: `src/screens/CalendarPage.tsx`

1. Add to `src/lib/calendar.ts`: `export function planTime(post: { scheduled_for: string | null; proposed_for: string | null }): string | null { return post.scheduled_for ?? post.proposed_for }`.
2. Replace `post.scheduled_for` with `planTime(post)` in **all** these places:
   - memos at lines 102–112 (`scheduled`, `unscheduled`, `byDay` and its sort). Inside `byDay` the value is non-null, so use `planTime(post)!` there;
   - week grid lines 466, 478, 481;
   - `PostChip` lines 507, 512, 516;
   - `PostCard` time line 562 (`planTime(post) ? formatWorkspaceTime(planTime(post)!, tz) : t('calendarNoTime')`).
3. A post whose `scheduled_for` is null but `proposed_for` is set is **proposed**. Render it with a dashed border (`border-dashed`) and a small badge `t('proposedBadge')` = "Proposed" (`badge bg-ink-100 text-ink-600`) in `PostChip` and in the week grid item. Scheduled posts keep their current look. This is the only visual change to the grid.
4. Posts with neither time stay in **Unscheduled** (unchanged).
5. In `src/components/chat/PostPreview.tsx` line 10, the prop is already `scheduled_for?: string | null`; no change.

### 2.6 Phase 2 acceptance checks

1. "Write 3 posts for next week" → 3 posts each with `proposed_for` on different days at 09:00–21:00 workspace time.
2. Month and week view show them on those days with the **Proposed** badge and dashed border; none appear as Scheduled. No date shows as 1970.
3. A workspace with timezone `Africa/Cairo` shows a 10:00 proposal as 10:00.
4. A malformed `proposedLocalTime` from the AI does not fail the task; the post lands in Unscheduled.
5. A campaign plan with timed posts → the offer says **Content Calendar**, and the saved document contains the schedule table.
6. All checks in rule 0.3.11 pass.

---

## 3. Phase 3: Facebook-style post preview

**Goal:** posts look like a Facebook Page post in the chat and in the calendar.

### 3.1 Component: `src/components/publishing/FacebookPostPreview.tsx`

Props:
```ts
{ pageName: string; caption: string; hashtags?: string | null;
  timeLabelKind: 'draft' | 'proposed' | 'scheduled' | 'published';
  time?: string | null /* UTC ISO; ignored for 'draft' */;
  timezone: string; compact?: boolean }
```
Render (Tailwind, neutral colors, inside the parent `.card`):
1. Header row: 40px circle avatar (`bg-primary-100 text-primary-700`, first letter of `pageName`), then a column: **pageName** (`text-sm font-semibold text-ink-900`), second line `text-xs text-ink-500`: time text + " · " + `Globe` icon (lucide, size 12). Time text: `draft` → "Draft"; `proposed` → "Proposed · " + time; `scheduled` → "Scheduled · " + time; `published` → time. Format with `formatWorkspaceTime(time, timezone)`.
2. Body: caption `whitespace-pre-wrap text-sm text-ink-900`, `dir="auto"`. If longer than 280 characters and not expanded: first 280 + "… " + a **See more** button (`text-ink-500 font-semibold`) that expands. Hashtags on a new line in `text-[#385898]` (Facebook link blue; the one allowed hardcoded color) with `dir="ltr"`.
3. No reaction counts (we have no real metrics; never fake numbers).
4. Divider `border-t border-ink-100`, then an action bar of three equal **non-interactive** `div`s: `ThumbsUp` "Like", `MessageCircle` "Comment", `Share2` "Share" (`text-xs font-semibold text-ink-500`), with `aria-hidden="true"` on the bar.
5. `compact` → caption `line-clamp-3`, no See more, smaller padding.
6. A `sr-only` label: "Preview of how this post will appear on Facebook".

### 3.2 Page identity: one status call per page

- Add to `src/server/publishing-actions.ts` (created here, extended in §5.3):
  ```ts
  'use server'
  export interface PublishingStatus { configured: boolean; connection: { status: 'connected' | 'expired' | 'disconnected'; pageName: string | null } | null; autoPublishActive: boolean }
  export async function loadPublishingStatus(): Promise<PublishingStatus>
  ```
  - `configured = getPublishingProvider() !== null` (§4.4). Before Phase 4 exists, return `configured: false`.
  - `connection` = `identity.supabase.from('platform_connections').select('status,page_name').eq('platform','facebook').maybeSingle()`.
  - `autoPublishActive` = the heartbeat check from §6.1 (return `false` until Phase 6 exists).
- Page name for previews = `connection.pageName` when `status='connected'`, else `t('fbPageFallback')` = "Your Facebook Page". (`WorkspaceSettings` has no business-name field; do not look for one.)
- Call `loadPublishingStatus()` **once** in the top-level component of `CalendarPage` and of `EmployeePage` (in a `useEffect`), keep it in state, and pass `pageName` down as a prop. Do not call it per preview.

### 3.3 Calendar cards: `src/screens/CalendarPage.tsx`

- In `PostCard` (line 521), replace **only** the caption and hashtags block (~lines 566–572) with `<FacebookPostPreview compact ... />`. Keep the badges, time line, error line and buttons in place.
- `timeLabelKind` and `time`: `published` + `published_at` if `status='published'`; else `scheduled` + `scheduled_for` if set; else `proposed` + `proposed_for` if set; else `draft`.

### 3.4 Chat: `src/screens/EmployeePage.tsx`

- `post_reference` branch (line 747): keep the link to `/scheduling?post=<id>` and the heading. Replace the caption `<p>` with `<FacebookPostPreview compact pageName={pageName} caption={String(msg.payload?.caption ?? msg.content)} timeLabelKind={msg.payload?.proposedFor ? 'proposed' : 'draft'} time={msg.payload?.proposedFor ?? null} timezone={tz} />`. `proposedFor` is already written by §2.4.2. Thread `pageName` and `tz` into the renderer as props.
- `deliverable_card` (legacy messages): leave `PostPreviewCard` as is.
- `src/components/chat/AgentCanvas.tsx` (~line 50): no change.

### 3.5 Phase 3 acceptance checks

1. Chat post references render as Facebook-style cards with page name, "Proposed · <time>" or "Draft", text, See more for long text (non-compact use only), and the Like/Comment/Share bar.
2. Calendar cards show the same preview; buttons and statuses unchanged.
3. No fake like/comment counts anywhere.
4. Mobile width 375px: no horizontal scroll; the preview wraps.
5. All checks in rule 0.3.11 pass.

---

## 4. Phase 4: Connect a Facebook Page through Composio

**Goal:** the owner connects one Facebook Page from Settings. BUSMORA stores an opaque connection reference and which Page to publish to.

### 4.1 Prerequisites (owner does these; the agent must not invent keys)

1. Create a **project API key** in the Composio dashboard (*Settings → Project Settings → API Keys*); it typically starts with `ak_`. The key currently in `.env` (`ck_...`) is **rejected** by the Composio API and must be replaced.
2. Create an **Auth Config** for toolkit `facebook` using **Composio managed** auth. Copy its id (`ac_...`).
3. Add to `.env` (server-only) and to `.env.example` with empty values and comments:
   ```
   COMPOSIO_API_KEY=                   # Composio project API key (server-only)
   COMPOSIO_FACEBOOK_AUTH_CONFIG_ID=   # ac_... managed Facebook auth config
   PUBLISHING_PROVIDER=composio        # composio | fake | disabled  (fake is refused in production)
   PUBLISHING_FAKE_OUTCOME=confirmed   # fake only: confirmed | failed | uncertain | timeout
   CRON_SECRET=                        # long random string for /api/cron/publish-due
   ```
   If the selected provider is not configured, every publishing UI shows "Publishing is not configured on this server." and the rest of the app keeps working.

### 4.2 Install and verify the SDK

1. `npm install @composio/core` (ESM; local Node is 24). Do **not** use `composio-core` (legacy v1).
2. **Verify before writing the adapter**, with a throwaway script in your scratch directory (not in the repo):
   - the Facebook tool slugs and input schemas for listing managed Pages and creating a Page post (only these two; BUSMORA never edits, deletes or reads back Facebook posts): `composio.tools.get('<any user id>', { toolkits: ['facebook'], limit: 100 })`. Expected from the docs (21 Nov 2026): `FACEBOOK_LIST_MANAGED_PAGES`, `FACEBOOK_CREATE_POST` (args include `page_id`, `message`, `published`);
   - the option name for the callback URL in `connectedAccounts.initiate` (read the types in `node_modules/@composio/core`);
   - **the exact query parameters Composio appends to the callback URL** (expected `status` and `connected_account_id`): run one real connect in development and log the callback URL's parameter **names** only;
   - the method name for removing a connected account (expected `connectedAccounts.delete`).
   Record every verified name at the top of `composio-provider.ts`. If a name differs from this plan, use the verified one.

### 4.3 Adapter interface: `src/server/publishing/provider.ts`

```ts
import 'server-only'
/** Opaque provider reference to one authorized account. Stored in platform_connections.external_account_id. Never sent to the browser. */
export type ConnectionRef = string
export interface FacebookPage { id: string; name: string }
export type PublishOutcome =
  | { kind: 'confirmed'; providerPostId: string; permalink: string | null; evidence: Record<string, unknown> }
  | { kind: 'failed'; code: 'auth_expired' | 'permission_denied' | 'invalid_request' | 'provider_error' }   // definitely not published
  | { kind: 'uncertain'; code: 'timeout' | 'network' | 'unknown' }                                          // may have published
export interface PublishingProvider {
  readonly name: string
  /** Returns the provider's consent URL. callbackUrl is where the provider sends the browser back. */
  startConnection(workspaceId: string, callbackUrl: string): Promise<{ redirectUrl: string }>
  /** Reads the provider's callback parameters, checks the account is active, belongs to workspaceId, and is Facebook. */
  completeConnection(workspaceId: string, callbackParams: URLSearchParams): Promise<{ ok: true; connectionRef: ConnectionRef } | { ok: false; reason: 'denied' | 'invalid' }>
  verifyConnection(workspaceId: string, connectionRef: ConnectionRef): Promise<boolean>
  listPages(workspaceId: string, connectionRef: ConnectionRef): Promise<FacebookPage[]>
  /** Never throws. Must finish within 20 seconds; a timeout after sending is 'uncertain'. */
  publishText(input: { workspaceId: string; connectionRef: ConnectionRef; pageId: string; message: string }): Promise<PublishOutcome>
  /** Ignores "not found". */
  disconnect(workspaceId: string, connectionRef: ConnectionRef): Promise<void>
}
/** null when PUBLISHING_PROVIDER is 'disabled', unknown, missing its env vars, or 'fake' while NODE_ENV==='production'. */
export function getPublishingProvider(): PublishingProvider | null
```
The interface is complete as written: connect (`startConnection`, `completeConnection`, `verifyConnection`), `listPages`, `publishText`, `disconnect`. It deliberately has no method that edits, deletes, unpublishes or reads back a Facebook post (§0.2, §9); keep it that way in both adapters.
Routes and `publish-core` depend only on this interface. Nothing outside `src/server/publishing/*-provider.ts` imports `@composio/core` or knows Composio parameter names.

### 4.4 Composio adapter: `src/server/publishing/composio-provider.ts`

- `new Composio({ apiKey: process.env.COMPOSIO_API_KEY })`, created lazily once per server process.
- **Composio user id = BUSMORA workspace id** (UUID). Never take it from client input.
- `startConnection`: `composio.connectedAccounts.initiate(workspaceId, process.env.COMPOSIO_FACEBOOK_AUTH_CONFIG_ID, { <verified callback option>: callbackUrl })` → `{ redirectUrl }`.
- `completeConnection`: read the verified parameter names from `callbackParams`. Status not success → `{ok:false, reason:'denied'}`. Then `connectedAccounts.get(id)`: ok only if status is ACTIVE **and** its user id equals `workspaceId` **and** its toolkit is `facebook`; else `{ok:false, reason:'invalid'}`. The `connectionRef` is the connected account id.
- `verifyConnection`: the same three checks for a known ref.
- `listPages`: execute the verified list-pages tool for that user and account; map to `{id, name}`.
- `publishText`: execute the verified create-post tool with `{ page_id, message, published: true }`, bounded to 20 s (`AbortSignal.timeout(20000)` if the SDK accepts a signal, else `Promise.race` with a timer). Catch everything; never throw.
  - Successful response with an id → `confirmed`. Permalink `https://www.facebook.com/<id>` only if the id has the `pageid_postid` form, else `null`. `evidence` keeps only safe fields (id, log id). Never tokens.
  - An explicit provider error → `failed` with `auth_expired`, `permission_denied`, `invalid_request` or `provider_error`.
  - A timeout, network error or unreadable result **after** the call was sent → `uncertain` (`timeout`, `network`, `unknown`).
- `disconnect`: the verified delete method; ignore "not found".

### 4.5 Fake adapter: `src/server/publishing/fake-provider.ts` (development and tests only)

- Selected by `PUBLISHING_PROVIDER=fake`. `getPublishingProvider()` returns `null` and logs a server error if this is set while `NODE_ENV==='production'`.
- `startConnection` → `{ redirectUrl: callbackUrl + (callbackUrl.includes('?') ? '&' : '?') + 'fake_status=success' }`. `completeConnection` → `{ ok: true, connectionRef: 'fake:' + workspaceId }` when `fake_status=success`. `verifyConnection` → true for that ref. `listPages` → `[{ id: 'fake-page-1', name: 'Test Page (fake)' }]`.
- `publishText` returns according to `PUBLISHING_FAKE_OUTCOME`: `confirmed` → `{kind:'confirmed', providerPostId:'fake_'+crypto.randomUUID(), permalink:null, evidence:{fake:true}}`; `failed` → `invalid_request`; `uncertain` → `unknown`; `timeout` → wait 21 s, then `{kind:'uncertain', code:'timeout'}`.
- Evidence files (`docs/evidence/`) must never cite fake results as real publishing.

### 4.6 Database: `supabase/migrations/20261121120000_facebook_connection_rpcs.sql`

First, add a hold kind so re-scheduling knows which holds it may clear:
```sql
ALTER TABLE post_holds ADD COLUMN kind text NOT NULL DEFAULT 'context'
  CHECK (kind IN ('context','connection','missed_window','uncertain'));
```
Holds created by `save_task_result` and `mark_brain_context_changed` are Brain-context holds and correctly get the default `context`. Every new hold insert in this plan sets `kind` explicitly.

Server-only RPCs (grant to `service_role` only), called from server code with `createAdminClient()`:
1. `upsert_facebook_connection(p_workspace_id uuid, p_connection_ref text, p_page_id text, p_page_name text) RETURNS void`: upsert `platform_connections` on `(workspace_id, platform)` with `platform='facebook', external_account_id=p_connection_ref, page_id=p_page_id, page_name=p_page_name, account_name=p_page_name, status='connected', connected_at=now(), permissions='[]'::jsonb` (do not claim permissions that were not verified). If the row existed with a **different** `page_id` or `external_account_id`, also `authorization_generation = authorization_generation + 1` (this invalidates publish approvals for the old Page at claim time).
2. `disconnect_facebook_connection(p_workspace_id uuid) RETURNS void`: `status='disconnected'`, `authorization_generation = authorization_generation + 1`. Then for every post of that workspace with `execution_state='scheduled'`:
   - revoke its active publish approval (`UPDATE post_approvals SET revoked_at=now() WHERE post_id=... AND revoked_at IS NULL`);
   - `proposed_for = scheduled_for, scheduled_for = NULL, status = 'approved', execution_state = 'held'` (content approval stays; only the publish approval is gone);
   - insert `post_holds(workspace_id, post_id, kind, reason) = (..., 'connection', 'Facebook Page disconnected. Reconnect and schedule again to publish.')`.
   Never auto-release anything on reconnect.
3. `platform_connections` keeps the owner SELECT policy `"select own connections"`. Browser code reads connection data only through `loadPublishingStatus()` (§3.2), never directly.

### 4.7 Routes

All error bodies use `{ code, messageKey }` (`ApiFailure` in `src/lib/contracts.ts`); never forward raw provider bodies. Read the Next.js 16 docs for route handlers and `cookies()` first.

1. `POST /api/connections/facebook/start` → `src/app/api/connections/facebook/start/route.ts`:
   `requireApiIdentity(request)`; provider null → 503 `{code:'publishing_not_configured', messageKey:'publishingNotConfigured'}`. Create a random nonce (32 bytes, base64url), set it as httpOnly cookie `fb_connect` (10 minutes, `SameSite=Lax`, `Path=/api/connections/facebook`, `Secure` in production). Call `startConnection(user.id, origin + '/api/connections/facebook/callback?nonce=' + nonce)` → `{ redirectUrl }`. The browser then sets `window.location.href = redirectUrl`.
2. `GET /api/connections/facebook/callback`: `getIdentity()`; none → redirect `/signin`. The `nonce` query param must equal the `fb_connect` cookie; else redirect `/settings?facebook=failed`. Clear `fb_connect` (single use). `completeConnection(user.id, url.searchParams)`; not ok → redirect `/settings?facebook=failed`. Then `listPages`:
   - 0 pages → redirect `/settings?facebook=no_pages`.
   - 1 page → `upsert_facebook_connection` → redirect `/settings?facebook=connected`.
   - more than 1 → store the `connectionRef` in httpOnly cookie `fb_pending` (10 minutes, same flags) and redirect `/settings?facebook=choose_page`.
3. `GET /api/connections/facebook/pages` → identity + `fb_pending` cookie → `verifyConnection(user.id, ref)` must be true (the cookie is not signed, so always re-check) → `[{id, name}]`.
4. `POST /api/connections/facebook/select` `{ pageId }` → identity + cookie → `verifyConnection(user.id, ref)` must be true → `pageId` must be in `listPages(user.id, ref)` → `upsert_facebook_connection` → clear `fb_pending` → `{ ok: true }`.
5. `POST /api/connections/facebook/disconnect` → identity → read `external_account_id` with the admin client → `provider.disconnect(...)` (if a provider exists) → `disconnect_facebook_connection` → `{ ok: true }`.

### 4.8 Settings UI: `src/screens/SettingsPage.tsx`

Add **one new card below the existing settings card** (same classes as line 131: `card p-4 sm:p-6 border border-ink-200/80 shadow-card`), titled **Connected accounts**. Load state with `loadPublishingStatus()` on mount, so "not configured" shows **without** clicking anything.
- Row: lucide `Facebook` icon, "Facebook Page", a status badge: `Connected` (`badge bg-emerald-50 text-emerald-700`), `Not connected` (`badge bg-ink-100 text-ink-600`), `Reconnect needed` (`badge bg-amber-50 text-amber-700`, when `status='expired'`).
- `configured=false` → muted text "Publishing is not configured on this server." and no Connect button.
- Not connected or expired → `.btn-primary` **Connect Facebook Page** → POST start route.
- Connected → page name + `.btn-secondary` **Disconnect** → confirm dialog (built per §0.4) "Scheduled posts will be held and must be scheduled again after reconnecting." → POST disconnect.
- `?facebook=choose_page` → GET pages, show a radio list (`.input-field` styling) + **Use this Page** → POST select.
- `?facebook=connected|failed|no_pages` → an inline message.
- Add every new string to `src/lib/i18n.ts`.

### 4.9 Phase 4 acceptance checks

1. With `PUBLISHING_PROVIDER=disabled`: Settings shows "Publishing is not configured on this server." on load; the app otherwise works.
2. With `PUBLISHING_PROVIDER=fake`: Connect → back to Settings → "Connected · Test Page (fake)".
3. With Composio: Connect → Facebook consent → back to Settings → "Connected · <Page name>". With several Pages → picker → chosen Page saved.
4. Opening the callback URL a second time (reused nonce) → `?facebook=failed`, nothing changes.
5. Disconnect → status Not connected; any scheduled post becomes held with status Approved.
6. **Real-world check required by the PRD:** connect using a Facebook account that has **no role** on any BUSMORA Meta app. Record the result (works / blocked) in `docs/evidence/`. If blocked, stop and tell the owner; do not work around it.
7. All checks in rule 0.3.11 pass.

---

## 5. Phase 5: Two-step approval, Publish now, and the publishing core

**Goal:** the owner approves the text (step 1), then schedules it, publishes it now, or publishes it themselves (step 2). Every send is claimed once, recorded, and verified.

### 5.0 Post states used in this phase

| What the owner sees | `status` | `approval_state` | `execution_state` | Active `post_approvals` row |
|---|---|---|---|---|
| Draft (maybe with a proposed time) | `draft` / `pending_approval` | `unapproved` | `idle` | no |
| Rejected | `rejected` | `rejected` | `idle` | no |
| Approved (text OK, not scheduled) | `approved` | `approved` | `idle` | no |
| On hold | any | any | `held` | no (revoked) or yes for a context hold |
| Scheduled | `scheduled` | `approved` | `scheduled` | yes |
| Publishing | `publishing` | `approved` | `submitted` | yes |
| Published on Facebook | `published` | `approved` | `confirmed` | yes |
| Published by you | `published` | `approved` | `owner_reported` | no |
| Failed / Needs review | `failed` | `approved` | `failed` / `uncertain` | yes |

### 5.1 Database: `supabase/migrations/20261121130000_post_approval_and_publish.sql`

1. **Change `update_post`** (`CREATE OR REPLACE` with the same signature; copy the body from `20261119020000_planned_posts_rpcs.sql` lines 49–100):
   - Status transitions stay: `approved` (from draft/pending_approval/rejected), `rejected` (from draft/pending_approval/approved), `published` = "I published it" (only from `status='approved'` with `approval_state='approved'`; unchanged).
   - **Caption edit:** if `p.status IN ('published','publishing')` → `RAISE EXCEPTION 'LOCKED'` (a published post's history is not rewritten, and BUSMORA never changes a post on Facebook). Otherwise: create the new version as today; revoke the active publish approval (`UPDATE post_approvals SET revoked_at=now() WHERE post_id=p.id AND revoked_at IS NULL`); set `proposed_for = coalesce(scheduled_for, proposed_for)`, `scheduled_for = NULL`, `status = 'draft'`, `approval_state = 'unapproved'`, `execution_state = CASE WHEN execution_state='held' THEN 'held' ELSE 'idle' END`, `publish_result = NULL`. Resolve this post's unresolved holds of kind `connection` or `missed_window` (`resolved_at=now(), resolution='edited'`).
2. **Change `delete_post`**: before deleting each id, if `EXISTS (SELECT 1 FROM publish_attempts WHERE post_id=cur_id)` → `RAISE EXCEPTION 'HAS_PUBLISH_HISTORY'`. (The `publish_attempts` FKs are `NO ACTION`; publish evidence is kept.)
3. **User RPC** `schedule_post(p_post_id uuid, p_expected_version integer, p_instant timestamptz, p_zone text, p_lateness_minutes integer DEFAULT 30) RETURNS planned_posts`:
   - Lock the post (`workspace_id=auth.uid()` … `FOR UPDATE`); `NOT_FOUND` if missing; `VERSION_CONFLICT` if `version<>p_expected_version`.
   - Require `status IN ('approved','scheduled')` and `approval_state='approved'`, else `NOT_APPROVED` (step 1 must happen first).
   - Holds: resolve this post's unresolved holds of kind `connection` or `missed_window` (`resolved_at=now(), resolution='rescheduled'`). If any unresolved hold of kind `context` or `uncertain` remains → `HELD`.
   - Load the connection: `platform='facebook' AND status='connected' AND page_id IS NOT NULL`, else `NO_CONNECTION`.
   - Validate: `p_instant >= now() - interval '2 minutes'` (`TIME_IN_PAST`), `p_lateness_minutes BETWEEN 5 AND 240`, `EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=p_zone)` (`INVALID_ZONE`).
   - Build `st = jsonb_build_object('instant',p_instant,'zone',p_zone,'latenessAllowanceMinutes',p_lateness_minutes)`.
   - **Bind the exact version (PRD FR-34: a time or destination change creates a new Post Version).** Load `pv` = the current version.
     - If `pv.scheduled_time IS NULL AND pv.page_id IS NULL` → `UPDATE post_versions SET scheduled_time=st, page_id=conn.page_id, connection_id=conn.id WHERE id=pv.id`.
     - Else if `pv.scheduled_time IS DISTINCT FROM st OR pv.page_id IS DISTINCT FROM conn.page_id OR pv.connection_id IS DISTINCT FROM conn.id` → insert a new `post_versions` row (`revision = max+1`, same `text` and `provenance`, `scheduled_time=st`, `page_id`, `connection_id`) and set `planned_posts.current_version_id` to it.
     - If a `publish_attempts` row exists for the resulting version → `ALREADY_ATTEMPTED`.
   - Revoke any other active approval of this post (`revoked_at=now()`).
   - Approval row for the version: `UNIQUE(post_version_id)` holds, so if a (revoked) row exists for this version, update it in place (`revoked_at=NULL`, new `connection_id, page_id, authorization_generation, scheduled_time`); else insert `post_approvals(workspace_id, post_id, post_version_id, connection_id, page_id, authorization_generation, scheduled_time)`.
   - Update the post: `status='scheduled', execution_state='scheduled', scheduled_for=p_instant, version=version+1, updated_at=now()`.
   - `audit_log` (`action='post_scheduled'`). Return the post.
4. **User RPC** `unschedule_post(p_post_id uuid, p_expected_version integer) RETURNS planned_posts`: only if `execution_state='scheduled'` (else `INVALID_TRANSITION`); revoke the approval; `status='approved', execution_state='idle', proposed_for=scheduled_for, scheduled_for=NULL, version=version+1`.
5. **Server-only RPC** `claim_post_publish(p_post_id uuid, p_mode text) RETURNS jsonb`, `p_mode IN ('now','due')`. In this order:
   1. Lock the post. Load the active approval (`revoked_at IS NULL`) for `post_version_id = current_version_id`; none → `{state:'not_approved'}`.
   2. Load the connection. It must be `connected`, the same `id` as `approval.connection_id`, and the same `authorization_generation`. Otherwise revoke the approval; set `status='approved', execution_state='held', proposed_for=scheduled_for, scheduled_for=NULL`; insert hold `kind='connection'`, reason "The Facebook connection changed. Schedule again to publish."; return `{state:'held', reason:'auth_changed'}`.
   3. Any unresolved hold → `{state:'held'}` (do not claim).
   4. If `p_mode='due'`: if `now() < instant` → `{state:'not_due'}`. If `now() > instant + lateness` → revoke the approval; `status='approved', execution_state='held', proposed_for=scheduled_for, scheduled_for=NULL`; insert hold `kind='missed_window'`, reason "Missed its delivery window. Choose a new time and schedule again."; return `{state:'held', reason:'missed_window'}`.
   5. If a `publish_attempts` row exists for this `post_version_id` → `{state:'already_attempted'}` (**never send twice**).
   6. `INSERT INTO publish_attempts(workspace_id, post_id, post_version_id, connection_id, authorization_generation, state) VALUES (post.workspace_id, post.id, post.current_version_id, conn.id, conn.authorization_generation, 'claimed') RETURNING id`. Set the post `status='publishing', execution_state='submitted'`.
   7. Return `{state:'claimed', attemptId, workspaceId, pageId: approval.page_id, connectionRef: conn.external_account_id, message: <post_versions.text of the current version>}`.
6. **Server-only RPC** `record_publish_result(p_attempt_id uuid, p_state text, p_provider_id text, p_permalink text, p_evidence jsonb, p_error_code text) RETURNS void`:
   - `p_state IN ('confirmed','failed','uncertain')`.
   - Allowed attempt transitions: `claimed`/`submitted` → any of the three; `uncertain` with `error_code='stale_claim'` → `confirmed` (a late success). Anything else → return without changes (idempotent).
   - Update the attempt: `state=p_state, submitted_at=coalesce(submitted_at, now()), confirmed_at = CASE WHEN p_state='confirmed' THEN now() END, evidence=coalesce(p_evidence,'{}'), error_code=p_error_code, provider_id=p_provider_id, permalink=p_permalink`.
   - Update the post:
     - confirmed → `status='published', execution_state='confirmed', published_at=now(), publish_result=jsonb_build_object('provider','composio','id',p_provider_id,'permalink',p_permalink)`; resolve its `uncertain` holds (`resolution='confirmed_late'`).
     - failed → `status='failed', execution_state='failed', publish_result=jsonb_build_object('errorCode',p_error_code)`. If `p_error_code='auth_expired'` also `UPDATE platform_connections SET status='expired'` for that connection.
     - uncertain → `status='failed', execution_state='uncertain', publish_result=jsonb_build_object('errorCode',p_error_code)`, and insert a hold `kind='uncertain'`, reason "We could not confirm whether Facebook published this post. Check your Page before retrying."
   - Insert a `notifications` row (type `post_published` / `post_failed` / `post_needs_review`, `subject_type='post'`, `subject_id=post.id`), `dedupe_key='publish:'||p_attempt_id||':'||p_state`, `ON CONFLICT DO NOTHING`.
   - SQL stores **codes only**. The owner-facing text for each code lives in `src/lib/i18n.ts` (§5.5), the single source of truth.
7. **User RPC** `resolve_context_holds(p_post_id uuid, p_expected_version integer) RETURNS planned_posts`: the owner confirms "I reviewed it, keep this text". Resolve this post's unresolved holds of kind `context` (`resolved_at=now(), resolution='owner_reviewed'`). If the post had `status='scheduled'`: revoke its approval and set `status='approved', proposed_for=scheduled_for, scheduled_for=NULL` (the owner schedules again). If no unresolved holds remain and `execution_state='held'`: `execution_state='idle'`. `version=version+1`; `audit_log` (`post_context_reviewed`).
8. **User RPC** `prepare_post_retry(p_post_id uuid, p_expected_version integer) RETURNS planned_posts`: only when `execution_state IN ('failed','uncertain')`. Create a new `post_versions` revision (same `text`, `provenance`; `scheduled_time`, `page_id`, `connection_id` NULL) and set `current_version_id` to it. A new version is required because `publish_attempts` has `UNIQUE(post_version_id)`: one send per exact version. Set `status='approved', execution_state='idle', scheduled_for=NULL, publish_result=NULL, version=version+1`. Resolve this post's `uncertain` holds (`resolution='owner_checked_retry'`). For `uncertain`, the UI first makes the owner confirm "I checked my Page and it was not published".
9. **Server-only RPC** `mark_stale_publish_attempts() RETURNS integer`: for `publish_attempts` in state `claimed` or `submitted` with `created_at < now() - interval '10 minutes'`: set the attempt `state='uncertain', error_code='stale_claim'`; set the post `status='failed', execution_state='uncertain', publish_result=jsonb_build_object('errorCode','stale_claim')`; insert a hold `kind='uncertain'` with the uncertain reason above. Return the count. Never retries anything.
10. REVOKE/GRANT each function per rule 0.3.6.
11. Update `scripts/planned-posts-db-check.sql`: editing a published post now raises `LOCKED`, and a caption edit returns the post to `draft`. Add cases for: `schedule_post` refused before Approve (`NOT_APPROVED`); refused without a connection (`NO_CONNECTION`); a different time creates a new revision; `claim_post_publish` twice → second returns `already_attempted`; `delete_post` with an attempt → `HAS_PUBLISH_HISTORY`. Connection rows for the test must be inserted as the table owner (before `SET LOCAL ROLE authenticated`), because the client cannot write `platform_connections`.

### 5.2 Publishing core: `src/server/publishing/publish-core.ts`

Mirror the existing `executeTask(backend, ...)` pattern in `src/server/task-executor.ts`: dependencies are passed in, so tests can use the fake provider and a stub backend.

```ts
import 'server-only'
import type { PublishingProvider } from './provider'
export interface PublishBackend { rpc<T>(name: string, args: Record<string, unknown>): Promise<T> }
export type PublishResult =
  | { state: 'not_configured' | 'not_approved' | 'not_due' | 'already_attempted' }
  | { state: 'held'; reason?: 'auth_changed' | 'missed_window' }
  | { state: 'confirmed'; permalink: string | null }
  | { state: 'failed'; code: string }
  | { state: 'uncertain'; code: string }
export async function publishPost(deps: { db: PublishBackend; provider: PublishingProvider | null }, postId: string, mode: 'now' | 'due'): Promise<PublishResult>
/** Production wiring: admin Supabase client (throws on RPC error) + getPublishingProvider(). */
export function defaultPublishDeps(): { db: PublishBackend; provider: PublishingProvider | null }
```
1. `provider === null` → return `{state:'not_configured'}` **without** claiming.
2. `claim = await db.rpc('claim_post_publish', { p_post_id: postId, p_mode: mode })`. If `claim.state !== 'claimed'` → return `{ state: claim.state, reason: claim.reason }`.
3. `outcome = await provider.publishText({ workspaceId: claim.workspaceId, connectionRef: claim.connectionRef, pageId: claim.pageId, message: claim.message })`. If it throws anyway, treat it as `{kind:'uncertain', code:'unknown'}`.
4. `await db.rpc('record_publish_result', {...})` with the outcome. If recording fails, log a server error with the attempt id only (no secrets) and return `{state:'uncertain', code:'record_failed'}`. The attempt stays `claimed`, and `mark_stale_publish_attempts()` turns it into **Needs review** within about 10 minutes. It is **never** retried automatically.
5. Return the result matching the outcome.
6. **Never** call `publishPost` from render, page load, task completion, or connection callbacks.

### 5.3 Server actions: extend `src/server/publishing-actions.ts`

```ts
export async function schedulePost(postId: string, expectedVersion: number, instantIso: string, zone: string, latenessMinutes: number): Promise<{ error?: string }>
export async function unschedulePost(postId: string, expectedVersion: number): Promise<{ error?: string }>
export async function publishNow(postId: string, expectedVersion: number): Promise<{ result?: PublishResult; error?: string }>
export async function resolveContextHolds(postId: string, expectedVersion: number): Promise<{ error?: string }>
export async function preparePostRetry(postId: string, expectedVersion: number): Promise<{ error?: string }>
```
- All use `getIdentity()` and the user's Supabase client for user RPCs, and check the returned `error`.
- `publishNow`: (1) if `getPublishingProvider()` is null → `{ error: t('publishingNotConfigured') }` before touching the DB; (2) `schedule_post` with `p_instant = new Date().toISOString()`, `p_zone` = workspace timezone (from `workspace_settings`), lateness 30, `p_expected_version = expectedVersion`. This binds the exact version shown in the confirm dialog; (3) `publishPost(defaultPublishDeps(), postId, 'now')`.
- Map RPC errors to owner-safe messages (copy keys): `VERSION_CONFLICT` → "This post changed. Refresh and review it again."; `NOT_APPROVED` → "Approve the text first."; `NO_CONNECTION` → "Connect a Facebook Page in Settings first."; `HELD` → "This post is on hold. Review the reason first."; `TIME_IN_PAST` → "Choose a time in the future."; `ALREADY_ATTEMPTED` / result `already_attempted` → "This version is already being sent or was sent. Refresh to see its status." (the cron may have claimed it a moment earlier).
- In `src/server/calendar-actions.ts`, map `LOCKED` → "A published post cannot be edited." and `HAS_PUBLISH_HISTORY` → "This post has publishing history and cannot be deleted."

### 5.4 Calendar UI: `src/screens/CalendarPage.tsx` (minimal)

Keep the existing button styles (`btn-primary` / `btn-secondary` / `btn-danger`, `px-3 py-1.5 text-xs`). `CalendarPage` already loads `PublishingStatus` once (§3.2) and passes `status` into `PostCard`. `canPublish = status.configured && status.connection?.status === 'connected'`.

1. **Step 1, draft / pending_approval / rejected:** keep **Approve**, **Edit**, **Reject** exactly as today (`update_post`). Approve only approves the text.
2. **Step 2, `status='approved'` and `execution_state` is `idle` or `held` with only `connection` or `missed_window` holds:** replace the current approved box (lines ~583–596) with three actions:
   - **Schedule** (`btn-primary`) → Schedule dialog: the Facebook preview, the Page name, `<input type="datetime-local" className="input-field">` prefilled with `proposed_for` converted to workspace wall time (empty if none; required), a lateness `<select className="input-field">` with 5 / 15 / 30 / 60 / 120 minutes (default 30) labelled "If publishing is delayed, BUSMORA may still publish up to N minutes late. After that the post is held.", and the text "BUSMORA will publish this exact text to <Page> at this time. Editing the text later cancels this schedule." On confirm: `instant = localToInstant(value, tz)` (workspace timezone, never the browser's); `null` → inline error "This time does not exist in your timezone (daylight saving change). Choose another time."; else `schedulePost(...)`.
   - **Publish now** (`btn-secondary`) → confirm dialog: the preview + "Publish to <Page> now? This cannot be undone from BUSMORA." → `publishNow`. While waiting, show "Publishing…" and disable the buttons; then `load()`.
   - **I'll publish it myself** (text button) → reveals the existing **Copy caption** and **I published it** buttons (unchanged behavior, `update_post` `'published'`).
   - If `!canPublish`: **Schedule** and **Publish now** are rendered `disabled` with the hint `t('connectPageFirst')` = "Connect a Facebook Page in Settings" (linked to `/settings`). If `!status.configured`, the hint is "Publishing is not configured on this server." **I'll publish it myself** always stays available.
3. **Scheduled (`execution_state='scheduled'`):** show "Scheduled · <time>", **Publish now** (same dialog), **Unschedule** (text button → `unschedulePost`), and **Edit** (edit returns the post to draft, §5.1.1).
4. **Publishing (`status='publishing'`):** badge "Publishing…", no actions.
5. **Failed (`execution_state='failed'`):** the error text `t('publishError_' + publish_result.errorCode)` + **Prepare retry** → `preparePostRetry`.
6. **Needs review (`execution_state='uncertain'`):** badge **Needs review** (`badge bg-amber-50 text-amber-700`) + the error text + **I checked, prepare retry** → confirm dialog "I checked my Facebook Page and this post was not published." → `preparePostRetry`.
7. **On hold (`execution_state='held'`):** badge **On hold** (`badge bg-amber-50 text-amber-700`) + each hold reason. For `context` holds add **I reviewed it, keep this text** (confirm dialog) → `resolveContextHolds`, next to **Edit**. For `connection` / `missed_window` holds, the step-2 actions in item 2 apply (Schedule clears them).
8. **Published by Facebook (`execution_state='confirmed'`):** "Published on Facebook" + a link to `publish_result.permalink` when present (`target="_blank" rel="noreferrer"`). Keep the existing "✓ Published by you" line for `publish_result.published_by === 'user'`.
   - **Every published post (`status='published'`, whether `confirmed` or `owner_reported`) is read-only:** pass no `onApprove`, `onEdit` or `onReject` to `PostCard` (today lines 278–280 and 302–304 pass them for every post), and show the muted line `t('publishedReadOnly')` = "To change or remove this post, do it on Facebook. Changes made on Facebook are not shown in BUSMORA."
9. **Holds data:** in `loadPosts()` (`src/server/calendar-actions.ts`), after loading posts, select `post_id, reason, kind` from `post_holds` where `resolved_at is null` (owner RLS allows it) and attach `holds` to each post.
10. **Header hint:** replace `publishYourselfHint` (line 235) with `autoPublishHint` = "Approved posts you schedule publish automatically at their time. Use Publish now to send one immediately." **only** when `canPublish && status.autoPublishActive`. When `canPublish && !status.autoPublishActive`, show `autoPublishInactiveHint` = "Automatic publishing is not running right now. Scheduled posts wait until it runs; use Publish now to send one immediately." Otherwise keep `publishYourselfHint`.
11. **Day panel:** it already lists `selectedPosts` (line 119); with §2.5 it includes proposed posts. Sort by `planTime`.
12. In `PostCard`, the existing **Approve / Edit / Reject** row stays for step 1. For `approved` posts, hide **Approve** (already approved) and keep **Edit** and **Reject**.

### 5.5 Copy strings

Add every new label above to `src/lib/i18n.ts`, plus `publishError_auth_expired` ("Facebook access expired. Reconnect your Page in Settings."), `publishError_permission_denied` ("BUSMORA is not allowed to post to this Page. Reconnect and grant access."), `publishError_invalid_request` ("Facebook rejected this post. Edit it and try again."), `publishError_provider_error` ("Facebook returned an error. Try again later."), `publishError_timeout`, `publishError_network`, `publishError_unknown`, `publishError_stale_claim`, `publishError_record_failed` (all: "We could not confirm whether Facebook published this post. Check your Page before retrying.").

### 5.6 Phase 5 acceptance checks

Run 1–6 with `PUBLISHING_PROVIDER=fake` first, then 3 again with Composio on a test Page.
1. A draft shows Approve / Edit / Reject only. Approve → Schedule, Publish now, I'll publish it myself appear.
2. Without a connected Page: Schedule and Publish now are disabled with "Connect a Facebook Page in Settings"; I'll publish it myself works.
3. Schedule with the proposed time → status **Scheduled**, no Proposed badge, the approved time shown. Publish now on another approved post → confirm → **Published** (with Composio: the real post appears on the test Page and the permalink works); a notification appears.
4. Edit a scheduled post's caption → it returns to **Draft**, its approval is revoked, Approve is required again, nothing is sent.
5. Press Publish now twice quickly → one send; the second call reports it is already being sent.
6. `PUBLISHING_FAKE_OUTCOME=timeout` → status **Needs review**, no automatic retry; "I checked, prepare retry" returns it to Approved.
7. Delete a published post → "This post has publishing history and cannot be deleted."
7a. A published post shows no Approve / Edit / Reject buttons, only the `publishedReadOnly` line. The `PublishingProvider` interface and both adapters have exactly the six methods of §4.3.
8. All checks in rule 0.3.11 pass, including the extended `scripts/planned-posts-db-check.sql`.

---

## 6. Phase 6: Automatic publishing at the scheduled time

**Goal:** scheduled posts publish themselves at `scheduled_for` without the browser open, and the UI tells the truth about whether that is happening.

### 6.1 Database: `supabase/migrations/20261121140000_publisher_heartbeat.sql`

```sql
CREATE TABLE publisher_heartbeat (id integer PRIMARY KEY CHECK (id = 1), last_run_at timestamptz NOT NULL);
ALTER TABLE publisher_heartbeat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON publisher_heartbeat FROM PUBLIC, anon, authenticated;
GRANT ALL ON publisher_heartbeat TO service_role;
```
Server-only RPC `touch_publisher_heartbeat() RETURNS void`: `INSERT ... VALUES (1, now()) ON CONFLICT (id) DO UPDATE SET last_run_at = now()`.
`loadPublishingStatus()` (§3.2) reads it with `createAdminClient()`: `autoPublishActive = last_run_at > now - 5 minutes`.

### 6.2 Endpoint: `src/app/api/cron/publish-due/route.ts`

- Export `POST` and `GET` (some schedulers only send GET). Read the Next.js 16 route-handler docs first; make sure the handler is never cached.
- Auth: header `Authorization: Bearer <secret>`. Compare `sha256(header value)` with `sha256('Bearer ' + process.env.CRON_SECRET)` using `crypto.timingSafeEqual` (equal-length digests, so it cannot throw). Missing `CRON_SECRET` → 503. Mismatch → 401.
- `export const maxDuration = 60`.
- `await admin.rpc('touch_publisher_heartbeat')`, then `await admin.rpc('mark_stale_publish_attempts')`.
- Query with the admin client: `planned_posts` where `status='scheduled' AND execution_state='scheduled' AND scheduled_for <= now()`, ordered by `scheduled_for`, limit **5**.
- Process them **sequentially** with `publishPost(defaultPublishDeps(), id, 'due')`. **Before starting each one, stop if more than 30 seconds have passed since the request started.** (One send can take up to 20 s; this keeps the run inside `maxDuration`.) Remaining posts are picked up on the next run.
- Posts past their lateness window are held by `claim_post_publish`; nothing else is needed.
- Return `{ processed: n, results: [{ id, state }] }` (no captions, no secrets).

### 6.3 Who calls it

1. **Production (the owner sets this up; do not do it without permission):** Supabase `pg_cron` + `pg_net` calling the deployed URL every minute (Vercel Hobby crons run at most once per day, which is too coarse). Write the SQL as a **separate, not-applied** file `supabase/manual/schedule_publish_due.sql` (create the folder `supabase/manual/`, outside `migrations/`):
   ```sql
   -- Run manually in the Supabase SQL editor after deployment. Replace placeholders.
   -- Prefer storing the secret in Supabase Vault and reading it here instead of plain text.
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select cron.schedule('busmora-publish-due', '* * * * *', $$
     select net.http_post(
       url := 'https://<DEPLOYED_DOMAIN>/api/cron/publish-due',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
       body := '{}'::jsonb,
       timeout_milliseconds := 55000);
   $$);
   ```
2. **Local development:** `scripts/publish-due-local.mjs` calls `http://localhost:3000/api/cron/publish-due` every 60 seconds with `CRON_SECRET` from `.env` (a tiny line parser; no new dependency) and logs only the `processed` count. Add the npm script `"publish:due": "node scripts/publish-due-local.mjs"`. While it is not running, the heartbeat goes stale and the Calendar shows `autoPublishInactiveHint` (§5.4.10). That is the truthful state.

### 6.4 Phase 6 acceptance checks

1. Schedule a post for 3 minutes from now; run `npm run publish:due` → within about 1–2 minutes after the time it is **Published** (fake first, then Composio on the test Page).
2. Stop the poller, schedule a post for 1 minute from now with lateness 5, wait 7 minutes, start the poller → the post becomes **On hold** "Missed its delivery window", status Approved, not published; Schedule clears the hold.
3. With the poller stopped for more than 5 minutes, the Calendar shows the "Automatic publishing is not running right now" hint; with it running, it shows `autoPublishHint`.
4. Call the endpoint without the secret → 401.
5. Run two pollers at once → still only one send per scheduled version.
6. All checks in rule 0.3.11 pass.

---

## 7. Applying migrations (owner step)

The agent writes migrations but **must stop and ask the owner** before any is applied to the shared Supabase project (teammates use it). Give the owner:
1. The list of new or edited migration files, in order.
2. A one-paragraph summary of each change.
3. The command they will run themselves (`supabase db push` from a configured Supabase CLI) or the SQL to paste.

Order: `20261121100000_deliverable_save_offers.sql` → `20261121110000_post_proposed_time.sql` → `20261121120000_facebook_connection_rpcs.sql` → `20261121130000_post_approval_and_publish.sql` → `20261121140000_publisher_heartbeat.sql`.

---

## 8. Final end-to-end checklist

1. Chat: "Plan a one-week campaign with 3 posts for our main offer." → 3 Facebook-style post previews with **Proposed** times, the reply, and one offer card "Save this to Deliverables → Content Calendar?".
2. Save → Deliverables › Content Calendar shows the plan with the schedule table.
3. Calendar: the 3 posts appear on their proposed days with the **Proposed** badge.
4. Click a day → that day's posts → **Approve** one → **Schedule** → confirm the time → it becomes **Scheduled**.
5. Another day → **Approve** → **Publish now** → confirm → live on the Facebook Page; status **Published** with a link.
6. Leave the poller running → the scheduled post publishes at its time.
7. Edit a scheduled post's text → it returns to **Draft** and does not publish.
8. Disconnect Facebook → scheduled posts become **On hold** (status Approved); nothing publishes after reconnecting until scheduled again.
9. All checks in rule 0.3.11 pass.
10. Write `docs/evidence/meta-publishing-<date>.md` with what was actually verified (screens, real post permalink, the no-role account result). A screenshot proves appearance only; a permalink proves only that publish path; fake-provider runs prove only local logic.

## 9. Out of scope (do not build)

Instagram, X, LinkedIn, TikTok publishing; image/video upload; Meta Ads; boosting; analytics/insights; market research and competitor analysis execution; native Facebook scheduling (`scheduled_publish_time`); **editing or deleting posts on Facebook** (no remote edit, remote delete, unpublish, reading posts back, or syncing changes made on Facebook); comment replies; billing; Approve All. Do not add placeholder buttons for them.

## 10. End-of-session report format

```text
Completed phase(s):
Phase 0 baseline (test:db:local / test:posts:db on the pre-Phase-1 migrations: PASS, or the exact FAIL line):
User-visible result:
Changed files:
Migrations written (not applied / applied by owner):
Checks run and outcomes (including "not run" with reason):
Documented deviations (e.g. FR-41 post snapshots in Deliverables):
Known limitations:
Next phase:
```
