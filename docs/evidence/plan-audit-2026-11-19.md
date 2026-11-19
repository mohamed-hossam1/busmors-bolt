# Plan implementation audit — 19 November 2026

Reviewed by Codex against the current local working tree in `busmors-bolt`, including existing uncommitted implementation. Scope: audit and update the plan; no product feature implementation, deployment, provider calls or publication was performed. Existing source changes were preserved; build output was directed to `/tmp`.

> **Post-audit update (19 November 2026):**
> 1. C01 was completed with owner-confirmed dates/hosting and read-only environment probes.
> 2. The project architecture is established on **Next.js 16 (App Router + Turbopack) + React 19 + Supabase**. Backend operations (`ai-generate`, `crawl`, `tasks`, `oauth`) are implemented as internal Next.js Server API routes (`/api/*`), resolving the missing Supabase Edge Functions dependency.
> 3. `npm run build` now executes `next build` and cleanly compiles 19 routes; `npm run lint` uses `oxlint` (0 errors, 17 warnings).
> See the [C01 scope lock](../phase-1-2/IMPLEMENTATION_PROGRESS.md#c01-scope-lock--19-november-2026-complete), [integration readiness inventory](integration-readiness.md) and [competition evidence](competition-status.md) for current status.

## Result

> Status update (19 November 2026, post-C01–C08): **8 fully accepted (C01–C08)**. The table below is updated to current counts; the findings that follow are the original audit snapshot and some file paths are historical.

| Status | Count | Tasks |
|---|---|---|
| Complete against all task acceptance | 8 | C01, C02, C03, C04, C05, C06, C07, C08 |
| INCOMPLETE — implemented; verification pending | 5 | C09, C10, C11, C13, C18 |
| INCOMPLETE — partial | 12 | C12, C16, C17, C23, C25, C28, C29, C32, C33, C34, C35, C37 |
| INCOMPLETE — missing | 15 | C14, C15, C19, C20, C21, C22, C24, C26, C27, C30, C31, C36, C38, C39, C40 |

These counts are not an effort estimate. “Missing” means the required user journey is absent; tables, prompts, types or historical preview assets can still exist. “Implemented; verification pending” does not mean competition-verified or production-verified.

The actionable checklist is now **under every C01–C40 heading** in [the implementation plan](../phase-1-2/04-implementation-tasks.md). The [progress tracker](../phase-1-2/IMPLEMENTATION_PROGRESS.md) uses the same statuses and next actions.

## Findings that change the previous tracker

- **Roadmap is not implemented:** [App.tsx](../../src/App.tsx) has an `/app/roadmap` compatibility redirect but no `/roadmap` page. [Onboarding](../../src/pages/Onboarding.tsx) links there; the wildcard returns the owner to the landing page. This leaves C03/C06/C07 incomplete as well as C18–C22. Roadmap tables and a generation prompt do not close the gap.
- **Research is unavailable:** [TaskRunner](../../src/features/tasks/runner.ts) explicitly throws `research_unavailable` for market/competitor research. There is no application research-tools Edge Function. C14/C15 need real retrieval, evidence validation and saved results.
- **Publishing remains a legacy review workflow:** [CalendarPage](../../src/pages/CalendarPage.tsx) reconstructs Posts when empty, can create synthetic rows after a failed insert, mutates captions/status by ID and records owner-reported publication. It does not implement immutable approvals, actual Meta sends or Month/Week/List/Unscheduled. Chat's `?post=` reference is not consumed by this page. C23/C28 are partial, C26/C27 missing.
- **Facebook connection needs implementation work, not only credentials:** [oauth-connect](../../supabase/functions/oauth-connect/index.ts) still accepts a JWT in the start URL, allows callback platform override and resolves `/me` rather than a selected Page. [Settings](../../src/pages/SettingsPage.tsx) has no Page selector. C25 is partial.
- **Documents are substantial but unfinished:** [DeliverablesPage](../../src/pages/DeliverablesPage.tsx) has versioned edits, filters, pagination, exports and deletion. Continue includes document identity/version; Reuse copies text into a compose URL without an explicit origin. Legacy Post links and complete export/deletion integration remain in C16/C33.
- **Several “not started” rows were stale:** copy/campaign/diagnosis branches (C17), Post output persistence (C23), context holds (C29), account/region settings (C32), data controls (C33), marketing/polish (C34/C35) and focused tests (C37) already exist in part. Their unfinished work is now itemized instead of saying only “implement in dependency order.”

## Checks actually executed for this audit

| Command | Result | What this proves / does not prove |
|---|---|---|
| `npm run build` | PASS — Next.js 16.4.6 (Turbopack), 19 routes generated | Production Next.js build; hosted Supabase DB migrations not covered. |
| `npm run lint` | PASS, 17 warnings, no errors | Static checks via oxlint. |
| `rtk npm run test:crawl` | PASS, 26/26 | Local crawler/fixture behavior; not a new live website run. |
| `rtk npm run test:tasks` | PASS, 7/7 | Local runner recovery/cancellation/context/save behavior; not live Supabase execution. |
| `rtk npm run test:ai-gateway` | PASS, 6/6 | Gateway checks with fixture provider responses; not real managed/BYOK provider verification. |
| `rtk npm run test:db:local` | BLOCKED, exit 1 | Harness could not open `/tmp/busmora-competition-pg/acceptance.log`; required disposable DB setup is absent. No SQL acceptance ran successfully in this audit. Recreate prerequisites and rerun empty/upgrade paths. |
| Browser acceptance suites | NOT RUN in this audit | Earlier passes in the progress file are historical evidence, not new visual or end-to-end verification. |
| Hosted Supabase, email, Google, model/search providers, Meta and deployment | NOT RUN | Configuration and runtime outcomes remain unverified. No remote configuration or public content was changed. |

Documentation verification passed: all forty task IDs appear once, each has status and completion notes, the tracker agrees with those notes, cited source paths exist and relative planning links resolve.

## Completion order and boundaries

1. Establish the intended environment/integration access and restore local DB verification; resolve direct Post state writes, recovery-on-read and exact-version approval requirements in C02/C23/C28.
2. Implement C14/C15 research and remaining C17 task recipes, then the C18–C22 Discovery/Roadmap journeys. Connect onboarding and exact resource links.
3. Finish C24–C29 media, authorized Page connection, real publishing, calendars, approval and recovery; implement C30/C31 file analysis.
4. Finish C32–C35 settings, notifications, data controls, truthful marketing and full visual/accessibility checks.
5. Complete isolated demo data, regression, authorized deployment, recorded rehearsal and freeze (C36–C40).

H01–H10 in [the production backlog](../phase-1-2/08-after-competition.md) remain **INCOMPLETE — deferred production acceptance**. Local improvements are prerequisites, not evidence that those production outcomes are complete. Social import, Instagram/X publishing, connected analytics, native image generation, billing and Ads remain intentionally outside current implementation scope.
