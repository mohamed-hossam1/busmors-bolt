# Seven-day delivery, demonstration, and verification

> Scope update — 18 November 2026: the owner requires an English-only project. Interface, conversation and generated-content language are English; locale switching, alternate registers and right-to-left presentation are removed from acceptance. Country, currency, target market and IANA timezone remain independent. This update supersedes the earlier language requirements.

The competition date is confirmed as **Tuesday 24 November 2026, timezone `Africa/Cairo`** (five days from the 19 November baseline). Freeze at least 24 hours before presentation. All work stays in React + Supabase; hosting target is Vercel with intended domain `https://busmora.com` (not yet deployed). The schedule is intentionally aggressive; check actual throughput after the first vertical slice rather than assuming AI guarantees the deadline. Facebook/Meta is temporarily deferred by the owner and remains in the plan.

## 1. Execution sequence and daily outcomes

Recommended dependency-safe task order:

```text
C01 C02 C05 C06 C03 C04 C10 C07 C08 C09
C11 C12 C13 C16 C14 C15 C23 C17
C18 C19 C20 C21 C22
C24 C25 C28 C26 C27 C29
C30 C31 C32 C33 C34 C35
C36 C37 C39 C38 C40
```

Provider setup work for C04/C14/C25 starts on day one; it does not require waiting for every UI dependency. The order above is for completed slices, not a reason to postpone access checks. Automated tests and localization accompany each slice; C35/C37 are integration passes.

| Day | Focus | Required end-of-day demonstration |
|---|---|---|
| 1 | Baseline; essential migrations/types; shared language/shell; email routing; verify Google/model/search configuration (Meta deferred) | A real test user enters the app with a correct workspace; required integrations have a real check or named blocker |
| 2 | Shared manual/website intake; confirmation; Brain; provider gateway/browser runner; basic document save | Business enters/corrects facts, asks a scoped question, and receives a saved real output; navigation keeps the Task alive |
| 3 | Structured Chat/Canvas; real research/evidence; document editing; single Post/campaign output | One real research question yields inspectable sources; one English Post appears as a Publishing Post; Canvas matches calls |
| 4 | Discovery/research return; proposed Roadmap/activation; run/attest/skip/revisit; revision | Owner resumes a draft, returns research to an exact question, approves a plan and executes a step |
| 5 | Owner media; exact approvals; calendar; holds/recovery (Facebook Page/publisher deferred by owner) | Post appears in Scheduling with truthful approval state; no live Facebook send is claimed while deferred |
| 6 | CSV/XLSX analysis; Settings/notifications/export/delete; final English/mobile polish; deployed smoke checks | Complete cross-screen journey works in English; deterministic analysis and contextual links work |
| 7 | Freeze; regression fixes; clean presentation data; real account rehearsal; backup recording | Reproducible deployed build and timed presentation; no new feature development |

Use parallel human workstreams only when people are actually available: interface, AI/research, publishing, and data/QA can share contracts. Do not have multiple coding sessions edit the same shared files without coordination. This plan does not assume a fixed team or create extra agents.

At the day-two checkpoint, list remaining tasks and realistic capacity. Simplify within the feature contract: smaller question library, fewer recipes, simple calendar implementation, bounded templates, straightforward graph details. Stop ornamental work first. If a required feature cannot be completed, state it plainly and fix the demo claim; do not implement a deceptive success state.

## 2. Presentation business and data

Use **Nile Studio**, a fictional Egyptian interior-design consultation service. All business inputs are illustrative; generated research must still have actual sources.

| Field | Value |
|---|---|
| Country/service area | Egypt; Cairo and online consultations |
| Offering 1 | Initial design consultation; fixed EGP 1,500 |
| Offering 2 | Room design package; quote required; no invented price |
| Conversion route | A presenter-owned test booking/contact destination; clearly labeled as demo |
| Goal | Improve qualified consultation inquiries |
| Current constraint | Many inquiries, poor qualification; owner-supplied hypothesis, not a measured industry fact |
| Voice | Helpful, clear English; no unsupported promises |
| Available media | One image created/owned by the presenter; no borrowed customer testimonial |
| Practical constraints | Limited consultation capacity, no authorized ad spend, owner reviews external actions |

Keep two accounts/workspaces: an empty setup account for authentication/onboarding checks and a populated presenter workspace for the main timed demonstration. Do not pretend the populated history was generated moments ago. Judges can start a fresh business themselves after the presentation.

Seed only explicitly marked fictional inputs and saved plan/documents. Real completed research retains provider/source evidence. Label prepared plans as saved drafts until actually approved. Do not seed fake published IDs, fake citations, completed agent events, customer results, or live connections.

## 3. Analysis fixture and expected values

Create CSV and XLSX versions of the same supported-template row during C36. The following values are synthetic test inputs, not business evidence:

