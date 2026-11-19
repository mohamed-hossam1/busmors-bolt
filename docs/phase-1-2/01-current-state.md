# Initial source audit — 18 November 2026

> **Historical baseline:** This file records the source before the subsequent local implementation. Several findings below have since been addressed. Use the [19 November audit](../evidence/plan-audit-2026-11-19.md), [current tracker](IMPLEMENTATION_PROGRESS.md) and task-level **To complete** notes in [file 04](04-implementation-tasks.md) for present status. Old line numbers and test outcomes below are historical.

> Scope update — 18 November 2026: the owner requires an English-only project. Interface, conversation and generated-content language are English; locale switching, alternate registers and right-to-left presentation are removed from acceptance. Country, currency, target market and IANA timezone remain independent. This update supersedes the earlier language requirements.

## Scope and existing work

This review inspected source, SQL, and test scripts. No production database, secret values, Meta account, or deployment was inspected or changed. A migration on disk is not proof that it has been deployed.

Preserve existing local changes: modified `package.json` and `src/pages/BrainPage.tsx`; new `scripts/brain-delete-ui-check.cjs` and `src/components/brain/DeleteKnowledgeDialog.tsx`. Do not reset or overwrite them.

## Reusable features and missing behavior

| Area | Existing | Competition gap | Tasks |
|---|---|---|---|
| UI | Brand system, local fonts, responsive shell/dialogs, landing | Roadmap navigation, notification/workspace controls, consistent states | C05–C06, C34–C35 |
| Auth | Password signup/login, reset email, logout/session | Email-only signup, verification/resend, reset completion, Google, routing | C03–C04 |
| Onboarding | URL reading, link discovery, dedup, quote validation, save RPC | Manual path, shared editable form, explicit confirmation | C07–C08 |
| Brain | Persisted graph/list/filter/edit/delete/proposals | Evidence details, relationship editing, versions/export/freshness | C09, C29, C33 |
| Director | Saved chats, provider calls, form renderer | Actual routing, clarifications/history reuse, scoped outputs | C10–C12, C17 |
| Canvas | Stored events/polling, conversation isolation, layout | Truthful events, task selector, event list, budgets/cancel/recovery | C11, C13 |
| Research | LLM reports | Real search/retrieval, inspected sources/excerpts, budgets | C14–C15 |
| Documents | Library/type filter/Markdown export | Versions/editor/search/date/reuse/continue/delete; Post separation | C16, C33 |
| Discovery/Roadmap | No route/schema found | Entire wizard, research return, plans/steps/revisions | C18–C22 |
| Posts/Calendar | Review cards, approve/reject/copy | Manual New Post, versions/media/calendars/timezone/native send | C23–C29 |
| Facebook | OAuth function source and tables | Connection UI, Page selection/token, actual publishing/scheduling | C25–C26, C28–C29 |
| Analysis | Performance wording/types | CSV/XLSX mapping, deterministic metrics, report | C30–C31 |
| Settings | AI-key settings | Account/region/connections/data controls/notifications | C32–C33 |
| English | Translation function, Inter font, logical CSS | English copy coverage and responsive QA remain to be audited | C05, C35 |
| Operations | Some RLS/audit/crawl checks | Complete production isolation/recovery/load/evaluation | H01–H10 after competition |

## Specific code evidence

