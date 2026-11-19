# Busmora

Next.js 16 (App Router) + React 19 + TypeScript workspace for the Busmora Marketing Director. Authentication, workspace data, and agent execution use the existing Supabase integration.

## Development

```sh
npm ci
npm run dev
```

Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your local `.env`. Never commit that file. Database migrations live in `supabase/migrations/`; backend operations run as Next.js server API routes under `src/app/api/*` with server modules in `src/server/*` (no Supabase Edge Functions).

```sh
npm run build
npm run lint
npm run test:ui
```

The browser suite runs against a local Next.js server with an isolated Supabase URL and intercepts its requests. It uses fictional Luma Studio fixtures; it never reads or writes a live workspace. It uses installed Chrome when available; otherwise install Playwright Chromium with `npx playwright install chromium`. Set `CHROME_PATH` to select a browser executable.

To refresh the real product images on the landing page:

```sh
npm run test:ui -- --capture-products
```

Screenshot optimization additionally requires Python 3 and Pillow. The test captures the actual React interfaces, then encodes optimized WebP assets in `public/marketing/product/`. Presentation fixtures exist only in `scripts/ui-fixtures.cjs`; the production app does not import them.

## Website knowledge extraction

Website reading follows discovered same-site links, normalizes tracking/fragment URLs (including CTA parameters), rejects target error pages, deduplicates content, and reads up to three pages concurrently. Onboarding and Brain reorganization target ten relevant pages by default, using one shared page-limit setting. Requests have a 6-second timeout; the overall budget allows the initial page plus the required parallel batches (25 seconds with the default ten-page limit and three concurrent requests). Successful pages stay in an in-memory cache for five minutes for API callers; onboarding and Brain reorganization force a fresh application read with browser HTTP caching disabled. Upstream reader caching remains controlled by the reader service. Saving retries reuse the completed read and analysis for five minutes.

AI extraction returns facts and supported relationships in one `extract` call, with a 16-second client timeout. The updated server owns the prompt and limits its model attempts to a shared 14-second budget. Every accepted AI fact has a validated source page and supporting quote. Low-confidence facts and heuristic fallback results are saved as review candidates. Relationships are checked after remapping indexes through fact validation and deduplication. Saving retries reuse completed analysis for five minutes instead of repeating website or AI requests.

The AI receives two groups of at most five pages concurrently, with a 16,000-character excerpt budget per group. Navigation, cookie preambles and link-only sections are removed; every accepted fact must cite an exact quote in the supplied excerpt. Failure of one group retains the other group's results and reports the cause. Stronger source-backed fallback suggestions fill missing coverage without being marked AI-approved.

Connections are saved before the completion counters are shown. Explicit AI relations keep their source evidence. Additional same-company context links use `RELATED_TO`, capped confidence 0.65 and candidate status; they do not assert that every product targets every audience. The graph renders persisted non-rejected connections only and includes candidate nodes with Review labels. Opening the Brain never creates connections. Heuristic suggestions need review before the Director can use them.

For atomic saving, cleanup of obsolete crawler facts, server-owned prompts and server-side secret permissions, deploy the backend changes from a configured Supabase CLI environment:

```sh
supabase db push
supabase functions deploy ai-generate
```

The migration is `supabase/migrations/20261118010000_reliable_crawl_brain.sql`. With it, the authenticated `save_crawl_brain` RPC commits knowledge, relationships, completion status and audit together. Without it (`PGRST202`), the client uses a checked, add-only compatibility path against the existing tables: deterministic IDs and conflict-ignore inserts prevent duplicate retries, existing facts/edits/edges are never overwritten or deleted, and completion is reported only after all required writes succeed. This compatibility path is not a cross-table transaction; partial progress is retained safely for retry. Other storage errors do not trigger compatibility saving. The client never reads the shared API key, and the extraction prompt also matches the previously deployed server's crawl allowlist. Reading and analysis still require the page to remain open; there is no background job service.

Regression checks use fictional sources and intercepted APIs:

```sh
npm run test:crawl
npm run test:crawl:ui
```

`scripts/crawl-db-check.sql` verifies rollback, repeat saves, workspace isolation, manual edits, preserved relationships and secret privileges. Run it with `psql -v ON_ERROR_STOP=1 -f scripts/crawl-db-check.sql` against a **disposable local database** with the migrations and Supabase auth functions installed. Its fixture changes are enclosed in a rolled-back transaction; it requires permission to insert fictional auth users.

## Interface

The reference landing was adapted into `src/features/marketing/` with links, native image elements, a small English copy adapter, and native smooth scrolling. Hero, workflow, closing scroll scenes, reveal effects, animated connectors, tabs, FAQ, and the existing interactive guest demo are retained. Reduced-motion and small-screen layouts use normal document flow.

The original logo, local Inter fonts, cosmic palette, electric purple actions, and light work surfaces form one system across the public page, auth, onboarding, and protected routes. See [DESIGN.md](DESIGN.md).

Conversation graphs restore their recorded task events independently, with per-conversation browser persistence of node positions and viewport. Browser storage is a local layout preference; Supabase remains the source of task data.

[Visual review and screenshots](artifacts/redesign/README.md).
