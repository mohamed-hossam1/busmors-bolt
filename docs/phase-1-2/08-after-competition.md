# Post-competition production backlog

> Scope update — 18 November 2026: the owner requires an English-only project. Interface, conversation and generated-content language are English; locale switching, alternate registers and right-to-left presentation are removed from acceptance. Country, currency, target market and IANA timezone remain independent. This update supersedes the earlier language requirements.

The owner explicitly accepts browser-driven Tasks and prioritizes visible functionality for the competition. These follow-ups prevent that pragmatic sprint from being mistaken for full PRD production readiness. They are not prerequisites for polishing the demo, except where a current defect causes unsafe or false behavior during the demo itself.

| ID | Follow-up | Required outcome and evidence |
|---|---|---|
| H01 | Durable execution and crash recovery | Tasks/research/imports survive browser closure and worker interruption; durable queue/checkpoints/leases/cancellation/reconciliation; two-Task workspace capacity across processes; real fault tests. Choose a solution within the then-approved architecture rather than assuming a new stack now. |
| H02 | Full authentication conformance | Verify single-use/expiry/replay/rate limiting, session revocation/rotation and recovery; resolve Google same-email auto-linking versus explicit reauthenticated linking, issuer/sub/claims/PKCE/state/nonce and safe cancellation. Document any required supported auth configuration/architecture decision before changing sessions. |
| H03 | Full tenant/credential/input security | Independent two-tenant access/relationship tests across tables/files/exports/events; server authority for transitions; secret encryption/rotation/revocation; SSRF/DNS/redirect/input injection controls; safe Markdown/imports; no unresolved critical/high findings. |
| H04 | Atomic usage/resource control | Server-side parent/child/concurrent reservations, failed-call/retry/continuation cost, uncertain usage reconciliation, explicit extension approval, rate limits and declared task-specific runtime/cost ceilings at release load. Browser counters alone do not pass this gate. |
| H05 | Complete publishing recovery | Fault injection for concurrent workers, edit/cancel/disconnect races, timeout after acceptance, provider read-back outage, schedule/window expiry, media mutation, restore and reconnect. No blind retry or local-idempotency exactly-once claim. |
| H06 | Ordinary-owner Meta production access | Document tested production app/access path; an intended owner outside developer roles connects and publishes required formats. Developer/test-account success is separate evidence. No promised platform approval date. |
| H07 | Full English quality evaluation | Approximately 24 authored cases with held-out contrast pairs, source snapshots plus live checks, suitable human review across the selected business scenarios; >=80% useful cases overall and per task category under prewritten rubric; zero critical truth/control violations in release suite. Record denominators and uncertainty. |
| H08 | Comprehensive data lifecycle | Export/delete/redact derived retrieval/chunks/caches/embeddings/history/media/logs; minimal audit retention; documented backup expiry and deletion limits; restore reapplies deletion/revocation before reenabling work. |
| H09 | Operational readiness | Real monitoring, traces/usage/error alerts, stuck-job investigation, load/cost measurement, backup/restore rehearsal, deployment/rollback runbooks, operator recovery and release-load targets. |
| H10 | Full contract regression and release ledger | Re-test every active FR/NFR/AC on real implementations; verify remaining transport/route/schema alignment; complete mobile/keyboard/LTR and security/reliability checks; no unresolved critical/high defect. Freeze documented thresholds instead of lowering them to pass. |

## Status audit — 19 November 2026

**H01–H10: INCOMPLETE — deferred production acceptance.** No production gate is signed off. Each row's “Required outcome and evidence” is its completion checklist; the [current local audit](../evidence/plan-audit-2026-11-19.md) does not replace real production evidence. The [C01 scope lock](IMPLEMENTATION_PROGRESS.md#c01-scope-lock--19-november-2026-complete) and [integration inventory](../evidence/integration-readiness.md) add environment blockers; they do not satisfy any H row.

## Known sprint deviations to preserve explicitly

- **Facebook/Meta is temporarily deferred by owner direction (19 November 2026)** to prioritize search/Firecrawl. C25/C26/C28/C29 and H05/H06 requirements remain in the plan and must not be deleted. The Supabase Facebook provider is currently disabled; no Page connection or publication was configured or verified.
- Long AI/research/crawl Tasks may depend on the browser. Navigation continuation and checkpoint resume are useful but do not establish FR-23/NFR-05 durability.
- Basic Google sign-in may work while explicit-only account linking still conflicts with the configured Supabase behavior. A dedicated demo identity does not solve that product requirement.
- Basic task limits/usage UI may work while production-grade concurrent budget accounting is unfinished.
- Real Meta publishing with a developer-role Page is valid demonstration evidence, but does not satisfy AC-30 ordinary-owner distribution.
- Local RPCs may preserve the PRD's complete action semantics without shipping the exact REST path named in a supporting contract. Track this as a transport difference; resolve during API-contract alignment.
- Basic owner deletion/export works before comprehensive derived-data/backup lifecycle evidence. State the actual retention behavior.
- Visual English completion and a small English-content review do not prove the full held-out quality gate.

## Return-to-production order

First lock the actual delivered schema/interfaces and inventory observed defects. Then close H02/H03/H04, implement H01 without changing user journeys, and validate H05/H06. Run H07/H08/H09 continuously with those changes, then H10 for final sign-off.

Do not rebuild the visual product simply because backend implementation changes. Keep the successful competition flows and replace their execution internals behind stable interfaces. Phase 3/4/5 expansion should wait until the active Phase 2 release commitments are accepted or explicitly changed by the owner.