| Finding | Source evidence | Action |
|---|---|---|
| Browser execution | EmployeePage calls runAgentTask/persistAgentResults; `src/lib/agents.ts:387` runs the pipeline | Accepted temporarily; app-level manager, persisted checkpoints and interrupted state. C11 |
| Fictional research events | `src/lib/agents.ts:481` emits Searching Reddit; line 521 emits Checking Facebook Ads Library, then only model calls | Real tool calls or remove the claims. C14 |
| Canned success fallback | campaign branch constructs six canned Posts after model/JSON failure | Visible retry/partial error instead. C10/C17 |
| Key returns to browser | `src/lib/agents.ts:122` calls read_ai_key; latest crawl SQL grants authenticated execution | Edge-only provider calls; revoke browser decrypt. C10 |
| Unsafe Markdown | MarkdownContent uses marked + dangerouslySetInnerHTML without sanitizer | Sanitize HTML/URLs or disable unsafe raw HTML. C06 |
| Automatic knowledge approval | crawlStorage/save_crawl_brain approve high-confidence extraction and complete onboarding | Persist draft; explicit owner confirmation. C07–C09 |
| No manual intake | Onboarding accepts URL only; Skip opens Brain | Shared essential form and no-website path. C07 |
| Audit failure risk | Brain/Calendar inserts omit NOT NULL workspace_id and ignore errors | Correct actor/workspace; compact RPCs for important changes. C02/C09/C23 |
| Weak relational ownership checks | Core FKs reference IDs without composite workspace relation; client can write statuses/events | Same-workspace checks and protected sensitive writes. C02 |
| Results saved after completion | Task completes before documents/Posts/messages save; some failures only log | Complete after successful result-save RPC. C11/C16/C23 |
| Manual publishing only | `src/pages/CalendarPage.tsx:155` writes published_by:user | Keep attestation separate; add real native publisher. C25–C26 |
| Mutable approval | `CalendarPage.tsx:109` edits caption in place; bulk uses only IDs | Immutable version + exact approval. C23/C28 |
| Deleted Posts resurrect | `CalendarPage.tsx:32` reconstructs rows from chat on empty library | Explicit one-time migration; no writes-on-read. C23 |
| OAuth not Page-ready | oauth-connect takes JWT in URL, reads /me, allows platform override | Secure handshake, actual Page/token selection, disconnect. C25 |
| English-only scope | Owner requires English throughout | Fixed English copy, LTR layout and normalized preferences. C05/C35 |
| Canvas limitations | Latest Task only; one node per agent name | Task history and step-instance IDs/list/details. C13 |
| Shallow context | top twelve approved Brain nodes; no actual conversation history in prompt | Relevant eligible context and bounded history. C12 |

These are source-level findings, not claims of a production security incident. Browser execution itself is an accepted competition tradeoff, not a reason to rebuild the application.

## Reuse, do not replace

Keep `DESIGN.md`, local Inter/IBM Plex Sans Inter fonts, cosmic/purple identity, shared button/card/form classes, AppShell, BrainGraph/layout, dialog focus management, current deletion work, crawl cleaning/exact-quote validation, and PostPreview. Update behavior incrementally.

The marketing examples already have illustrative-example labels. Preserve them; do not present sample businesses as real testimonials. Refresh product screenshots after the corresponding functionality works.

## Executed checks

| Check | Result | Limits |
|---|---|---|
| `rtk npm run build` | Passed | Frontend compilation; not deployed backend verification |
| `rtk npm run lint` | Exit 0, eight warnings | Not runtime/security proof |
| `rtk npm run test:crawl` | 25/25 passed | Fictional source/intercepted API tests |
| `rtk npm run test:crawl:ui` | Isolated server did not start | No UI pass claimed; rerun in working server/browser environment |
| `rtk npm run test:brain-delete:ui` | Isolated server did not start | Same environment limitation |
| DB/RLS/live providers/deployment | Not exercised | Must be verified in the actual test environment |

## External compatibility checks

Supabase documents automatic linking of OAuth identities with the same email. Manual linking alone does not prove the PRD's explicit-only linking rule. Implement ordinary Google login for the competition with dedicated test identities; record the gap and do not mark AC-32 fully passed without linking/reauthentication tests. Do not build a replacement authentication stack this week. [Official identity-linking documentation](https://supabase.com/docs/guides/auth/auth-identity-linking).

Meta documents Page tokens, feed/photo publishing, and read-back. The existing /me response does not prove Page publishing capability. Use an authorized presentation Page and verify the app's actual version/scopes/access. [Official Posts API](https://developers.facebook.com/documentation/pages-api/posts).

Supabase Edge Functions have bounded lifetime. Short provider calls and scheduled publishing are suitable competition components; asynchronous callbacks alone do not prove durable task execution. [Official runtime limits](https://supabase.com/docs/guides/functions/limits).

These sources were checked on 18 November 2026. Project-specific configuration and production access remain unverified.