| Metric | Value |
|---|---:|
| Period | 2026-10-01 to 2026-10-31 |
| Impressions | 10,000 |
| Clicks | 500 |
| Inquiries | 100 |
| Qualified inquiries | 40 |
| Bookings | 15 |
| Customers | 10 |
| Ad spend | EGP 2,000 |
| Attributed revenue | EGP 10,000; explicitly marked attributed within this fixture |
| Total cost | EGP 6,000 |
| Net profit after those costs | EGP 4,000 |

Expected: CTR **5%**, qualification **40%**, inquiry-to-customer **10%**, cost per qualified inquiry **EGP 50**, ROAS **5×**, ROI **66.67%** only when the confirmed definition is net profit / total cost. All amounts/periods must share the same defined scope. Do not infer causal marketing impact from these ratios.

Negative fixtures: unknown inquiries; zero impressions; repeated identical row; overlapping cumulative periods; EGP/USD mix; missing attribution; ambiguous profit definition; invalid date; formula cell; unsupported sheet layout; oversized archive; text beginning with spreadsheet formula syntax in an exportable label. Each has an explicit expected warning/unavailable result.

## 4. Eight-minute main presentation

Adjust to the actual speaking slot. Use the populated presenter workspace and show existing work as existing work. Prepare the owner image in advance; a connected Page is only needed if the Facebook deferral is lifted. Timeboxes are presentation targets, not measured product latency claims.

| Time | Action | What judges learn |
|---|---|---|
| 0:00–0:40 | Open polished landing, explain the owner problem, enter app | Clear product identity and credible scope |
| 0:40–1:20 | Show confirmed business summary and Brain graph; inspect an offering/source | Persistent context is visible and editable |
| 1:20–2:20 | Ask one fresh scoped question/Post request; show actual Canvas activity while it runs | Real operation, useful response, no prompt expertise required |
| 2:20–3:10 | Open a saved real research report; inspect two sources and limitations | Research informs decisions and supports claims |
| 3:10–4:15 | Resume Discovery, show exact-question return and full approved Roadmap | Goal-led planning and continuity |
| 4:15–5:00 | Run a small step or open its genuine saved output; Skip/Revisit a different step | Steps are actionable and owner-controlled |
| 5:00–6:15 | Open generated Post in Scheduling, preview image/Page/time; approve a prepared valid test Post | Independent Posts, clear approval, strong calendar UI |
| 6:15–6:50 | Show a confirmed live publish/permalink or the rehearsed scheduled result | Actual external execution with evidence |
| 6:50–7:35 | Upload/map the fixture or open its saved confirmed analysis and explain one correct ratio | Deterministic math and useful interpretation |
| 7:35–8:00 | Show mobile view and a notification deep link | Finished English-only experience and accessibility |

If fresh generation takes longer, continue into saved work and return when it finishes. Do not slow/fake progress to match the script. Live publish requires the exact owner-reviewed content; schedule test Posts early enough to fit the real scheduler interval and delivery allowance. Never post content to an unintended Page for rehearsal.

> **Facebook/Meta deferral (19 November 2026):** the owner temporarily deprioritized Facebook while search/Firecrawl is prioritized. Do not implement, configure, claim or demo a live Facebook connection/publication. If the deferral is still in force at freeze, replace the 6:15–6:50 publish segment with a saved-output walkthrough and state plainly that publishing is upcoming. Keep C25/C26 in the plan; this note is not permission to delete the requirement.

## 5. Judge exploration checklist

The timed script does not demonstrate every requirement. Keep these paths ready for hands-on review:

- Immediate signup without email verification, and Google login; no company field during signup.
- Website/manual setup, incomplete extraction, optional pricing and no-ready-route option.
- Direct Chat without a Roadmap; form choices/custom/unknown and budget refusal.
- Two Tasks in separate conversations; third queued; navigation and interrupted-run recovery.
- Research a new question, inspect source excerpt, see a source failure or partial result.
- Brain edit/proposal approve/reject, relationship edit, source history, export/delete.
- Resume Discovery, return question research correctly, activate/reject revision, one active plan.
- Step double-click, owner attestation, skip running work without cancel, blocked dependent/revisit.
- Document version edit, search/date/type filter, Copy/Export/Reuse/Continue/Delete.
- Manual undated Post, image upload, Month/Week/List/Unscheduled, exact bulk decisions.
- Edit approved text/time/media/Page; old approval invalidated; reschedule with zone/allowance.
- Context price change holds relevant Post; disconnect/reconnect; uncertain result cannot be blindly resent.
- CSV and XLSX mapping; unknown/zero/duplicates/currency warnings; correct calculations.
- English interface, conversation and content; brand tone and target market remain configurable.
- Notification read/unread/mark-all; exact links; deleted subject unavailable.
- Future features clearly unavailable; no Today/Outcomes/Now-Next-Later/Ads execution.

## 6. Minimum test layers

### Fast local checks

Run existing commands from the actual repository:

