# Website extraction verification

The public site from the user screenshot was read using the application code before and after the fixes. No AI API or production database was used.

| Reader measurement | Before | After |
|---|---:|---:|
| Requests | 8 | 1 |
| Target 404 pages counted as read | 7 | 0 |
| Useful pages | 1 | 1 |
| Reader duration | 13.466 s | 1.831 s |
| Empty company profile | Yes | No |

These are separate single runs, affected by network/cache conditions; they are not a latency guarantee for other websites or for AI generation. The new reader follows real links instead of guessing seven missing paths.

Fallback output now keeps specific capabilities such as **Instant AI-Driven Campaigns** and **AI Website Scanner**, retains the full partnership sentence, and saves heuristic output as review candidates. AI processing receives the cleaned page content with verified page IDs and quotes rather than only the first 3,000 characters.

Validation:

- 25 automated extraction/client/server regression tests.
- Browser checks for visible storage errors, successful retry, accurate page counts and degraded-analysis messaging using intercepted APIs.
- PostgreSQL integration checks against all repository migrations: atomic rollback, idempotency, manual edits and edges, workspace isolation, partial extraction and secret permissions.
- TypeScript, production Vite build and lint pass; lint retains 8 pre-existing UI warnings.

The production migration and Edge Function provide the full transactional path after deployment. The client now supports an add-only compatibility path when the RPC is missing, without deleting or overwriting existing knowledge. No production backend changes were made. Browser-close/resume support still requires a future background job service.

[Measured details](benchmark.json)

## Follow-up: long waits and missing migration

Onboarding now targets ten pages by default, with a time budget sized for the initial page and subsequent parallel batches, runs facts and relationship extraction in at most two bounded concurrent AI calls, and reuses completed analysis for saving retries. The missing-migration browser case is tested against the existing table schema, with checked writes and deterministic IDs. Compatibility saves retain partial progress on failure; full atomic transactions still require the database migration. The earlier timing table describes the first reader-only benchmark, not these later changes.

## Follow-up: Buffer quality and zero connections

Replayed the public reader responses from both user-supplied sites through the updated generic extraction code. No AI key, live model or production database was used for this replay.

| Site | Useful pages in captured read | Review suggestions | Saved-ready contextual relations |
|---|---:|---:|---:|
| Buffer | 10 | 20 | 12 |
| ADYOUNEED | 1 | 9 | 8 |

These are fallback review suggestions, not validated AI quality scores. Counts do not measure accuracy. Buffer examples now include actual publishing, content creation, community response and analytics descriptions rather than navigation labels; each item carries its source and quote. The contextual relations are suggested company-to-fact links, not invented targeting/competitor relationships. ADYOUNEED exposed one useful linked page in this read; the default crawl target remains ten, with no guessed pages or site-specific data.

The reader timings for these captured responses were 3.191 seconds (Buffer) and 0.807 seconds (ADYOUNEED). These exclude analysis and saving, and upstream reader caching may affect them. New onboarding runs bypass the application's own cache; storage retries deliberately reuse their prepared result.

AI analysis now processes both page groups independently and retains successful batches. Exact citation validation and fallback suggestions remain available when the provider fails; safe error reasons distinguish configuration, HTTP and timeout failures.

Browser verification covers nonzero persisted completion counts, storage failure/retry, the old-schema compatibility path, and a graph containing three review nodes and exactly one stored suggested edge. It confirms no edge writes occur on page load. Backend deployment and a live authenticated provider test remain outstanding because this environment has no Supabase deployment credentials.
