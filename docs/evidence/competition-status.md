# Competition evidence

Updated **19 November 2026**. Competition: **Tuesday 24 November 2026, Africa/Cairo (EET, UTC+2)**. Hosting target: **Vercel**, intended domain **https://busmora.com** (not deployed; no deployment authorized). Canonical task-by-task status, changed files, checks, blockers and next actions are maintained in [IMPLEMENTATION_PROGRESS.md](../phase-1-2/IMPLEMENTATION_PROGRESS.md). All C01–C40 rows are present there.

## C01 closed — 19 November 2026

**C01 — Lock the competition scope and baseline: COMPLETE.** The owner decisions (deadline, Vercel/domain, Supabase reuse, dashboard-managed AI provider, Firecrawl, Google in scope, Facebook deferred, Next.js 16 + React 19 + Supabase architecture, English-only) are recorded in the progress tracker. Detailed live-status evidence, blockers, owner actions and follow-up tasks are in the [integration readiness inventory](integration-readiness.md).

Baseline executed in this pass:

| Check | Actual result |
|---|---|
| `npm run build` | **PASS** — Next.js 16.4.6, 19 routes generated |
| `npm run lint` | **PASS** — exit 0, 0 errors |
| `tsc --noEmit` | **PASS** — exit 0 |
| SQL acceptance (hosted Supabase) | **PASS — 8/8** (planned-posts, task-execution, competition, deliverable, discovery, brain-governance, intake, crawl) |
| Live AI | Groq `openai/gpt-oss-20b` completion **HTTP 200**; Google OAuth initiation **302** to accounts.google.com |
| Hosted Supabase probes | `/auth/v1/settings` **HTTP 200**; app tables **200** (migrations applied); backend is Next.js server routes (no Edge Functions) |
| `https://busmora.com` | **No DNS resolution**; not deployed |

Existing uncommitted work was preserved (working-tree changes at the start of C01; no revert/stash). Migrations are applied to the hosted project and the managed Groq `openai/gpt-oss-20b` model (optimized for fast extraction and avoid rate limits) is live-verified. No live Firecrawl, Google, Meta, email-delivery, publishing or deployment check passed. Status counts after C01–C11: **11 complete (C01–C11), 2 implemented with verification pending, 12 partial, 15 missing**.

## Current status — 19 November 2026

C01, C02 and C03 are fully accepted. Status now distinguishes partial implementation, missing journeys, and implemented work awaiting verification. No production gate is accepted from local fixture tests. Facebook/Meta work (C25/C26) is **temporarily deferred by owner direction** and its requirements remain in the plan.

Earlier implementation verification recorded on 19 November 2026 (not all rerun by C01): `npm run test:task-runner:ui`, `npm run test:tasks` (7/7), `npm run test:ai-gateway` (6/6), `npm run test:db:local` (empty and upgrade paths, including `deliverable-db-check.sql`), `npm run build` and `npm run lint` passed. These cover C10–C13 and C16 behavior with in-memory browser fixtures and a disposable PostgreSQL cluster; no live provider, Google/Facebook, email delivery, publication or deployment was exercised.

## Plan audit — 19 November 2026

See [the audit report](plan-audit-2026-11-19.md) for the 40-task classification and exact evidence limits at the time of that audit; its C01 row and “0 fully accepted” count are superseded by the scope lock above. Every task in [the implementation plan](../phase-1-2/04-implementation-tasks.md) has an explicit status, existing implementation and **To complete** note.

## Deferred / blocked external work

- **Supabase application migrations (23 files)** are **APPLIED** to the configured project (`ojlgnqdhykgzgkbqyatd.supabase.co`). All 44 tables created; acceptance DB checks passed. Edge Functions superseded by Next.js Server API routes.
- **AI provider** flow is implemented in the dashboard and Next.js server route (`/api/ai`), and database tables (`ai_keys`, RPCs) are now live in the database. `AI_API_KEY` configured in `.env`.
- **Firecrawl** `FIRECRAWL_API_KEY` is now configured in `.env`; search adapter integration in progress (C14/C15).
- **Google OAuth** is disabled in the Supabase project; client/redirect configuration is missing (C04).
- **Email confirmation** is disabled/removed; signup proceeds directly to onboarding.
- **Vercel / `busmora.com`** is not configured or deployed (C39).
- **Facebook/Meta** is deferred by owner; C25/C26 remain in scope for later (H05/H06 for production).

No mocked or intercepted test is presented as a live integration pass.