```sh
rtk npm run build
rtk npm run lint
rtk npm run test:crawl
rtk npm run test:ui
rtk npm run test:crawl:ui
rtk npm run test:brain-delete:ui
```

Add new scripts during C37, not imaginary commands claimed to exist now. Keep a focused suite for domain validation/metrics, DB/RPC checks, and Playwright journeys. Build/type-check Edge Functions separately because the frontend build does not cover their runtime.

C01 baseline (19 November 2026): build passed; lint exit 0 with 11 warnings and no errors; crawl 26/26, AI gateway 6/6 and task runner 7/7 passed; local DB check blocked by the missing disposable PostgreSQL harness; hosted Supabase app tables/functions absent (404). Browser suites were not rerun. The earlier audit (build passed, lint eight warnings, crawl 25/25, two isolated UI scripts failed to start) remains historical. Re-run browser tests in the working development environment.

### Real persistence and two-user checks

Use a disposable Supabase project/local DB. Test ownership for Brain, draft, task/conversation, document, Post, image, notification and source. Test related-ID forgery. Test stale expectedVersion and double-click commands. Check audit rows actually save. Run each backfill twice and compare identities/counts. Never use production data resets for tests.

### Live provider smoke checks

One actual model generation, one actual Firecrawl retrieval/synthesis, real Google/email auth, one image upload, and — only when the Facebook deferral is lifted — real Page connect, each committed publish format, read-back and one scheduled send. Save environment/version/time and safe evidence; redact tokens. Intercepted Playwright APIs do not pass this layer.

### Important failure cases for the competition

| Scenario | Required behavior |
|---|---|
| Crawl/source unavailable | Partial draft/report retained; manual/retry option |
| AI unavailable or invalid JSON | No canned success; useful error/partial output |
| Browser closes during Task | Saved work and honest interrupted/resume state |
| Save result fails | Task not falsely completed; retry keeps output identity |
| Third concurrent Task | Queued with truthful state |
| Stale plan/Post approval | Conflict; current version remains unchanged |
| Edit approved price/content/media/time | Affected send held or approval invalidated |
| Publish times out after possible acceptance | Uncertain/reconcile/hold; no automatic duplicate |
| Token revoked/disconnected/late schedule | No unauthorized or late send; visible recovery |
| Unknown denominator or duplicate import | Withheld calculation/warning before interpretation |
| Deleted subject deep link | Honest unavailable state, no crash or resurrection |

Full crash/fault/load/restore testing remains H01–H10. Do not spend the week building an enterprise test framework instead of closing the core journeys.

## 7. Quality review and presentation freeze

Review realistic English examples across the selected markets and task types. Assess clarity, truthfulness, brand consistency and practical usefulness. Keep the full held-out quality evaluation in post-competition acceptance; do not claim it from a few demonstration outputs.

Measure actual time for the fresh-input demo and track corrections/latency separately from presenter interaction. Do not advertise the ten-minute first-value target as achieved without measurements.

Freeze at least 24 hours before presentation. Prepare: deployment URL/build, test credentials stored safely, reviewed test content, image, sample files, charger/network fallback, saved real outputs, a labeled recording, and a demo-only reset procedure. A configured Facebook Page is required only if the deferral is lifted. Rehearse once from a different device/browser. Remove noisy developer logs and any exposed secret before sharing.

## 8. Configuration and external dependencies

| Dependency | Required evidence before presentation |
|---|---|
| Supabase database/storage/functions | Tested migrations/RLS/storage policies and deployed function versions |
| Email signup & password recovery | Direct signup without verification; real delivered password recovery link and correct deployed callback |
| Google | Real dedicated-identity login on deployed origin |
| Model provider | Dashboard-managed key (or server fallback) deployed and one measured real generation |
| Search provider | Firecrawl credential stored server-side; measured query and inspectable source output |
| Meta Page | **Deferred by owner** — do not require for the current demo; requirements retained for C25/C26/H05/H06 |
| Scheduling | Real scheduled invocation, exact approval binding, correct zone/window (Facebook sends deferred with C26) |
| Hosting | Vercel project, HTTPS, SPA redirects, `busmora.com` DNS, fresh-device login and deep-link refresh |

Supabase documents scheduled Edge Function invocation using pg_cron/pg_net and server-side credentials; use the supported setup appropriate to the project's key type and current configuration. Do not accept a public publishable key as sufficient scheduler authority. [Official scheduling guide](https://supabase.com/docs/guides/functions/schedule-functions).

## 9. Evidence record template

```text
Task / requirement IDs:
Build / migration / function versions:
Environment and account class (demo developer-role vs ordinary owner):
Input / fixture / source timestamp:
Actual action:
Expected result:
Observed result:
Screenshot / safe log / provider permalink:
Status: passed | failed | not_run | externally_blocked
Remaining limitation and follow-up ID:
```

Record mocks, authored sample data, live results, and saved historical outputs distinctly. This keeps the presentation credible while preserving a practical path to production later.
