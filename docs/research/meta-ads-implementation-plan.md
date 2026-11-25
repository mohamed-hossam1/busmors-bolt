# Meta Ads Reporting MVP: implementation plan for the executor

> **Who this is for:** a coding agent that runs this plan one step at a time.
> - Follow every step exactly as written. Do not redesign anything.
> - If something you need is missing from this plan, **stop and ask the human**. Never guess.
> - **Never edit a test so that it passes.** The expected values in this plan were checked by hand against the rules. If a test fails, fix the implementation.
>
> **Source of truth for scope:** `docs/research/meta-ads-reporting.md`.
> **Scope the human chose:** the **reporting dashboard only**, with charts built on **recharts**.

---

## 0. Context

Business owners get lost in Meta Ads Manager. BUSMORA will show them one **read-only** page with:
- an Arabic summary sentence
- KPI tiles
- a daily trend
- a list of ads with a health dot
- a video retention curve for each video ad

The data comes from the Composio `metaads` toolkit, using the same Composio setup the app already uses for Facebook publishing. The report is cached in Supabase. A sync runs only in two cases:
- the user opens the page and the cache is older than 5 hours
- the user presses Refresh, at most once every 30 minutes

There is no cron job. The feature is hidden behind `META_ADS_PROVIDER`, which defaults to `disabled`. While it is disabled, nothing is visible, so `prd.md` AC-58 ("Deferred Meta Ads") stays true until the team turns it on.

### What this MVP leaves out on purpose

These are lean-MVP cuts. Do not build any of them:
- ad thumbnails or image storage
- usage or quota accounting tables
- daily or monthly sync limits
- distributed sync locks
- cron jobs or alerts
- history comparisons
- more than one ad account
- chat tools
- any write action on Meta

### Facts verified in the repo. Rely on these.

| Topic | Fact | Anchor |
|---|---|---|
| Composio SDK | `@composio/core` 0.28.0. The client is `new Composio({ apiKey })`. A tool call is `tools.execute(slug, { userId, connectedAccountId, version, arguments })` and returns `{ data, error, successful, logId }`. | `src/server/publishing/composio-provider.ts:26-36,97-113` |
| Composio connect | `connectedAccounts.link(userId, authConfigId, { callbackUrl, allowMultiple: true })`. Ownership is checked with `connectedAccounts.list({ userIds, toolkitSlugs })` and `get(id)`. | `composio-provider.ts:43-52,74-89` |
| Composio tool schemas | `composio.tools.getRawComposioTools({ toolkits: ['metaads'] })` | `node_modules/@composio/core/dist/composio-CwHMpKXb.d.mts:158` |
| Provider selection | Chosen by an env var: `composio`, `fake` or `disabled`. `fake` is refused in production. | `src/server/publishing/provider.ts:36-51`, `fake-provider.ts` |
| Tenancy | The workspace id equals `auth.users.id`, which equals the Composio `userId`. Never take it from client input. | `src/server/auth.ts:8-44` |
| Database | Supabase with no ORM and no zod. Tables get RLS with an `"owner read"` policy. All writes go through `SECURITY DEFINER` RPCs granted only to `service_role`. | `supabase/migrations/20261121120000_facebook_connection_rpcs.sql`, `20261122120000_orchestrator_first.sql` |
| DB clients | `createServerSupabase()` runs as the user, so RLS applies. `createAdminClient()` uses the service role. | `src/server/supabase.ts:6`, `src/server/supabase-admin.ts:20` |
| API routes | `requireApiIdentity(request)` enforces same-origin on non-GET requests. Errors are returned with `failure(status, code, messageKey)` as an `ApiFailure`. | `src/app/api/connections/facebook/*/route.ts`, `src/server/publishing/connection-http.ts` |
| Locale routing | `src/proxy.ts` handles `/api` and `/auth`, then redirects any path without a locale to `/<locale>/...` using `request.nextUrl.clone()`, which **keeps the query string**. Exports from `src/lib/i18n.ts` are `defaultLocale`, `hasLocale` and `LOCALE_COOKIE` (cookie `BUSMORA_LOCALE`). | `src/proxy.ts:6,20-45` |
| Unit tests | `node:test` with `node:assert/strict`, loaded through `scripts/testing/ts-register.mjs`. **The loader does NOT resolve `@/`**, so tests import with relative paths. Fakes are hand-written. Reference test style: `tests/research/providers.test.ts` and `tests/research/support/fakes.ts`. These exist only in the worktree `.claude/worktrees/merge`; read them there. | `scripts/testing/ts-resolve-hook.mjs` |
| `tests/` on main | **Does not exist.** `npm run test:unit` points at folders that are missing on main. Do not touch that script. | `package.json` |
| DB tests | Self-rolling-back `.sql` files run with `node scripts/db-check.cjs <file>`, which needs `LOCAL_PG_URL`. | `scripts/facebook-connection-db-check.sql`, `scripts/db-check.cjs`, `scripts/local-migration-check.mjs:17` |
| Typecheck and lint | `npm run typecheck` (`next typegen && tsc --noEmit`) and `npm run lint` (oxlint). Neither covers `tests/`. | `package.json`, `tsconfig.json` |
| UI | Tailwind 3 plus the classes `.card`, `.btn-primary`, `.btn-secondary`, `.badge`, `.workspace-page`, `.workspace-heading` and `.workspace-description`. Components `LoadingState`, `EmptyState` and `useDialog`. Pages are thin wrappers around `src/screens/*`. | `DESIGN.md:21`, `src/app/[lang]/(workspace)/scheduling/page.tsx` |
| Nav and routes | The nav is a hard-coded `items` array. Route constants are `ROUTES.APP.*`. Protected paths are a regex. | `src/components/AppShell.tsx:26-33`, `src/shared/routes.ts`, `src/proxy.ts:6` |
| i18n | `src/app/[lang]/dictionaries/{ar,en}.json`, with copy under `"app"`. `Dictionary = typeof en`, so **both files must have the same keys**. Components call `const { t } = useCopy()`, and `useLocale()` comes from `src/context/I18nContext.tsx`. | `src/lib/i18n.ts`, `src/hooks/useCopy.ts` |
| Next.js 16 | Read `node_modules/next/dist/docs/` before writing a page or route (see `AGENTS.md`). In pages, `searchParams` is a Promise. | `AGENTS.md` |
| Composio quota | Direct `tools.execute` calls are capped at **10K a month on Hobby**, and publishing shares that cap. This MVP controls usage only through the 5 h staleness rule and the 30 min Refresh cooldown. A sync normally makes 3 calls, or 4 when the video-field fallback runs. With insights paging (up to 3 pages per query) the worst case is 12 calls. | `docs/research/composio.md:51,60` |

### Global "Do NOT" list (applies to every phase)

- Do NOT modify `src/server/publishing/**`, `platform_connections`, any existing migration, `prd.md`, `src/features/orchestrator/**`, or the `test:unit` script in `package.json`.
- Do NOT call any Composio `metaads` tool except the two listed in `src/features/meta-ads/tools.ts`, which are an ad-account list tool and `METAADS_GET_INSIGHTS`.
- Do NOT download, store or proxy ad images. Do NOT use the Supabase Storage bucket `owner-media`.
- Do NOT add a cron job, alerts, email reports, history comparisons, multiple ad accounts, chat tools, quota tables or sync locks.
- Do NOT add zod, shadcn, an ORM or a state library. The only new dependency is `recharts`.
- Do NOT import with `@/` inside `src/features/meta-ads/**`. Use relative imports, because the unit-test loader cannot resolve `@/`.
- Do NOT send a Meta token, a `connection_ref` or a Composio account id to the browser.
- Do NOT commit real ad data samples. Do NOT leave placeholder text such as `<...>`, `?` or `TODO` in any source file.

### Gate commands

Phase 1 adds the npm script `test:meta-ads`. Before Phase 1, run the long form:
```powershell
node --experimental-transform-types --import ./scripts/testing/ts-register.mjs --test tests/meta-ads/*.test.ts
```
```powershell
npm run typecheck
```
```powershell
npm run lint
```

**Gate rule for every phase:** do not start the next phase until every gate command exits 0, with **0 failing tests, 0 type errors and 0 lint errors**. If a gate fails, fix the code of the current phase only. Never weaken, skip or delete a test.

---

## File map (final state)

```
docs/research/metaads-tools.md              Phase 0 output (verified slugs, args, version)
scripts/meta-ads/inspect-tools.mjs          Phase 0 read-only schema dump

src/features/meta-ads/                      pure, relative imports only, unit tested
  contracts.ts        types + MetaAdsTransport interface + num()
  tools.ts            verified tool slugs/version + read-only allowlist guard
  objective-map.ts    actions → primary result per kind
  video-curve.ts      22-point curve → labelled points
  format.ts           money / count / percent formatting
  normalize.ts        raw Graph rows → AdsReport
  freshness.ts        decideSync (5 h stale / 30 min manual cooldown)
  composio-parse.ts   unwrap Composio responses, error codes, argument builder, ad-account parser
  account-choice.ts   none / auto / choose decision after connect
  sync.ts             runSync orchestration (injected transport)
  view-model.ts       rangeFromParam, summarySentence, shouldAutoSync, reportStatus

src/server/meta-ads/
  provider.ts         MetaAdsProvider interface + getMetaAdsProvider() + isMetaAdsEnabled()
  composio-provider.ts
  fake-provider.ts
  connection-http.ts  nonce cookie helpers, failure(), notConfigured(), adsRedirect()
  store.ts            admin-client reads + RPC wrappers
  view.ts             loadAdsReportView() for the page (user client, RLS)

src/app/api/connections/meta-ads/{start,callback,accounts,select,disconnect}/route.ts
src/app/api/meta-ads/sync/route.ts
src/app/[lang]/(workspace)/ads/page.tsx
src/app/[lang]/(workspace)/ads/loading.tsx
src/screens/AdsReportPage.tsx
src/components/meta-ads/{KpiTiles,DailyTrendChart,AdsList,VideoCurveChart,AccountChooser,ReportStatusCard}.tsx

supabase/migrations/20261125120000_meta_ads_reporting.sql
scripts/meta-ads-db-check.sql

tests/meta-ads/{tools,objective-map,video-curve,format,normalize,freshness,composio-parse,fake-provider,account-choice,sync,view-model}.test.ts
tests/meta-ads/support/{fixtures,fakes}.ts
```

Files that are modified, not created: `package.json` (one script and one dependency), `.env.example`, `scripts/local-migration-check.mjs`, `src/shared/routes.ts`, `src/proxy.ts`, `src/app/[lang]/(workspace)/layout.tsx`, `src/components/AppShell.tsx`, `src/app/[lang]/dictionaries/ar.json`, `src/app/[lang]/dictionaries/en.json`.

---

## Phase 0: Verify the Composio `metaads` tools (HARD BLOCKER, no app code)

**Goal:** turn guesses into facts. So far only the name `METAADS_GET_INSIGHTS` has been confirmed. Phase 1 writes the exact slugs and toolkit version into source code.

> **⛔ BLOCKING:** no phase after this one may start until `docs/research/metaads-tools.md` is complete and the human has confirmed it. If the human cannot run the script, **stop the whole plan and wait**. Do not continue with placeholders.

**Files to read first:**
- `src/server/publishing/composio-provider.ts`, all of it
- `node_modules/@composio/core/dist/composio-CwHMpKXb.d.mts`, lines 100–230: `getRawComposioTools`, `getRawComposioToolBySlug`, and the `Tool` type
- `docs/research/composio.md`, section 3 (the Meta Ads table)

**Step 1, RED:** this phase has no test. It produces a document.

**Step 2, do:**

1. Create `scripts/meta-ads/inspect-tools.mjs`. It is **read-only**: it lists schemas and never calls `tools.execute`.
   ```js
   import { Composio } from '@composio/core'
   const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY })
   const tools = await composio.tools.getRawComposioTools({ toolkits: ['metaads'], limit: 500 })
   const rows = tools.map((tool) => ({ slug: tool.slug, version: tool.version, description: String(tool.description ?? '').slice(0, 300), input: tool.inputParameters }))
   console.log(JSON.stringify(rows, null, 2))
   ```
   If the `Tool` type in the `.d.mts` file names these properties differently, use the names from the `.d.mts`.

2. Ask the human to run the script. It needs their `COMPOSIO_API_KEY`.
   ```powershell
   node --env-file=.env scripts/meta-ads/inspect-tools.mjs
   ```

3. Create `docs/research/metaads-tools.md` and fill in this table from the JSON. Every cell must hold a real value.

   | Purpose | Slug | Exact argument names | Toolkit version |
   |---|---|---|---|
   | List the ad accounts of the connected user (Graph `me/adaccounts`; fields `id,name,currency,timezone_name,account_status`) | | name of the fields arg; name of the limit arg; name of the paging cursor arg (if any) | |
   | Insights for an ad account at `account` or `ad` level | `METAADS_GET_INSIGHTS` | names for: object/account id, level, date preset, time increment, fields, limit, paging cursor | |

   **How to pick the list-accounts slug:**
   - Pick a tool whose description says list, get, read or fetch ad accounts.
   - **Never** pick a slug that contains `CREATE`, `UPDATE`, `DELETE`, `SET_`, `PAUSE`, `UPLOAD`, `ARCHIVE` or `COPY`.
   - If no tool lists ad accounts, **stop and tell the human**. The connect flow cannot work without one.

4. Also write down in `metaads-tools.md` whether `METAADS_GET_INSIGHTS` accepts the fields `video_play_curve_actions` and `video_thruplay_watched_actions`. The usual Composio behaviour is that it accepts any Graph field string; confirm this from the schema description.

5. **Optional, human only.** If the human has a real connected `metaads` account, they can run one manual insights call and save the response under `.scratch/meta-ads/samples/`. **Never commit it.** Use it to confirm three things, and mark each one **VERIFIED** or **UNVERIFIED** in `metaads-tools.md`:
   - The rows sit under `data.data` or under `data.response_data.data`.
   - `video_play_curve_actions[0].value` is an array of 22 numbers.
   - Those numbers are percentages from 0 to 100.

**Step 3, gate:** `docs/research/metaads-tools.md` exists, every table cell is filled with a real value, and the human has replied confirming it.

---

## Phase 1: Contracts, verified tool allowlist, result mapping, video curve, formatting

**Files to read first:**
- `docs/research/metaads-tools.md` (Phase 0 output)
- `tests/research/support/fakes.ts` and `tests/research/providers.test.ts`, both in `.claude/worktrees/merge`
- `scripts/testing/ts-resolve-hook.mjs`
- `docs/research/meta-ads-reporting.md` §4, "ملاحظات parsing مهمة"

### Step 1, RED

Add this line to the `scripts` block of `package.json`, directly after `test:unit`:
```json
"test:meta-ads": "node --experimental-transform-types --import ./scripts/testing/ts-register.mjs --test tests/meta-ads/*.test.ts",
```

Every test file below starts with:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
```

**`tests/meta-ads/tools.test.ts`**
- `META_ADS_TOOLS.insights === 'METAADS_GET_INSIGHTS'`.
- `META_ADS_TOOLS.listAdAccounts` equals the slug written in `docs/research/metaads-tools.md`. Paste the literal string into the test.
- `META_ADS_TOOLKIT_VERSION` equals the literal version from `metaads-tools.md`.
- **Placeholder guard:** every value in `META_ADS_ALLOWED_TOOLS`, and also `META_ADS_TOOLKIT_VERSION`, must not match `/[<>?]|TODO|slug|version/i`.
- Every value in `META_ADS_ALLOWED_TOOLS` matches `/^METAADS_[A-Z0-9_]+$/`.
- Every value in `META_ADS_ALLOWED_TOOLS` does **not** match `/CREATE|UPDATE|DELETE|SET_|PAUSE|UPLOAD|ARCHIVE|COPY/`.
- `META_ADS_ALLOWED_TOOLS.length === 2`.
- `assertAllowedTool('METAADS_GET_INSIGHTS')` does not throw.
- Each of these throws `ReadOnlyViolation`: `assertAllowedTool('METAADS_SET_AD_OBJECT_STATUS')`, `assertAllowedTool('METAADS_CREATE_CAMPAIGN')`, `assertAllowedTool('')`.

**`tests/meta-ads/objective-map.test.ts`**

Actions are written as `{ action_type, value }` with string values, the way Meta returns them. `M` is `'onsite_conversion.messaging_conversation_started_7d'`.

`primaryResult(objective, actions, clicks)`:
- `('OUTCOME_ENGAGEMENT', [{action_type:M, value:'12'}], 0)` returns `{ kind: 'messages', value: 12 }`.
- `('MESSAGES', [{action_type:M, value:'12'}], 0)` returns `{ kind: 'messages', value: 12 }`.
- `('OUTCOME_LEADS', [{action_type:'lead',value:'5'},{action_type:'onsite_conversion.lead_grouped',value:'5'}], 0)` returns `{ kind: 'leads', value: 5 }`. This proves the value is the first type found, not a sum.
- `('OUTCOME_LEADS', [{action_type:'onsite_conversion.lead_grouped',value:'3'}], 0)` returns `{ kind: 'leads', value: 3 }`.
- `('OUTCOME_SALES', [{action_type:'purchase',value:'2'}], 0)` returns `{ kind: 'purchases', value: 2 }`.
- `('OUTCOME_SALES', [{action_type:M,value:'4'}], 0)` returns `{ kind: 'messages', value: 4 }`, because messaging is the fallback.
- `('OUTCOME_TRAFFIC', undefined, 40)` returns `{ kind: 'clicks', value: 40 }`.
- `(null, undefined, 7)` returns `{ kind: 'clicks', value: 7 }`.
- `('OUTCOME_ENGAGEMENT', [{action_type:M,value:'abc'}], 0)` returns `{ kind: 'messages', value: 0 }`.

`resultForKind(kind, actions, clicks)`:
- `('messages', [{action_type:M,value:'38'}], 300)` returns `38`.
- `('leads', [{action_type:M,value:'38'}], 300)` returns `0`. There is no lead action, so the result is 0, not null.
- `('clicks', [{action_type:M,value:'38'}], 300)` returns `300`.
- `('purchases', [{action_type:'omni_purchase',value:'6'}], 0)` returns `6`.

**`tests/meta-ads/video-curve.test.ts`**
- `CURVE_SECONDS` deep-equals `[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,20,25,30,40,50,60]`.
- `curveLabel` returns these labels for these seconds: `0` → `'0:00'`, `15` → `'0:15'`, `20` → `'0:20'`, `30` → `'0:30'`, `40` → `'0:40'`, `60` → `'1:00+'`.
- Let `P = [100,72,58,49,43,39,36,33,31,29,27,26,25,24,23,22,19,17,15,12,10,8]`. `toVideoCurve([{ action_type: 'video_view', value: P }])` returns 22 points. Point 0 is `{ second: 0, label: '0:00', percent: 100 }`. Point 16 is `{ second: 20, label: '0:20', percent: 19 }`. Point 21 is `{ second: 60, label: '1:00+', percent: 8 }`.
- With counts `[2000, 1000, …20 more values all 500]`: point 0 has `percent === 100`, point 1 has `percent === 50`, and point 2 has `percent === 25`.
- Each of these inputs returns `null`:
  - an array of 21 values
  - `undefined`
  - `[]`
  - `[{ action_type: 'video_view' }]`
  - count mode with a first value of `0`, for example `[0, 200, …]`

**`tests/meta-ads/format.test.ts`**
- `formatMoney(1234.5, 'EGP', 'en')` contains `'1,234.50'` and also contains `'EGP'`.
- `formatMoney(1234.5, 'EGP', 'ar')` contains `'1,234.50'`. This checks that Latin digits are used.
- `formatMoney(10, 'XXX1', 'en')` returns exactly `'10.00 XXX1'`.
- `formatPercent(0.0345)` returns `'3.45%'`. `formatPercent(null)` returns `'—'`.
- `formatCount(12345)` returns `'12,345'`. `formatCount(12.6)` returns `'13'`.

Run `npm run test:meta-ads`. **Confirm that it fails** because the modules do not exist yet.

### Step 2, GREEN

**`src/features/meta-ads/contracts.ts`** (exactly this):
```ts
export type DatePreset = 'last_7d' | 'last_30d'
export const DATE_PRESETS: readonly DatePreset[] = ['last_7d', 'last_30d']
export type ResultKind = 'messages' | 'leads' | 'purchases' | 'clicks'
export type Health = 'good' | 'average' | 'poor' | 'unknown'
export type MetaAdsErrorCode = 'auth_expired' | 'permission_denied' | 'invalid_request' | 'provider_error'
export type RawRow = Record<string, unknown>

export interface AdAccount { id: string; name: string; currency: string; timezoneName: string; active: boolean }
export interface InsightsQuery { adAccountId: string; level: 'account' | 'ad'; datePreset: DatePreset; daily: boolean; fields: readonly string[] }
export type TransportResult<T> = { ok: true; value: T } | { ok: false; code: MetaAdsErrorCode }

/** Read-only data access. Implementations never throw. */
export interface MetaAdsTransport {
  listAdAccounts(workspaceId: string, connectionRef: string): Promise<TransportResult<AdAccount[]>>
  getInsights(workspaceId: string, connectionRef: string, query: InsightsQuery): Promise<TransportResult<RawRow[]>>
}

export interface KpiSummary { spend: number; impressions: number; reach: number; frequency: number; clicks: number; ctr: number | null; cpc: number | null; cpm: number | null; results: number; resultKind: ResultKind; costPerResult: number | null }
export interface DailyPoint { date: string; spend: number; impressions: number; clicks: number; results: number }
export interface VideoCurvePoint { second: number; label: string; percent: number }
export interface AdRow { adId: string; adName: string; campaignName: string; objective: string | null; spend: number; impressions: number; clicks: number; ctr: number | null; results: number; resultKind: ResultKind; costPerResult: number | null; hookRate: number | null; holdRate: number | null; videoCurve: VideoCurvePoint[] | null; health: Health }
export interface AdsReport { schemaVersion: 1; adAccountId: string; currency: string; timezoneName: string; datePreset: DatePreset; generatedAt: string; summary: KpiSummary; daily: DailyPoint[]; ads: AdRow[] }

export function num(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : 0
}
```

**`src/features/meta-ads/tools.ts`**
- `export class ReadOnlyViolation extends Error {}`
- `export const META_ADS_TOOLS = { listAdAccounts: '<LITERAL SLUG FROM metaads-tools.md>', insights: 'METAADS_GET_INSIGHTS' } as const`. Write the real slug. The tools test fails if any placeholder is left.
- `export const META_ADS_TOOLKIT_VERSION = '<LITERAL VERSION FROM metaads-tools.md>'`. Write the real version.
- `export const META_ADS_ALLOWED_TOOLS: readonly string[] = [META_ADS_TOOLS.listAdAccounts, META_ADS_TOOLS.insights]`
- `const FORBIDDEN = /CREATE|UPDATE|DELETE|SET_|PAUSE|UPLOAD|ARCHIVE|COPY/`
- `export function assertAllowedTool(slug: string): void` throws `new ReadOnlyViolation(slug)` when `!META_ADS_ALLOWED_TOOLS.includes(slug) || FORBIDDEN.test(slug)`.

**`src/features/meta-ads/objective-map.ts`**
```ts
export const MESSAGING = 'onsite_conversion.messaging_conversation_started_7d'
export const RESULT_ACTION_TYPES = {
  messages: [MESSAGING],
  leads: ['lead', 'onsite_conversion.lead_grouped'],
  purchases: ['purchase', 'omni_purchase'],
} as const
```

`export function actionValue(actions: unknown, types: readonly string[]): number | null`:
- Return `null` when `actions` is not an array.
- Go through `types` **in order**. For each type, find the first element whose `action_type === type`. If one is found, return `num(element.value)`.
- Return `null` when no type is found.

`export function resultForKind(kind: ResultKind, actions: unknown, clicks: number): number`:
- `kind === 'clicks'` returns `clicks`.
- Otherwise returns `actionValue(actions, RESULT_ACTION_TYPES[kind]) ?? 0`.

`export function primaryResult(objective: string | null, actions: unknown, clicks: number): { kind: ResultKind; value: number }` checks these rules in order:
1. `objective` is `'OUTCOME_LEADS'` or `'LEAD_GENERATION'`, and `actionValue(actions, RESULT_ACTION_TYPES.leads) !== null`: return `leads`.
2. `objective` is `'OUTCOME_SALES'`, `'CONVERSIONS'` or `'PRODUCT_CATALOG_SALES'`, and the purchases value is not null: return `purchases`.
3. `actionValue(actions, RESULT_ACTION_TYPES.messages) !== null`: return `messages`.
4. Otherwise return `{ kind: 'clicks', value: clicks }`.

**`src/features/meta-ads/video-curve.ts`**
- Export `CURVE_SECONDS`, a 22-element array.
- `export function curveLabel(second: number): string`: returns `'1:00+'` when `second >= 60`, otherwise `'0:' + String(second).padStart(2, '0')`.
- `export function toVideoCurve(raw: unknown): VideoCurvePoint[] | null`:
  1. Let `first = Array.isArray(raw) ? raw[0] : undefined` and `values = first?.value`.
  2. If `values` is not an array of length 22, return `null`.
  3. Map each value through `num`.
  4. **Count mode**, used when any value is greater than 100:
     - Return `null` when `values[0] <= 0`.
     - Otherwise `percent = Math.round(v / values[0] * 1000) / 10`.
  5. **Percent mode**, used otherwise: `percent = Math.round(v * 10) / 10`.
  6. Return `CURVE_SECONDS.map((second, i) => ({ second, label: curveLabel(second), percent }))`.

**`src/features/meta-ads/format.ts`**
- `export function localeTag(locale: 'ar' | 'en')` returns `'ar-EG-u-nu-latn'` for `'ar'` and `'en'` for `'en'`.
- `export function formatMoney(value: number, currency: string, locale: 'ar' | 'en')`:
  - Inside a `try`, return `new Intl.NumberFormat(localeTag(locale), { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)`.
  - In the `catch`, return `value.toFixed(2) + ' ' + currency`.
- `export function formatCount(value: number)` returns `new Intl.NumberFormat('en').format(Math.round(value))`.
- `export function formatPercent(ratio: number | null)` returns `'—'` when `ratio === null`, otherwise `(ratio * 100).toFixed(2) + '%'`.

**Step 3, gate:** run the three gate commands. All four Phase 1 test files must pass, with 0 type errors and 0 lint errors.

---

## Phase 2: Normalize raw rows into an `AdsReport`

**Files to read first:**
- the Phase 1 files under `src/features/meta-ads/`
- `docs/research/meta-ads-reporting.md`, parsing notes 1–4

### Step 1, RED

**`tests/meta-ads/support/fixtures.ts`** exports the following. Every numeric value is a **string**, the way Meta sends it.

```ts
export const M = 'onsite_conversion.messaging_conversation_started_7d'
export const ACCOUNT = { id: 'act_111', name: 'Zekra', currency: 'EGP', timezoneName: 'Africa/Cairo', active: true }
export const CURVE = [100,72,58,49,43,39,36,33,31,29,27,26,25,24,23,22,19,17,15,12,10,8]

// Account-level, whole period. Results = 38 (period actions), deliberately different from
// the per-ad sum (35) to prove summary.results comes from the period row, not from ads.
export const PERIOD_ROW = { spend: '700.00', impressions: '20000', reach: '9000', frequency: '2.22', clicks: '300', ctr: '1.5', cpc: '2.33', cpm: '35', actions: [{ action_type: M, value: '38' }] }

// Account-level daily rows, deliberately out of order; each carries reach that must NOT be used.
export const DAILY_ROWS = [
  { date_start: '2026-11-03', spend: '300', impressions: '8000', clicks: '120', reach: '5000', actions: [{ action_type: M, value: '15' }] },
  { date_start: '2026-11-01', spend: '200', impressions: '6000', clicks: '90',  reach: '5000', actions: [{ action_type: M, value: '10' }] },
  { date_start: '2026-11-02', spend: '200', impressions: '6000', clicks: '90',  reach: '5000', actions: [{ action_type: M, value: '13' }] },
]

export const AD_ROWS = [
  { ad_id: '1', ad_name: 'Reel A', campaign_name: 'Camp 1', objective: 'OUTCOME_ENGAGEMENT', spend: '400', impressions: '12000', clicks: '150', ctr: '1.25',
    actions: [{ action_type: M, value: '25' }, { action_type: 'video_view', value: '3000' }],
    video_thruplay_watched_actions: [{ action_type: 'video_view', value: '600' }],
    video_play_curve_actions: [{ action_type: 'video_view', value: CURVE }] },
  { ad_id: '2', ad_name: 'Post B', campaign_name: 'Camp 1', objective: 'OUTCOME_ENGAGEMENT', spend: '250', impressions: '7000', clicks: '100', ctr: '1.4',
    actions: [{ action_type: M, value: '10' }] },
  { ad_id: '3', ad_name: 'Traffic C', campaign_name: 'Camp 2', objective: 'OUTCOME_TRAFFIC', spend: '50', impressions: '900', clicks: '40', ctr: '4.44' },
  { ad_id: '4', ad_name: 'Tiny D', campaign_name: 'Camp 2', objective: null, spend: '0', impressions: '100', clicks: '0', ctr: '0' },
]
```

**`tests/meta-ads/normalize.test.ts`** calls:
```ts
normalizeReport({ account: ACCOUNT, datePreset: 'last_7d', generatedAt: '2026-11-24T10:00:00.000Z', periodRow: PERIOD_ROW, dailyRows: DAILY_ROWS, adRows: AD_ROWS })
```
These values were checked by hand against the Phase 2 rules:

- **Report fields:**
  - `schemaVersion === 1`
  - `adAccountId === 'act_111'`
  - `currency === 'EGP'`
  - `timezoneName === 'Africa/Cairo'`
  - `datePreset === 'last_7d'`
  - `generatedAt === '2026-11-24T10:00:00.000Z'`
- **Summary from the period row:**
  - `spend === 700`, `impressions === 20000`, `reach === 9000`, `frequency === 2.22`, `clicks === 300`
  - `ctr === 0.015`. Meta's `ctr` is a percentage, so it is divided by 100.
  - `cpc === 2.33`, `cpm === 35`
- **Dominant result kind:** `summary.resultKind === 'messages'`. Spend by kind is messages 650, clicks 50 + 0 = 50.
- **Summary results come from the period row:**
  - `summary.results === 38`. It is **not 35**, which would be the per-ad sum.
  - `Math.abs(summary.costPerResult - 700 / 38) < 1e-9`
- **Daily:**
  - `daily` deep-equals:
    ```ts
    [{ date:'2026-11-01', spend:200, impressions:6000, clicks:90, results:10 }, { date:'2026-11-02', spend:200, impressions:6000, clicks:90, results:13 }, { date:'2026-11-03', spend:300, impressions:8000, clicks:120, results:15 }]
    ```
  - No daily point has a `reach` key.
- **Ads order:** `ads.map(a => a.adId)` deep-equals `['1','2','3','4']`, sorted by spend descending. Ad 4 has spend 0 and comes last.
- **Ad 1:**
  - `resultKind === 'messages'`, `results === 25`, `costPerResult === 16`
  - `ctr === 0.0125`
  - `hookRate === 0.25` (3000 / 12000)
  - `holdRate === 0.2` (600 / 3000)
  - `videoCurve.length === 22` and `videoCurve[16].label === '0:20'`
  - `health === 'average'`
- **Ad 2:** `results === 10`, `costPerResult === 25`, `hookRate === null`, `holdRate === null`, `videoCurve === null`, `health === 'poor'`.
- **Ad 3:** `resultKind === 'clicks'`, `results === 40`, `costPerResult === 1.25`, `health === 'good'`.
- **Ad 4:** `resultKind === 'clicks'`, `results === 0`, `costPerResult === null`, `health === 'unknown'`.

The health values were worked out like this:
- The messages average is 650 / 35 ≈ 18.571. So "good" means a cost of at most 14.857, and "poor" means a cost of at least 23.214.
  - Ad 1 costs 16, which falls between the two limits, so it is `average`.
  - Ad 2 costs 25, which is at least 23.214, so it is `poor`.
- Ad 3 has CTR 0.0444, the account CTR is 0.015, and 1.25 × 0.015 = 0.01875. Since 0.0444 ≥ 0.01875, Ad 3 is `good`.
- Ad 4 has impressions < 500, so it is `unknown`.

Separate tests:
- **Empty input:** `normalizeReport({ account: ACCOUNT, datePreset: 'last_30d', generatedAt: 'x', periodRow: null, dailyRows: [], adRows: [] })` gives:
  - `summary` deep-equals `{ spend:0, impressions:0, reach:0, frequency:0, clicks:0, ctr:null, cpc:null, cpm:null, results:0, resultKind:'clicks', costPerResult:null }`
  - `daily` deep-equals `[]` and `ads` deep-equals `[]`
- **Rows dropped:** an ad row without `ad_id`, such as `{ spend: '5' }`, is dropped. A daily row without `date_start` is dropped.
- **Ad cap:** 60 generated rows `{ ad_id: String(i), ad_name: 'g' + i, campaign_name: 'c', objective: null, spend: String(i), impressions: '1000', clicks: '1', ctr: '0.1' }` for `i = 0..59` give `ads.length === 50`, with `ads[0].adId === '59'` and `ads[49].adId === '10'`.

Run it and confirm RED.

### Step 2, GREEN

Create **`src/features/meta-ads/normalize.ts`**:
```ts
export function normalizeReport(input: { account: AdAccount; datePreset: DatePreset; generatedAt: string; periodRow: RawRow | null; dailyRows: RawRow[]; adRows: RawRow[] }): AdsReport
```

Apply these rules exactly.

1. **Ads.** Keep only rows where `typeof row.ad_id === 'string' && row.ad_id !== ''`. For each kept row:
   - `objective = typeof row.objective === 'string' ? row.objective : null`
   - `spend = num(row.spend)`, `impressions = num(row.impressions)`, `clicks = num(row.clicks)`
   - `ctr = row.ctr == null ? null : num(row.ctr) / 100`
   - `{ kind, value } = primaryResult(objective, row.actions, clicks)`
   - `costPerResult = value > 0 ? spend / value : null`
   - `video3s = actionValue(row.actions, ['video_view'])`
   - `hookRate = video3s !== null && video3s > 0 && impressions > 0 ? video3s / impressions : null`
   - `thru = actionValue(row.video_thruplay_watched_actions, ['video_view'])`
   - `holdRate = video3s !== null && video3s > 0 && thru !== null ? thru / video3s : null`
   - `videoCurve = toVideoCurve(row.video_play_curve_actions)`
   - `adName = typeof row.ad_name === 'string' ? row.ad_name : row.ad_id`
   - `campaignName = typeof row.campaign_name === 'string' ? row.campaign_name : ''`

   Then sort by spend, highest first, and keep the first 50. `health` is filled in at step 5.

2. **Dominant kind.**
   - Add up `spend` for each `resultKind` across **all** ads that survived step 1, counting before the cap of 50 is applied.
   - The kind with the most spend wins.
   - If there is a tie, use this priority order: `messages`, then `leads`, then `purchases`, then `clicks`.
   - If there are no ads, or the highest total is 0, the dominant kind is `'clicks'`.

3. **Summary.** Let `p = input.periodRow`.
   - When `p` is null, every number is 0, and `ctr`, `cpc`, `cpm` and `costPerResult` are `null`.
   - When `p` is present:
     - `spend`, `impressions`, `reach`, `frequency` and `clicks` come from `num(p.<field>)`.
     - `ctr = p.ctr == null ? null : num(p.ctr) / 100`
     - `cpc = p.cpc == null ? null : num(p.cpc)`
     - `cpm = p.cpm == null ? null : num(p.cpm)`
   - `results = p ? resultForKind(dominant, p.actions, num(p.clicks)) : 0`. **Never sum ads for this, and never compute reach or frequency from the daily rows.**
   - `costPerResult = results > 0 ? spend / results : null`
   - `resultKind = dominant`

4. **Daily.** Keep only rows where `typeof row.date_start === 'string'`. Each row maps to:
   ```ts
   { date: row.date_start, spend: num(row.spend), impressions: num(row.impressions), clicks: num(row.clicks), results: resultForKind(dominant, row.actions, num(row.clicks)) }
   ```
   Create the object with exactly these 5 keys. Sort by `date` with `localeCompare`, oldest first.

5. **Health.** Work out each ad's health from its own `resultKind`. Check these rules in order:
   1. `impressions < 500` → `'unknown'`.
   2. **When `resultKind === 'clicks'`:**
      - If `ad.ctr` or `summary.ctr` is null, or `summary.ctr === 0`, the result is `'unknown'`.
      - Otherwise:
        - `ad.ctr >= 1.25 * summary.ctr` → `'good'`
        - `ad.ctr <= 0.8 * summary.ctr` → `'poor'`
        - anything else → `'average'`
   3. **For any other kind:**
      - Compute `avg = Σspend / Σresults`, using only the ads of that kind that have `results > 0`.
      - If `ad.costPerResult === null`, the result is `spend > 0 ? 'poor' : 'unknown'`.
      - Otherwise:
        - `cost <= 0.8 * avg` → `'good'`
        - `cost >= 1.25 * avg` → `'poor'`
        - anything else → `'average'`

**Step 3, gate:** run the three gate commands. There must be 0 failures.

---

## Phase 3: Freshness (`decideSync`)

### Step 1, RED: `tests/meta-ads/freshness.test.ts`

Use `const NOW = new Date('2026-11-24T12:00:00.000Z')` and pass `DEFAULT_SYNC_CONFIG`. `h(n)` and `m(n)` stand for a `Date` that is `n` hours or `n` minutes before `NOW`.

| Case | State | Expected |
|---|---|---|
| no cache, auto | `{ manual:false, fetchedAt:null, lastManualSyncAt:null }` | `{ action:'sync' }` |
| fetched 1 h ago, auto | `fetchedAt: h(1)` | `{ action:'skip', reason:'fresh' }` |
| fetched 4 h 59 m ago, auto | `fetchedAt: m(299)` | `skip`, reason `fresh` |
| fetched exactly 5 h ago, auto | `fetchedAt: h(5)` | `sync` |
| fetched 6 h ago, auto | `fetchedAt: h(6)` | `sync` |
| manual, never refreshed | `{ manual:true, fetchedAt: m(1), lastManualSyncAt:null }` | `sync`, because manual ignores freshness |
| manual, last manual 10 min ago | `lastManualSyncAt: m(10)` | `{ action:'skip', reason:'cooldown', retryAt:'2026-11-24T12:20:00.000Z' }` |
| manual, last manual exactly 30 min ago | `lastManualSyncAt: m(30)` | `sync` |
| auto, last manual 1 min ago, cache stale | `{ manual:false, fetchedAt: h(6), lastManualSyncAt: m(1) }` | `sync`, because the cooldown applies only to manual |

Run it and confirm RED.

### Step 2, GREEN: `src/features/meta-ads/freshness.ts`

```ts
export interface SyncConfig { staleMs: number; cooldownMs: number }
export const DEFAULT_SYNC_CONFIG: SyncConfig = { staleMs: 5 * 3600_000, cooldownMs: 30 * 60_000 }
export interface SyncState { manual: boolean; fetchedAt: Date | null; lastManualSyncAt: Date | null }
export type SyncDecision = { action: 'sync' } | { action: 'skip'; reason: 'fresh' | 'cooldown'; retryAt?: string }
export function decideSync(state: SyncState, now: Date, config: SyncConfig = DEFAULT_SYNC_CONFIG): SyncDecision
```

The rules, exactly:
1. **Manual:**
   - If `state.lastManualSyncAt` is set and `now - lastManualSyncAt < cooldownMs`, return `{ action:'skip', reason:'cooldown', retryAt: new Date(lastManualSyncAt.getTime() + cooldownMs).toISOString() }`.
   - Otherwise return `{ action:'sync' }`.
2. **Not manual:**
   - If `state.fetchedAt` is set and `now - fetchedAt < staleMs`, return `{ action:'skip', reason:'fresh' }`.
   - Otherwise return `{ action:'sync' }`.

All comparisons use `getTime()` milliseconds, which are absolute instants that do not depend on any timezone.

**Step 3, gate:** run the three gate commands. There must be 0 failures.

---

## Phase 4: Database migration and RPCs

**Files to read first:**
- `supabase/migrations/20261121120000_facebook_connection_rpcs.sql`
- `supabase/migrations/20261122120000_orchestrator_first.sql`, for the table and grant pattern
- `scripts/facebook-connection-db-check.sql`
- `scripts/local-migration-check.mjs`, the list of checks around line 17

**Timezone rule.** This schema stores only `timestamptz` values written with `now()`. Those are absolute instants, and JS compares them with `getTime()`. **Do not use `current_date`, `date_trunc` or `::date` anywhere in this migration or its check script.** If a day or month value is ever needed later, it must be written as `(now() AT TIME ZONE 'UTC')::date` so it matches the JS `toISOString()` UTC day.

### Step 1, RED: `scripts/meta-ads-db-check.sql`

Copy the structure of `scripts/facebook-connection-db-check.sql`:
- start with `\set ON_ERROR_STOP on` and `BEGIN;`
- insert the test user and workspace with uuid `e8888888-8888-4888-8888-888888888888` into `auth.users` and `workspaces`
- end with `ROLLBACK;`

Every check below must `RAISE EXCEPTION` with a clear message when it fails.

**As role `authenticated`,** with `request.jwt.claim.sub` set to the uuid and `request.jwt.claim.role = 'authenticated'`, use `BEGIN … EXCEPTION WHEN insufficient_privilege THEN NULL; END` blocks, exactly like the facebook check:
- calling `upsert_meta_ads_connection`, `select_meta_ads_account`, `save_meta_ads_report` or `disconnect_meta_ads_connection` raises `insufficient_privilege`
- `INSERT INTO meta_ads_connections(workspace_id) VALUES(auth.uid())` raises `insufficient_privilege`
- `INSERT INTO meta_ads_reports(...)` raises `insufficient_privilege`
- `has_column_privilege('authenticated','meta_ads_connections','connection_ref','SELECT')` is `false`
- `has_column_privilege('authenticated','meta_ads_connections','status','SELECT')` is `true`

**As role `service_role`,** with `w` set to the uuid, check these in order:
1. After `PERFORM upsert_meta_ads_connection(w, 'ca_1')`, the row has status `'pending_account'`, `connection_ref = 'ca_1'`, and `ad_account_id IS NULL`.
2. After `PERFORM select_meta_ads_account(w, 'act_1', 'Acc', 'EGP', 'Africa/Cairo')`, the status is `'connected'`, the currency is `'EGP'`, and `timezone_name` is `'Africa/Cairo'`.
3. Each of these raises an exception whose `SQLERRM` contains `INVALID_AD_ACCOUNT`, caught with `WHEN OTHERS` and checked:
   - `select_meta_ads_account(w, 'bad', 'x', 'EGP', 'Africa/Cairo')`
   - `select_meta_ads_account(w, 'act_1', 'x', 'eg', 'Africa/Cairo')`
   - `select_meta_ads_account(w, 'act_1', 'x', 'EGP', '')`
4. `PERFORM save_meta_ads_report(w, 'last_7d', 'act_1', '{"schemaVersion":1,"n":1}'::jsonb, NULL, false)` does three things:
   - a `meta_ads_reports` row exists with `report->>'n' = '1'`
   - the connection has `last_sync_error IS NULL`
   - `last_manual_sync_at IS NULL`
5. `PERFORM save_meta_ads_report(w, 'last_7d', 'act_1', '{"schemaVersion":1,"n":2}'::jsonb, NULL, true)` updates the report so `n = 2`, and the connection's `last_manual_sync_at IS NOT NULL`.
6. **Error case (failed manual refresh):** first save `t0 := last_manual_sync_at` (set by case 5). Then `PERFORM save_meta_ads_report(w, 'last_7d', 'act_1', NULL, 'auth_expired', true)`. Check that:
   - the report is still `n = 2`
   - `last_sync_error = 'auth_expired'`
   - `last_manual_sync_at = t0` is **unchanged**, because a failed manual sync must not start the 30 min cooldown
7. **Stale account guard:** `PERFORM save_meta_ads_report(w, 'last_7d', 'act_OTHER', '{"schemaVersion":1,"n":3}'::jsonb, NULL, false)` must change nothing:
   - the report is still `n = 2`
   - `last_sync_error` is still `'auth_expired'`
8. A new successful save, `save_meta_ads_report(w, 'last_7d', 'act_1', '{"schemaVersion":1,"n":4}'::jsonb, NULL, false)`, clears `last_sync_error` to NULL.
9. **Account switch:** `PERFORM select_meta_ads_account(w, 'act_2', 'Other', 'USD', 'UTC')` deletes every `meta_ads_reports` row for `w`.
10. **Disconnect:** `PERFORM disconnect_meta_ads_connection(w)` sets the status to `'disconnected'`, sets `ad_account_id IS NULL`, and leaves no report rows. After that:
    - `save_meta_ads_report(w, 'last_7d', 'act_2', '{"schemaVersion":1}'::jsonb, NULL, false)` inserts nothing
    - `select_meta_ads_account(w, 'act_2', 'x', 'USD', 'UTC')` raises an exception containing `NOT_CONNECTED`
11. **Reconnect:** `PERFORM upsert_meta_ads_connection(w, 'ca_2')` sets the status back to `'pending_account'` and `connection_ref` to `'ca_2'`.

**As `authenticated` with `sub = w`:** `SELECT status FROM meta_ads_connections` returns 1 row. `SELECT count(*) FROM meta_ads_connections WHERE workspace_id <> auth.uid()` returns 0.

Add `'meta-ads-db-check.sql'` to the checks list in `scripts/local-migration-check.mjs`, right after the `'facebook-connection-db-check.sql'` entry.

Confirm RED:
```powershell
node scripts/db-check.cjs scripts/meta-ads-db-check.sql
```
It must FAIL because the tables do not exist yet. This needs `LOCAL_PG_URL`. If it is not set, **stop and ask the human** to run the command and report back.

### Step 2, GREEN: `supabase/migrations/20261125120000_meta_ads_reporting.sql`

```sql
-- Meta Ads reporting (read-only). One ad account per workspace via the Composio 'metaads' toolkit.
-- Only timestamptz values written with now(); no day/month arithmetic (see plan: timezone rule).
CREATE TABLE meta_ads_connections (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_ref text,
  status text NOT NULL DEFAULT 'pending_account' CHECK (status IN ('pending_account','connected','disconnected')),
  ad_account_id text CHECK (ad_account_id IS NULL OR ad_account_id ~ '^act_[0-9]{1,30}$'),
  ad_account_name text,
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  timezone_name text CHECK (timezone_name IS NULL OR length(timezone_name) BETWEEN 1 AND 64),
  last_manual_sync_at timestamptz,
  last_sync_error text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE meta_ads_reports (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date_preset text NOT NULL CHECK (date_preset IN ('last_7d','last_30d')),
  ad_account_id text NOT NULL,
  report jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, date_preset)
);
ALTER TABLE meta_ads_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read" ON meta_ads_connections FOR SELECT TO authenticated USING (workspace_id = auth.uid());
CREATE POLICY "owner read" ON meta_ads_reports FOR SELECT TO authenticated USING (workspace_id = auth.uid());
REVOKE ALL ON meta_ads_connections, meta_ads_reports FROM PUBLIC, anon, authenticated;
-- connection_ref is never readable by the browser: column-level grant that omits it.
GRANT SELECT (workspace_id, status, ad_account_id, ad_account_name, currency, timezone_name, last_manual_sync_at, last_sync_error, connected_at, updated_at) ON meta_ads_connections TO authenticated;
GRANT SELECT ON meta_ads_reports TO authenticated;
GRANT ALL ON meta_ads_connections, meta_ads_reports TO service_role;
```

Then add four RPCs. Each one is `LANGUAGE plpgsql SECURITY DEFINER SET search_path=public`. At the end of the file, revoke and grant them exactly as `20261121120000_facebook_connection_rpcs.sql:47-48` does:
- `REVOKE ALL ON FUNCTION <all four signatures> FROM PUBLIC, anon, authenticated;`
- `GRANT EXECUTE ON FUNCTION <all four signatures> TO service_role;`

1. **`upsert_meta_ads_connection(p_workspace_id uuid, p_connection_ref text) RETURNS void`**
   - Raise `'INVALID_CONNECTION'` when `p_workspace_id IS NULL OR coalesce(p_connection_ref,'') = ''`.
   - `INSERT INTO meta_ads_connections(workspace_id, connection_ref, status) VALUES (p_workspace_id, p_connection_ref, 'pending_account') ON CONFLICT (workspace_id) DO UPDATE SET` the following:
     - `connection_ref = EXCLUDED.connection_ref`
     - `status = 'pending_account'`
     - `ad_account_id = NULL`, `ad_account_name = NULL`, `currency = NULL`, `timezone_name = NULL`
     - `last_manual_sync_at = NULL`, `last_sync_error = NULL`
     - `connected_at = now()`, `updated_at = now()`
   - Then `DELETE FROM meta_ads_reports WHERE workspace_id = p_workspace_id`.

2. **`select_meta_ads_account(p_workspace_id uuid, p_ad_account_id text, p_name text, p_currency text, p_timezone text) RETURNS void`**
   - Raise `'INVALID_AD_ACCOUNT'` when any of these is true:
     - `coalesce(p_ad_account_id,'') !~ '^act_[0-9]{1,30}$'`
     - `coalesce(p_currency,'') !~ '^[A-Z]{3}$'`
     - `coalesce(length(p_timezone),0) NOT BETWEEN 1 AND 64`
   - Raise `'NOT_CONNECTED'` when there is no row with `workspace_id = p_workspace_id AND status IN ('pending_account','connected')`.
   - If the stored `ad_account_id IS DISTINCT FROM p_ad_account_id`, run `DELETE FROM meta_ads_reports WHERE workspace_id = p_workspace_id`.
   - `UPDATE meta_ads_connections SET` the following `WHERE workspace_id = p_workspace_id`:
     - `ad_account_id = p_ad_account_id`
     - `ad_account_name = coalesce(nullif(p_name,''), p_ad_account_id)`
     - `currency = p_currency`, `timezone_name = p_timezone`
     - `status = 'connected'`
     - `last_sync_error = NULL`, `updated_at = now()`

3. **`save_meta_ads_report(p_workspace_id uuid, p_date_preset text, p_ad_account_id text, p_report jsonb, p_error text, p_manual boolean) RETURNS void`**
   - If **no** row has `workspace_id = p_workspace_id AND status = 'connected' AND ad_account_id = p_ad_account_id`, then `RETURN` and do nothing. This is the stale-sync guard.
   - If `p_report IS NOT NULL`, run `INSERT INTO meta_ads_reports(workspace_id, date_preset, ad_account_id, report, fetched_at) VALUES (p_workspace_id, p_date_preset, p_ad_account_id, p_report, now()) ON CONFLICT (workspace_id, date_preset) DO UPDATE SET ad_account_id = EXCLUDED.ad_account_id, report = EXCLUDED.report, fetched_at = now()`.
   - `UPDATE meta_ads_connections SET` the following `WHERE workspace_id = p_workspace_id`:
     - `last_sync_error = p_error`
     - `last_manual_sync_at = CASE WHEN p_manual AND p_report IS NOT NULL THEN now() ELSE last_manual_sync_at END`
     - `updated_at = now()`
   - Because `p_error` is NULL on success, a successful save clears the error.
   - A failed sync (`p_report IS NULL`) leaves the old report untouched and does **not** move `last_manual_sync_at`, so a failed Refresh or Retry can be tried again right away.

4. **`disconnect_meta_ads_connection(p_workspace_id uuid) RETURNS void`**
   - `UPDATE meta_ads_connections SET` the following `WHERE workspace_id = p_workspace_id`:
     - `status = 'disconnected'`
     - `ad_account_id = NULL`, `ad_account_name = NULL`, `currency = NULL`, `timezone_name = NULL`
     - `updated_at = now()`
   - `DELETE FROM meta_ads_reports WHERE workspace_id = p_workspace_id`

**Step 3, gate.** This first check must print `PASS: scripts/meta-ads-db-check.sql`:
```powershell
node scripts/db-check.cjs scripts/meta-ads-db-check.sql
```
This second check must pass, which proves the migration applies on top of all existing migrations:
```powershell
npm run test:db:local
```
Both need `LOCAL_PG_URL`. If the executor cannot run them, the **human must run both and confirm PASS before Phase 5 starts**.

---

## Phase 5: Provider layer (Composio + fake)

**Files to read first:**
- `src/server/publishing/composio-provider.ts`
- `src/server/publishing/provider.ts`
- `src/server/publishing/fake-provider.ts`
- `docs/research/metaads-tools.md`
- `src/features/meta-ads/{contracts,tools}.ts`

### Step 1, RED

**`tests/meta-ads/composio-parse.test.ts`**

`unwrapRows`:
- `unwrapRows({ data: [{ a: 1 }], paging: {} })` deep-equals `[{ a: 1 }]`.
- `unwrapRows({ response_data: { data: [{ a: 1 }] } })` deep-equals `[{ a: 1 }]`.
- `unwrapRows({ data: { data: [{ a: 1 }] } })` deep-equals `[{ a: 1 }]`.
- `unwrapRows(undefined)` and `unwrapRows({ data: 'x' })` both deep-equal `[]`.

`nextCursor`:
- `nextCursor({ paging: { next: 'u', cursors: { after: 'c1' } } })` returns `'c1'`.
- `nextCursor({ response_data: { paging: { next: 'u', cursors: { after: 'c2' } } } })` returns `'c2'`.
- `nextCursor({ paging: { cursors: { after: 'c1' } } })` returns `undefined`, because `next` is missing.

`parseAdAccounts`:
- Input `[{ id:'act_1', name:'A', currency:'EGP', timezone_name:'Africa/Cairo', account_status:1 }, { id:'123', currency:'USD', timezone_name:'UTC', account_status:2 }, { name:'no id', currency:'EGP', timezone_name:'UTC' }, { id:'act_9', currency:'egp', timezone_name:'UTC' }]` deep-equals:
  ```ts
  [{ id:'act_1', name:'A', currency:'EGP', timezoneName:'Africa/Cairo', active:true }, { id:'act_123', name:'act_123', currency:'USD', timezoneName:'UTC', active:false }]
  ```

`metaErrorCode`:
- `'Error validating access token: Session has expired'` returns `'auth_expired'`.
- `'(#200) Requires ads_read permission'` returns `'permission_denied'`.
- `'(#100) Invalid parameter'` returns `'invalid_request'`.
- `'boom'` returns `'provider_error'`.

`insightsArguments(query, after)` uses the verified argument names from `docs/research/metaads-tools.md`. `fields` is always sent as **one comma-separated `string`**. Both tools' schemas accept `string | string[]`, and the string form is the one we pick.
- `insightsArguments({ adAccountId:'act_1', level:'ad', datePreset:'last_7d', daily:false, fields:['spend','ad_id'] }, undefined)` deep-equals `{ object_id:'act_1', level:'ad', date_preset:'last_7d', fields:'spend,ad_id', limit:100 }`.
- With `daily: true`, the object also has `time_increment: 1` (a number, not the string `'1'`).
- With `after = 'c1'`, the object also has `after: 'c1'`.
- `typeof result.fields === 'string'` in every case.

`listAccountsArguments()` takes **no arguments**, because `METAADS_GET_AD_ACCOUNTS` has no paging cursor. It deep-equals `{ fields: 'id,name,currency,timezone_name,account_status', limit: 100 }`. Also assert `listAccountsArguments.length === 0`, so nobody adds a cursor parameter later.

**`tests/meta-ads/fake-provider.test.ts`** imports `../../src/server/meta-ads/fake-provider.ts`. The loader stubs `server-only`, so this import works.
- `await fakeMetaAdsProvider.listAdAccounts('w1', 'fake:w1')` returns `ok: true` with 2 accounts, both with `active: true`. The ids are `'act_1001'` and `'act_1002'`.
- `getInsights` with `{ level:'account', daily:false }`, `{ level:'account', daily:true }` and `{ level:'ad', daily:false }` returns `ok: true` each time. Feeding the three results into `normalizeReport` produces:
  - `ads.length >= 3`
  - at least one ad with `videoCurve.length === 22`
  - `summary.reach > 0`
- `verifyConnection('w1', 'fake:w1')` is `true`. `verifyConnection('w1', 'fake:w2')` is `false`.

Confirm RED.

### Step 2, GREEN

1. **`src/features/meta-ads/composio-parse.ts`** (pure). Implement `unwrapRows`, `nextCursor`, `parseAdAccounts`, `metaErrorCode`, `insightsArguments` and `listAccountsArguments` exactly as the tests describe.
   - `unwrapRows`:
     - Start with `const body = ((data as Record<string, unknown> | undefined)?.response_data ?? data) as Record<string, unknown> | undefined`.
     - If `Array.isArray(body?.data)`, return it.
     - Else, if `Array.isArray((body?.data as Record<string, unknown> | undefined)?.data)`, return that.
     - Otherwise return `[]`.
   - `parseAdAccounts`:
     - The id becomes `act_<digits>`. A purely numeric id gets the `act_` prefix added.
     - Drop the row unless the id matches `^act_[0-9]{1,30}$`, `currency` matches `^[A-Z]{3}$`, and `timezone_name` is a non-empty string.
     - `name` defaults to the id.
     - `active` is `account_status === 1`, comparing after `num()`.
   - `metaErrorCode`: copy the three regexes from `src/server/publishing/composio-provider.ts:64-69`.
   - `insightsArguments(query: InsightsQuery, after?: string): Record<string, unknown>`:
     - Build `{ object_id: query.adAccountId, level: query.level, date_preset: query.datePreset, fields: query.fields.join(','), limit: 100 }`.
     - Add `time_increment: 1` when `query.daily` is true.
     - Add `after` when it is given.
     - Do not send `action_attribution_windows`. The tool default `[7d_click]` is used on purpose (see `metaads-tools.md`, note 3).
   - `listAccountsArguments(): Record<string, unknown>` returns `{ fields: 'id,name,currency,timezone_name,account_status', limit: 100 }`. It has no parameters.

2. **`src/server/meta-ads/provider.ts`**
   ```ts
   import 'server-only'
   import type { MetaAdsTransport } from '../../features/meta-ads/contracts'
   import { composioMetaAdsProvider } from './composio-provider'
   import { fakeMetaAdsProvider } from './fake-provider'
   export interface MetaAdsProvider extends MetaAdsTransport {
     readonly name: string
     startConnection(workspaceId: string, callbackUrl: string): Promise<{ redirectUrl: string }>
     completeConnection(workspaceId: string, callbackParams: URLSearchParams): Promise<{ ok: true; connectionRef: string } | { ok: false; reason: 'denied' | 'invalid' }>
     verifyConnection(workspaceId: string, connectionRef: string): Promise<boolean>
     disconnect(workspaceId: string, connectionRef: string): Promise<void>
   }
   /** null when META_ADS_PROVIDER is 'disabled', unknown, missing env vars, or 'fake' in production. */
   export function getMetaAdsProvider(): MetaAdsProvider | null
   export function isMetaAdsEnabled(): boolean { return getMetaAdsProvider() !== null }
   ```
   `getMetaAdsProvider` copies `getPublishingProvider` (`src/server/publishing/provider.ts:36-51`) line for line, with these substitutions:
   - env var `META_ADS_PROVIDER`
   - composio requires `COMPOSIO_API_KEY && COMPOSIO_META_ADS_AUTH_CONFIG_ID`
   - the log tag is `[meta-ads]`

3. **`src/server/meta-ads/composio-provider.ts`** exports `composioMetaAdsProvider: MetaAdsProvider` with `name: 'composio'`. Copy the structure of `src/server/publishing/composio-provider.ts`, with these differences:
   - `startConnection` uses `process.env.COMPOSIO_META_ADS_AUTH_CONFIG_ID!`.
   - `verify` uses `toolkitSlugs: ['metaads']` and `account.toolkit?.slug === 'metaads'`.
   - Add a private `run(slug, workspaceId, connectionRef, args)`:
     - It calls `assertAllowedTool(slug)` **first**.
     - Then it calls `composio().tools.execute(slug, { userId: workspaceId, connectedAccountId: connectionRef, version: META_ADS_TOOLKIT_VERSION, arguments: args })`.
     - It races the call against a 20 s timeout and returns `{ ok: true, data } | { ok: false, code }`.
     - Error mapping:
       - `!result.successful` → `metaErrorCode(String(result.error ?? ''))`
       - a thrown error with HTTP 401 or 403 → `'auth_expired'`
       - any other thrown error or a timeout → `'provider_error'`
   - `listAdAccounts`:
     - Make **one call**: `run(META_ADS_TOOLS.listAdAccounts, workspaceId, connectionRef, listAccountsArguments())`.
     - Do **not** paginate. The tool has no cursor argument and returns a single page of up to 100 accounts.
     - Return `{ ok: true, value: parseAdAccounts(unwrapRows(data)) }`.
   - `getInsights`:
     - Call `run(META_ADS_TOOLS.insights, …, insightsArguments(query, after))`.
     - Paginate with `nextCursor`, up to **3 pages**, and concatenate `unwrapRows(data)`.
   - Neither method ever throws. Wrap each body in try/catch and return `{ ok: false, code: 'provider_error' }` from the catch.
   - `disconnect` is the same as the publishing one: `connectedAccounts.delete`, ignoring a 404.

4. **`src/server/meta-ads/fake-provider.ts`** exports `fakeMetaAdsProvider: MetaAdsProvider` with `name: 'fake'`. Keep it minimal: **one fixed dataset and no env options.**
   - The unit test loads this file, so use **relative imports only**: `import 'server-only'`, `import type { MetaAdsProvider } from './provider'`, and `'../../features/meta-ads/...'`.
   - It must **not** import `composio-provider.ts` or `@composio/core`. A type-only import of `./provider` is erased at runtime, so it is fine.
   - `startConnection(workspaceId, callbackUrl)` returns `{ redirectUrl: callbackUrl + (callbackUrl.includes('?') ? '&' : '?') + 'status=success&connected_account_id=fake_' + workspaceId.replace(/-/g, '').slice(0, 20) }`.
   - `completeConnection`:
     - returns `denied` when `status !== 'success'`
     - returns `{ ok: true, connectionRef: 'fake:' + workspaceId }` when `connected_account_id === 'fake_' + <the same transform>`
     - otherwise returns `invalid`
   - `verifyConnection(w, ref)` returns `ref === 'fake:' + w`.
   - `listAdAccounts` returns `{ ok: true, value: [{ id:'act_1001', name:'Demo Shop', currency:'EGP', timezoneName:'Africa/Cairo', active:true }, { id:'act_1002', name:'Demo Clinic', currency:'EGP', timezoneName:'Africa/Cairo', active:true }] }`.
   - `getInsights` returns rows with the same shapes and values as `tests/meta-ads/support/fixtures.ts`:
     - the period row for `level:'account', daily:false`
     - the daily rows for `level:'account', daily:true`
     - the ad rows for `level:'ad'`

     **Copy the literals into this file.** Never import from `tests/`.
   - `disconnect` does nothing.

5. **`.env.example`**: append below the publishing block:
   ```
   META_ADS_PROVIDER=disabled            # composio | fake | disabled  (fake is refused in production)
   COMPOSIO_META_ADS_AUTH_CONFIG_ID=     # ac_... Composio-managed Meta Ads (metaads) auth config
   ```

**Step 3, gate:** run the three gate commands. There must be 0 failures.

---

## Phase 6: Sync orchestration, store, and sync API

**Files to read first:**
- `src/server/supabase-admin.ts`
- `src/server/auth.ts`
- `src/app/api/connections/facebook/disconnect/route.ts`, for the route pattern
- `src/server/publishing/save-connection.ts`

### Step 1, RED: `tests/meta-ads/sync.test.ts`

**`tests/meta-ads/support/fakes.ts`** exports `fakeTransport(options: { failOn?: { level: 'account' | 'ad'; daily: boolean; code: MetaAdsErrorCode }; rejectVideoFields?: boolean } = {})`. It returns `{ transport, calls }`, where:
- `calls` is an array of the `InsightsQuery` objects received, in order
- `transport` implements **only** `listAdAccounts` and `getInsights`, and is wrapped in a `Proxy` whose `get` trap throws `new Error('unexpected property ' + String(key))` for any other key, except `then` (return `undefined` for `then`)
- `getInsights` checks, in this order:
  1. `failOn` matches the query's `(level, daily)`: return `{ ok: false, code }`
  2. `rejectVideoFields` is true and `query.fields` includes `'video_play_curve_actions'` or `'video_thruplay_watched_actions'`: return `{ ok: false, code: 'invalid_request' }`
  3. otherwise return the fixture rows by `(level, daily)`. For `level: 'ad'`, when `query.fields` does **not** include the two video fields, return `AD_ROWS` with the keys `video_play_curve_actions` and `video_thruplay_watched_actions` deleted from every row. Copy the rows; do not mutate the fixture.

Test `runSync({ transport, workspaceId: 'w1', connectionRef: 'ca_1', account: ACCOUNT, datePreset: 'last_7d', now: () => new Date('2026-11-24T10:00:00.000Z') })`:
- **Happy path.** The result is `{ ok: true, report }`, and:
  - `calls.length === 3`
  - `calls.map(c => [c.level, c.daily])` deep-equals `[['account', false], ['account', true], ['ad', false]]`
  - every call has `adAccountId === 'act_111'` and `datePreset === 'last_7d'`
- **Fields.**
  - `calls[0].fields` deep-equals `PERIOD_FIELDS`, which is `['spend','impressions','reach','frequency','clicks','ctr','cpc','cpm','actions']`.
  - `calls[1].fields` deep-equals `DAILY_FIELDS`, which is `['date_start','spend','impressions','clicks','actions']`. It contains neither `reach` nor `frequency`.
  - `AD_BASE_FIELDS` deep-equals `['ad_id','ad_name','campaign_name','objective','spend','impressions','clicks','ctr','actions']`.
  - `VIDEO_FIELDS` deep-equals `['video_thruplay_watched_actions','video_play_curve_actions']`.
  - `AD_FIELDS` deep-equals `[...AD_BASE_FIELDS, ...VIDEO_FIELDS]`.
  - `calls[2].fields` deep-equals `AD_FIELDS`.
- **Report values.** `report.generatedAt === '2026-11-24T10:00:00.000Z'`, `report.summary.results === 38` and `report.ads.length === 4`. `report.ads[0].videoCurve.length === 22`.
- **Period failure.** With `failOn: { level:'account', daily:false, code:'auth_expired' }`, the result is `{ ok: false, code: 'auth_expired' }` and `calls.length === 1`, so no further queries are made.
- **Ad failure, no retry.** With `failOn: { level:'ad', daily:false, code:'provider_error' }`, the result is `{ ok: false, code: 'provider_error' }` and `calls.length === 3`. Only `invalid_request` triggers the fallback.
- **Video fields rejected, so fall back.** With `rejectVideoFields: true`:
  - the result is `{ ok: true, report }`
  - `calls.length === 4`
  - `calls[2].fields` deep-equals `AD_FIELDS` and `calls[3].fields` deep-equals `AD_BASE_FIELDS`
  - `calls[3].level === 'ad'` and `calls[3].daily === false`
  - `report.ads.length === 4` and `report.summary.results === 38`
  - every ad has `videoCurve === null` and `holdRate === null`
  - ad `'1'` still has `hookRate === 0.25`, because `video_view` comes from `actions`, which is a base field
- **Ad failure on both tries.** With `failOn: { level:'ad', daily:false, code:'invalid_request' }`, the result is `{ ok: false, code: 'invalid_request' }`, `calls.length === 4`, and `calls[3].fields` deep-equals `AD_BASE_FIELDS`. The fallback happens exactly once.
- **Read-only.** None of these tests throws `unexpected property`. This proves `runSync` touches only `getInsights`.

Confirm RED.

### Step 2, GREEN

0. **`src/server/meta-ads/connection-http.ts`**: copy `src/server/publishing/connection-http.ts`, then change it:
   - `META_CONNECT_COOKIE = 'meta_ads_connect'`
   - `COOKIE_PATH = '/api/connections/meta-ads'`
   - keep `setFlowCookie`, `clearFlowCookie` and `failure` unchanged
   - `notConfigured = () => failure(503, 'meta_ads_not_configured', 'metaAdsNotConfigured')`
   - Add **no** pending cookie. The pending state is the DB status `pending_account`.

1. **`src/features/meta-ads/sync.ts`**
   - Export `PERIOD_FIELDS`, `DAILY_FIELDS`, `AD_BASE_FIELDS`, `VIDEO_FIELDS` and `AD_FIELDS` with exactly the lists above. Write `AD_FIELDS` as `[...AD_BASE_FIELDS, ...VIDEO_FIELDS]`.
   - Export:
     ```ts
     runSync(deps: { transport: MetaAdsTransport; workspaceId: string; connectionRef: string; account: AdAccount; datePreset: DatePreset; now: () => Date }): Promise<{ ok: true; report: AdsReport } | { ok: false; code: MetaAdsErrorCode }>
     ```
   - Run the `getInsights` calls **one after another**, in the order period, daily, ad. If the period or daily call fails, return that failure immediately.
   - **Video-field fallback, ad call only.** `metaads-tools.md` records that the `fields` schema is free-form, with no `enum`. Even so, Meta may reject the two video fields, and that must not fail the whole sync.
     1. Call `getInsights` with `level: 'ad'` and `fields: AD_FIELDS`.
     2. If that fails with `code === 'invalid_request'`, call it **once more** with `fields: AD_BASE_FIELDS`. All other query values stay the same.
     3. If the second call also fails, return its failure.
     4. Any other failure code from step 1 is returned immediately, with no retry.
     5. There is never more than one retry.

     Without the video fields, the ad rows have no curve or thruplay data, so `normalizeReport` sets `videoCurve` and `holdRate` to `null`. That needs no extra code.
   - Then return `{ ok: true, report: normalizeReport({ account, datePreset, generatedAt: now().toISOString(), periodRow: periodRows[0] ?? null, dailyRows, adRows }) }`.

2. **`src/server/meta-ads/store.ts`** starts with `import 'server-only'` and uses `createAdminClient()`. It exports:
   ```ts
   export interface StoredConnection { connectionRef: string | null; status: 'pending_account' | 'connected' | 'disconnected'; adAccount: AdAccount | null; lastManualSyncAt: Date | null; lastSyncError: string | null }
   export async function loadConnection(workspaceId: string): Promise<StoredConnection | null>
   export async function loadReport(workspaceId: string, preset: DatePreset): Promise<{ report: AdsReport; fetchedAt: Date } | null>
   export async function saveConnection(workspaceId: string, connectionRef: string): Promise<boolean>
   export async function selectAccount(workspaceId: string, account: AdAccount): Promise<boolean>
   export async function saveReport(workspaceId: string, preset: DatePreset, adAccountId: string, report: AdsReport | null, error: MetaAdsErrorCode | null, manual: boolean): Promise<boolean>
   export async function disconnectConnection(workspaceId: string): Promise<boolean>
   ```
   - `loadConnection`: `adAccount` is built only when `ad_account_id`, `currency` and `timezone_name` are all non-null, with `active: true`.
   - `loadReport`: return `null` unless `report.schemaVersion === 1 && Array.isArray(report.ads)`.
   - The RPC wrappers return `!error`. The RPC names and parameters are:
     - `upsert_meta_ads_connection({ p_workspace_id, p_connection_ref })`
     - `select_meta_ads_account({ p_workspace_id, p_ad_account_id, p_name, p_currency, p_timezone })`
     - `save_meta_ads_report({ p_workspace_id, p_date_preset, p_ad_account_id, p_report, p_error, p_manual })`
     - `disconnect_meta_ads_connection({ p_workspace_id })`

3. **`src/app/api/meta-ads/sync/route.ts`**, `export async function POST(request: Request)`:
   1. Identity: `userId = (await requireApiIdentity(request)).user.id`. Map errors exactly as `src/app/api/connections/facebook/disconnect/route.ts:9-15` does.
   2. `const provider = getMetaAdsProvider()`. If it is null, return `notConfigured()` from `src/server/meta-ads/connection-http.ts` (created in step 0).
   3. Body: wrap `await request.json()` in try/catch. On failure, return `failure(400, 'invalid_request', 'metaAdsInvalidRequest')`. `preset` must be one of `DATE_PRESETS`, otherwise return that same 400. Set `manual = body.manual === true`.
   4. `conn = await loadConnection(userId)`. If `conn?.status !== 'connected' || !conn.adAccount || !conn.connectionRef`, return `failure(409, 'not_connected', 'metaAdsNotConnected')`.
   5. `existing = await loadReport(userId, preset)`.
   6. `decision = decideSync({ manual, fetchedAt: existing?.fetchedAt ?? null, lastManualSyncAt: conn.lastManualSyncAt }, new Date())`. If `decision.action === 'skip'`, return `Response.json({ status: 'skipped', reason: decision.reason, retryAt: decision.retryAt ?? null })`.
   7. Wrap `runSync({ transport: provider, workspaceId: userId, connectionRef: conn.connectionRef, account: conn.adAccount, datePreset: preset, now: () => new Date() })` in try/catch:
      - **Success:** `await saveReport(userId, preset, conn.adAccount.id, result.report, null, manual)`, then return `Response.json({ status: 'synced' })`.
      - **Failure:** `await saveReport(userId, preset, conn.adAccount.id, null, result.code, manual)`, then return `Response.json({ status: 'failed', code: result.code })` with status 200. Because the report is null, the RPC does not start the manual cooldown.
      - **Unexpected throw:** `await saveReport(userId, preset, conn.adAccount.id, null, 'provider_error', manual)`, then return `failure(500, 'provider_error', 'metaAdsSyncFailed')`.

   The response **never** contains the report. The page reads the report from the database.

**Step 3, gate:** run the three gate commands. There must be 0 failures.

---

## Phase 7: Connect flow and ad-account selection routes

**Files to read first:**
- `src/app/api/connections/facebook/start/route.ts`
- `src/app/api/connections/facebook/callback/route.ts`
- `src/app/api/connections/facebook/disconnect/route.ts`
- `src/server/publishing/connection-http.ts`
- `src/server/publishing/save-connection.ts`
- `src/proxy.ts`
- `src/lib/i18n.ts`

### Step 1, RED: `tests/meta-ads/account-choice.test.ts`

Routes depend on Next request and cookie APIs, and the repo has no route unit-test pattern. So this phase unit-tests its pure helpers, and Phase 8 smoke-tests the routes with `META_ADS_PROVIDER=fake`.

`chooseAccountOutcome(accounts: AdAccount[])`:
- `[]` → `{ kind: 'none' }`.
- One inactive account only → `{ kind: 'none' }`.
- `[activeA, inactiveB]` → `{ kind: 'auto', account: activeA }`.
- `[active 'Zed', active 'Alpha']` → `{ kind: 'choose', accounts: [Alpha, Zed] }`. Only active accounts are kept, sorted by `name` with `localeCompare`.

`adsRedirectPath(cookieLocale: string | undefined, result: string)`:
- `('en', 'connected')` → `'/en/ads?meta=connected'`.
- `('ar', 'choose_account')` → `'/ar/ads?meta=choose_account'`.
- `(undefined, 'failed')` → `'/ar/ads?meta=failed'`, because `defaultLocale` is `'ar'`.
- `('fr', 'failed')` → `'/ar/ads?meta=failed'`, because an unknown locale falls back to the default.

Put both helpers in `src/features/meta-ads/account-choice.ts`. **Do NOT import from `src/lib/i18n.ts`.** That file imports `en.json`, and the Node test loader cannot load a JSON import. Instead, declare these in the helper, with a comment saying they mirror `locales` / `defaultLocale` in `src/lib/i18n.ts`:
- `const ADS_LOCALES = ['ar', 'en'] as const`
- `const ADS_DEFAULT_LOCALE = 'ar'`

Confirm RED.

### Step 2, GREEN

1. **`src/features/meta-ads/account-choice.ts`**: implement both helpers.
   - `adsRedirectPath` returns `'/' + locale + '/ads?meta=' + encodeURIComponent(result)`.
   - The locale is `cookieLocale` when it is in `ADS_LOCALES`, otherwise `ADS_DEFAULT_LOCALE`.
   - Redirecting straight to the locale path avoids a second redirect through `src/proxy.ts`. That proxy redirect would also keep the query, but the direct path is simpler.

2. **`src/server/meta-ads/connection-http.ts`** was already created in Phase 6. Do not recreate it. Open it and confirm it matches that spec.

3. **`src/app/api/connections/meta-ads/start/route.ts`** (POST): copy `facebook/start/route.ts`, with these changes:
   - use `getMetaAdsProvider()` and `notConfigured`
   - the callback URL is `origin + '/api/connections/meta-ads/callback?nonce=' + nonce`
   - the cookie is `META_CONNECT_COOKIE`

4. **`src/app/api/connections/meta-ads/callback/route.ts`** (GET): copy `facebook/callback/route.ts`, with these changes:
   - `const cookieStore = await cookies()`
   - `const toAds = (result: string) => NextResponse.redirect(new URL(adsRedirectPath(cookieStore.get(LOCALE_COOKIE)?.value, result), url.origin))`. `LOCALE_COOKIE` comes from `@/lib/i18n`.
   - Keep `sameNonce`, and keep the single-use nonce rule: clear `META_CONNECT_COOKIE` on **every** response.
   - After `completeConnection` returns `ok`:
     1. `previous = await loadConnection(userId)`
     2. If `!(await saveConnection(userId, ref))`, fail.
     3. If `previous?.connectionRef` exists and differs from `ref`, call `provider.disconnect(userId, previous.connectionRef)` inside try/catch and ignore errors.
     4. `const listed = await provider.listAdAccounts(userId, ref)`. If it is not ok, fail.
     5. Switch on `chooseAccountOutcome(listed.value)`:
        - `none`: run `await provider.disconnect(userId, ref)` in try/catch, then `await disconnectConnection(userId)`, then redirect with `toAds('no_accounts')`.
        - `auto`: if `!(await selectAccount(userId, outcome.account))`, fail. Otherwise redirect with `toAds('connected')`.
        - `choose`: redirect with `toAds('choose_account')`.
   - Any thrown error goes to the fail path, which redirects with `toAds('failed')`.

5. **`src/app/api/connections/meta-ads/accounts/route.ts`** (GET):
   1. Get identity with `requireApiIdentity`.
   2. Get the provider. Return 503 `notConfigured()` if it is null.
   3. `conn = await loadConnection(userId)`. If `!conn?.connectionRef` or the status is not `pending_account` or `connected`, return `failure(409, 'not_connected', 'metaAdsNotConnected')`.
   4. If `!(await provider.verifyConnection(userId, conn.connectionRef))`, return `failure(409, 'reconnect', 'adsReconnect')`.
   5. `listed = await provider.listAdAccounts(...)`. If it is not ok, return `failure(502, listed.code, 'metaAdsSyncFailed')`.
   6. Return `Response.json({ accounts: listed.value.filter(a => a.active).map(({ id, name, currency, timezoneName }) => ({ id, name, currency, timezoneName })) })`.

   **Never** return `connectionRef`.

6. **`src/app/api/connections/meta-ads/select/route.ts`** (POST, body `{ adAccountId }`):
   1. Validate the id against `^act_[0-9]{1,30}$`. Otherwise return 400 `failure(400, 'invalid_request', 'metaAdsInvalidRequest')`.
   2. Load the connection, verify it, and list the accounts again, exactly as in the accounts route.
   3. `account = listed.value.find(a => a.active && a.id === adAccountId)`. If there is none, return 400. **The currency and timezone always come from the server list, never from the client.**
   4. If `!(await selectAccount(userId, account))`, return `failure(500, 'select_failed', 'metaAdsSyncFailed')`.
   5. Return `Response.json({ ok: true })`.

7. **`src/app/api/connections/meta-ads/disconnect/route.ts`** (POST): copy `facebook/disconnect/route.ts`, using:
   - `loadConnection` for the `connectionRef`
   - `provider.disconnect`, with a 404 already ignored inside the provider
   - `disconnectConnection(userId)`

   The failure keys are `'metaAdsDisconnectFailed'`.

**Step 3, gate:** run the three gate commands. There must be 0 failures.

---

## Phase 8: Dashboard UI, nav, i18n, routes

**Files to read first:**
- `node_modules/next/dist/docs/`: the page, `searchParams`, `notFound` and `useRouter().refresh` docs for this version
- `src/app/[lang]/(workspace)/scheduling/page.tsx` and `scheduling/loading.tsx`
- `src/app/[lang]/(workspace)/layout.tsx`
- `src/screens/CalendarPage.tsx`
- `src/components/settings/FacebookConnectionCard.tsx`, for the fetch and error pattern
- `src/components/AppShell.tsx`, `src/shared/routes.ts` and `src/proxy.ts`
- `src/hooks/useCopy.ts` and `src/context/I18nContext.tsx`
- `src/app/[lang]/dictionaries/{ar,en}.json`
- `DESIGN.md` and `src/lib/region.ts`

### Step 1, RED: `tests/meta-ads/view-model.test.ts`

The tests target the pure module `src/features/meta-ads/view-model.ts`. Define a `ConnectedView` fixture with:
- `state: 'connected'`
- `report: null`
- `isStale: true`
- `lastError: null`

`rangeFromParam`:
- `rangeFromParam('30d')` returns `'last_30d'`.
- `rangeFromParam('7d')`, `rangeFromParam(undefined)` and `rangeFromParam('x')` each return `'last_7d'`.
- `rangeFromParam(['30d'])` returns `'last_30d'`, because an array param uses its first element.

`summarySentence(report, locale)`. Build `report` with `normalizeReport` from the fixtures.
- It returns `{ key: 'adsSummaryMessages', values: { spend: formatMoney(700, 'EGP', 'ar'), results: '38', best: 'Reel A' } }`. Here `best` is the name of the ad with the most results of the dominant kind; a tie goes to the higher spend.
- A report with `ads: []` returns `{ key: 'adsSummaryNoData', values: {} }`.

`shouldAutoSync(view)`:
- Returns `true` for `ConnectedView`.
- Returns `false` when `isStale: false`.
- Returns `false` when `lastError` is `'auth_expired'` or `'permission_denied'`.
- Returns `true` when `lastError: 'provider_error'`.
- Returns `false` for `{ state: 'not_connected' }`.

`reportStatus(input: { hasReport: boolean; sync: SyncUiState; lastError: string | null })`, where `SyncUiState = { phase: 'idle' | 'syncing' | 'error' | 'skipped'; code?: string; retryAt?: string }`. Check these cases in order:

| `hasReport` | `sync` | `lastError` | Expected |
|---|---|---|---|
| `false` | `{phase:'syncing'}` | any | `{ kind: 'loading' }` |
| `false` | `{phase:'error', code:'auth_expired'}` | any | `{ kind: 'reconnect' }` |
| `false` | `{phase:'error', code:'permission_denied'}` | any | `{ kind: 'reconnect' }` |
| `false` | `{phase:'error', code:'provider_error'}` | any | `{ kind: 'retry' }` |
| `false` | `{phase:'skipped', code:'cooldown', retryAt:'X'}` | any | `{ kind: 'cooldown', retryAt: 'X' }` |
| `false` | `{phase:'idle'}` | `'auth_expired'` | `{ kind: 'reconnect' }` |
| `false` | `{phase:'idle'}` | `null` | `{ kind: 'retry' }` |
| `true` | `{phase:'syncing'}` | `null` | `{ kind: 'report', banner: 'updating' }` |
| `true` | `{phase:'error', code:'auth_expired'}` | `null` | `{ kind: 'report', banner: 'reconnect' }` |
| `true` | `{phase:'error', code:'provider_error'}` | `null` | `{ kind: 'report', banner: 'retry' }` |
| `true` | `{phase:'skipped', code:'cooldown', retryAt:'X'}` | `null` | `{ kind: 'report', banner: 'cooldown', retryAt: 'X' }` |
| `true` | `{phase:'idle'}` | `'permission_denied'` | `{ kind: 'report', banner: 'reconnect' }` |
| `true` | `{phase:'idle'}` | `null` | `{ kind: 'report', banner: null }` |

Confirm RED.

### Step 2, GREEN

1. **Dependency:**
   ```powershell
   npm install recharts@^3
   ```
   Confirm that `package.json` gained exactly one dependency, `recharts`. Add nothing else.

2. **`src/features/meta-ads/view-model.ts`**: implement `rangeFromParam`, `summarySentence`, `shouldAutoSync`, `reportStatus` and the `SyncUiState` type.
   - **`reportStatus`:** an error code (from `sync.code` when `phase === 'error'`, otherwise from `lastError`) of `auth_expired` or `permission_denied` maps to `reconnect`. Any other error maps to `retry`.
   - **`summarySentence`:**
     - The key is chosen by `summary.resultKind`:
       - `messages` → `adsSummaryMessages`
       - `leads` → `adsSummaryLeads`
       - `purchases` → `adsSummaryPurchases`
       - `clicks` → `adsSummaryClicks`
     - `results` is `formatCount(summary.results)`.

3. **`src/server/meta-ads/view.ts`** starts with `import 'server-only'` and exports:
   ```ts
   export type AdsReportView =
     | { state: 'disabled' }
     | { state: 'not_connected' }
     | { state: 'choose_account' }
     | { state: 'connected'; account: { name: string; currency: string; timezoneName: string }; preset: DatePreset; report: AdsReport | null; fetchedAt: string | null; isStale: boolean; lastError: string | null }
   export async function loadAdsReportView(preset: DatePreset): Promise<AdsReportView>
   ```
   - Return `disabled` when `!isMetaAdsEnabled()`.
   - Get the identity from `getIdentity()`. If there is none, return `not_connected`; the proxy already protects `/ads`.
   - Use the **user client** (`createServerSupabase()`) so RLS applies. Select **explicit columns only**: `status, ad_account_name, currency, timezone_name, last_sync_error`. **Never** select `*` or `connection_ref`.
   - Map the status:
     - no row, or `disconnected` → `not_connected`
     - `pending_account` → `choose_account`
     - `connected` → load `meta_ads_reports` with `report, fetched_at` for `preset`
   - `isStale = !fetchedAt || Date.now() - new Date(fetchedAt).getTime() >= DEFAULT_SYNC_CONFIG.staleMs`
   - `report` is `null` unless `schemaVersion === 1 && Array.isArray(report.ads)`.

4. **Route registration:**
   - `src/shared/routes.ts`: add `ADS: '/ads'` under `APP`.
   - `src/proxy.ts:6`: add `ads` to the alternation, giving `/^\/(employee|brain|roadmap|scheduling|deliverables|settings|onboarding|ads)(\/|$)/`.
   - `src/app/[lang]/(workspace)/ads/page.tsx` is a server component:
     ```tsx
     export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
       const { range } = await searchParams
       const preset = rangeFromParam(range)
       const view = await loadAdsReportView(preset)
       if (view.state === 'disabled') notFound()
       return <AdsReportPage key={preset} view={view} />
     }
     ```
     **`key={preset}` is required.** Switching between `?range=7d` and `?range=30d` keeps the same route. Without the key, React keeps the component mounted and the auto-sync guard would never run for the second preset.
   - `src/app/[lang]/(workspace)/ads/loading.tsx`: copy `scheduling/loading.tsx`.

5. **Nav:**
   - `src/app/[lang]/(workspace)/layout.tsx`: call `isMetaAdsEnabled()` and pass `<AppShell adsEnabled={adsEnabled}>`.
   - `src/components/AppShell.tsx`: add the prop `adsEnabled?: boolean`, defaulting to `false`. When it is true, insert `{ to: ROUTES.APP.ADS, icon: BarChart3, label: t('navAds'), shortLabel: t('navAds') }` right after the `SCHEDULING` item. `BarChart3` comes from `lucide-react`.
   - Do not change the mobile bottom nav.

6. **`src/screens/AdsReportPage.tsx`** (`'use client'`, props `{ view: AdsReportView }`), wrapped in `<div className="workspace-page">` with a `workspace-heading` of `t('adsTitle')`.

   Shared helpers inside the component:
   - `const { t } = useCopy()`, `const locale = useLocale()`, `const router = useRouter()`
   - `const params = useSearchParams()`. `meta = params.get('meta')` drives the result messages: `no_accounts` → `adsNoAccounts`, and `failed` → `adsConnectFailed`, each shown as a `.badge`.
   - `connect()` does `POST /api/connections/meta-ads/start`, then `window.location.href = redirectUrl`. On a non-ok response it shows `t(body.messageKey)`.

   What to render for each `view.state`:
   - **`not_connected`:** `EmptyState` with title `adsConnectTitle`, body `adsConnectBody` (the reassurance copy: read-only, we never change your ads) and a `.btn-primary` labelled `adsConnect` that calls `connect()`.
   - **`choose_account`:** `<AccountChooser onDone={() => router.refresh()} />`.
     - On mount it calls `GET /api/connections/meta-ads/accounts`.
     - It lists radio cards (`.card`) showing name, currency and timezone.
     - The confirm button (`adsChooseConfirm`) calls `POST /api/connections/meta-ads/select` with `{ adAccountId }`, then `onDone()`.
     - On a 409 with `code === 'reconnect'`, it shows `adsReconnect` and a Connect button.
   - **`connected`:**
     - **Local state:** `const [sync, setSync] = useState<SyncUiState>(() => (shouldAutoSync(view) ? { phase: 'syncing' } : { phase: 'idle' }))`, plus `const started = useRef(false)`. The lazy initial value matters: on the first paint (and SSR), a page that is about to auto-sync shows `LoadingState` instead of briefly flashing the Retry card before `useEffect` runs.
     - **`runSync(manual: boolean)`:**
       1. `setSync({ phase: 'syncing' })`.
       2. `POST /api/meta-ads/sync` with `{ preset: view.preset, manual }`.
       3. Handle the response:
          - `status: 'synced'`: `setSync({ phase: 'idle' })`, then `router.refresh()`.
          - `status: 'skipped'` with `reason: 'fresh'`: `setSync({ phase: 'idle' })`.
          - `status: 'skipped'` with `reason: 'cooldown'`: `setSync({ phase: 'skipped', code: 'cooldown', retryAt })`.
          - `status: 'failed'`: `setSync({ phase: 'error', code })`.
          - A non-ok HTTP response or a thrown error: `setSync({ phase: 'error', code: 'provider_error' })`.
     - **Auto-sync:** `useEffect(() => { if (!started.current && shouldAutoSync(view)) { started.current = true; void runSync(false) } }, [])`. This runs once per mount. The `key={preset}` on the page makes it once per preset.
     - **Header row, always shown** for `connected`, above whatever the status below renders, including the loading, reconnect, retry and cooldown states:
       - `view.account.name`
       - a range toggle: two `Link`s to `?range=7d` (`adsRange7`) and `?range=30d` (`adsRange30`), with the active one styled `.btn-primary` and the other `.btn-secondary`
       - `view.fetchedAt ? t('adsLastUpdated', { time: formatWorkspaceTime(view.fetchedAt, view.account.timezoneName) }) : null`
       - a Refresh `.btn-secondary` (`adsRefresh`) that is disabled while `sync.phase === 'syncing'` and calls `runSync(true)`
       - a Disconnect text button (`adsDisconnect`) that confirms with `useDialog` (`adsDisconnectConfirm`), then calls `POST /api/connections/meta-ads/disconnect`, then `router.refresh()`

       This lets the user switch ranges or disconnect even when the first sync fails.
     - **What to show below the header:** `const status = reportStatus({ hasReport: view.report !== null, sync, lastError: view.lastError })`.
       - `status.kind === 'loading'`: `LoadingState`.
       - `'reconnect'`, `'retry'` or `'cooldown'`: `<ReportStatusCard>`, a `.card` with:
         - `reconnect`: the message `adsReconnect` and a `.btn-primary` that calls `connect()`.
         - `retry`: the message `adsSyncFailed` and a `.btn-secondary` labelled `adsRetry` that calls `runSync(true)`.
         - `cooldown`: the message `t('adsRefreshCooldown', { time: formatWorkspaceTime(retryAt, view.account.timezoneName, { dateStyle: undefined }) })`. Check the options signature of `formatWorkspaceTime` in `src/lib/region.ts` and pass only the time style.
         - **This card replaces the endless spinner. `LoadingState` is shown only while `sync.phase === 'syncing'`.**
       - `'report'`: the dashboard. When `status.banner` is set, put a `.badge` above it:
         - `updating` → `adsUpdating`
         - `reconnect` → `adsReconnect` with the Connect button
         - `retry` → `adsSyncFailed`
         - `cooldown` → `adsRefreshCooldown`
     - **Dashboard layout below the header (`status.kind === 'report'` only), from top to bottom:**
       1. **Summary sentence:** `t(s.key, s.values)` where `s = summarySentence(view.report, locale)`, shown as a `.workspace-description`.
       2. **`<KpiTiles summary currency locale />`:** six `.card` tiles: spend, results (with the label for the kind), cost per result, reach, frequency (`toFixed(2)`) and CTR. Each tile has a `title` attribute with its help text: `adsHelpCostPerResult`, `adsHelpReach`, `adsHelpFrequency` and `adsHelpCtr`. Money goes through `formatMoney`, counts through `formatCount`, and CTR through `formatPercent`.
       3. **`<DailyTrendChart daily />`:** recharts `ResponsiveContainer` (height 260) wrapping a `LineChart`:
          - `<XAxis dataKey="date" />`
          - **two Y axes**, so a small results count is not flattened by the much larger spend scale: `<YAxis yAxisId="spend" orientation="left" />` and `<YAxis yAxisId="results" orientation="right" allowDecimals={false} />`
          - `<Line yAxisId="spend" dataKey="spend" />` and `<Line yAxisId="results" dataKey="results" />`
          - wrap the whole chart in `<div dir="ltr">`
       4. **`<AdsList ads currency locale />`:** one `.card` per ad, showing:
          - a **placeholder icon** (`lucide-react` `Image` or `Megaphone`, in a gray rounded box). There are **no thumbnails and no `<img>`** in this MVP.
          - the ad name and campaign name
          - spend, results and cost per result
          - a health dot: good `bg-green-500`, average `bg-amber-500`, poor `bg-red-500`, unknown `bg-gray-400`, with the label from `adsHealth*`

          Clicking a card toggles the details: `adsHookRate` with `formatPercent(hookRate)`, `adsHoldRate` with `formatPercent(holdRate)`, and `<VideoCurveChart curve />` when `videoCurve` is not null.
       5. **`<VideoCurveChart curve />`:** a `LineChart` with `data={curve}` and:
          - `<XAxis dataKey="label" type="category" ticks={['0:00','0:05','0:10','0:15','0:20','0:25','0:30','0:40','0:50','1:00+']} />`. A category axis maps the non-linear labels one-to-one by index. All 22 points still render and can be hovered, but only these 10 labels are printed, so they do not overlap.
          - `<YAxis domain={[0, 100]} tickFormatter={(v) => v + '%'} />`
          - title `adsVideoCurve`
          - wrap it in `<div dir="ltr">`

7. **i18n.** Add these keys to **both** `ar.json` and `en.json` under `"app"`. The English values are plain translations. No visible string may be hard-coded in a component.

   | Key | Arabic |
   |---|---|
   | navAds | الإعلانات |
   | adsTitle | أداء إعلاناتك |
   | adsConnectTitle | اربط حساب إعلانات ميتا |
   | adsConnectBody | بزمورا بتقرا الأرقام بس، ومش هتغيّر أي حاجة في إعلاناتك. |
   | adsConnect | اربط الحساب |
   | adsChooseAccount | اختار الحساب الإعلاني بتاع البيزنس |
   | adsChooseConfirm | تأكيد |
   | adsNoAccounts | مالقيناش حساب إعلاني نشط على الأكونت ده |
   | adsConnectFailed | الربط ما نجحش، جرّب تاني |
   | adsLastUpdated | آخر تحديث {time} |
   | adsRefresh | تحديث |
   | adsUpdating | بنحدّث الأرقام… |
   | adsRefreshCooldown | تقدر تحدّث تاني الساعة {time} |
   | adsSyncFailed | ماقدرناش نجيب الأرقام من ميتا دلوقتي |
   | adsRetry | حاول تاني |
   | adsReconnect | الربط مع ميتا وقف، اربط الحساب تاني |
   | adsDisconnect | فصل الحساب |
   | adsDisconnectConfirm | متأكد إنك عايز تفصل حساب الإعلانات؟ |
   | adsRange7 | آخر ٧ أيام |
   | adsRange30 | آخر ٣٠ يوم |
   | adsSummaryMessages | صرفت {spend} وجالك {results} رسالة. أحسن إعلان: {best} |
   | adsSummaryLeads | صرفت {spend} وجالك {results} عميل محتمل. أحسن إعلان: {best} |
   | adsSummaryPurchases | صرفت {spend} وجالك {results} عملية شراء. أحسن إعلان: {best} |
   | adsSummaryClicks | صرفت {spend} وجالك {results} ضغطة. أحسن إعلان: {best} |
   | adsSummaryNoData | مفيش إعلانات شغالة في الفترة دي |
   | adsKpiSpend | الإنفاق |
   | adsKpiResults | النتايج |
   | adsKpiCostPerResult | تكلفة النتيجة |
   | adsKpiReach | الوصول |
   | adsKpiFrequency | التكرار |
   | adsKpiCtr | نسبة الضغط |
   | adsHelpReach | عدد الناس المختلفين اللي شافوا إعلانك |
   | adsHelpFrequency | كل شخص شاف الإعلان كام مرة في المتوسط |
   | adsHelpCtr | من كل ١٠٠ شافوا الإعلان، كام واحد ضغط عليه |
   | adsHelpCostPerResult | كل نتيجة كلفتك كام |
   | adsHealthGood | ممتاز |
   | adsHealthAverage | متوسط |
   | adsHealthPoor | ضعيف |
   | adsHealthUnknown | بيانات قليلة |
   | adsVideoCurve | الناس بتكمّل الفيديو لحد فين |
   | adsHookRate | نسبة اللي وقفوا أول ٣ ثواني |
   | adsHoldRate | نسبة اللي كمّلوا |
   | metaAdsNotConfigured | ربط الإعلانات مش متفعّل |
   | metaAdsNotConnected | حساب الإعلانات مش مربوط |
   | metaAdsInvalidRequest | الطلب ده مش صحيح |
   | metaAdsSyncFailed | ماقدرناش نجيب الأرقام من ميتا دلوقتي |
   | metaAdsDisconnectFailed | ماقدرناش نفصل الحساب، جرّب تاني |

   The `messageKey` values used by the routes are exactly these:
   - `metaAdsNotConfigured`
   - `metaAdsNotConnected`
   - `metaAdsInvalidRequest`
   - `metaAdsSyncFailed`
   - `metaAdsDisconnectFailed`
   - `adsReconnect`
   - `signInAgain`, which already exists and is used by the auth failure mapping copied from facebook

   Search the dictionaries to confirm that every one of them exists.

**Step 3, gate:**
```powershell
npm run test:meta-ads
```
```powershell
npm run typecheck
```
```powershell
npm run lint
```
```powershell
npm run build
```
All four commands must exit 0.

---

## Final handoff checklist

**Automated (all must pass):**
- [ ] `npm run test:meta-ads` passes all 11 test files in `tests/meta-ads/`.
- [ ] `npm run typecheck`, `npm run lint` and `npm run build` all exit 0.
- [ ] `node scripts/db-check.cjs scripts/meta-ads-db-check.sql` prints PASS, and `npm run test:db:local` passes. Both need `LOCAL_PG_URL`. If the executor cannot run them, the human runs them.
- [ ] `src/features/meta-ads/tools.ts` contains no `<`, `>`, `?` or `TODO`. The tools test enforces this.
- [ ] Searching `src/` for `owner-media`, `thumbnail`, `meta_ads_usage`, `META_ADS_MONTHLY_CALL_BUDGET` and `META_ADS_FAKE_ACCOUNTS` returns **no matches**.

**Manual smoke test with `META_ADS_PROVIDER=fake`** (start the dev server with the preview tool, not a shell):
- [ ] With `META_ADS_PROVIDER=disabled`, there is no "الإعلانات" nav item, and `/ar/ads` returns 404. This keeps AC-58 true.
- [ ] With `fake`, Connect lands on `/ar/ads?meta=choose_account` (or `/en/...` when the locale cookie is `en`), and the `?meta=` param is present.
- [ ] The chooser lists 2 accounts. Picking one shows the dashboard. The auto-select and no-accounts branches are covered by `account-choice.test.ts`.
- [ ] The first visit to the dashboard makes exactly one `POST /api/meta-ads/sync` (check the network panel). The spinner is visible while it runs, then the report appears.
- [ ] Reloading within 5 hours makes **no** network sync. `shouldAutoSync` is false because `isStale` is false.
- [ ] Switching to `?range=30d` for the first time triggers **one** sync for `last_30d`, then shows data. Switching back to 7d does not sync again.
- [ ] Pressing Refresh once syncs. Pressing it again within 30 minutes shows the cooldown badge with a time.
- [ ] Simulate a failed first sync by temporarily making the fake `getInsights` return `{ ok: false, code: 'provider_error' }` with a fresh preset. The page must show the Retry card and **never** an endless spinner. The header (range toggle, Refresh, Disconnect) must stay visible. Pressing Retry right away must sync again, with **no** cooldown message. Revert this change afterwards.
- [ ] The KPI tiles show reach `9,000` and frequency `2.22` from the period row, and results `38`, not the daily or per-ad sums.
- [ ] The X axis of the video curve reads `0:00 … 0:15 0:20 0:25 0:30 0:40 0:50 1:00+`.
- [ ] The Arabic UI renders right to left, while the charts render left to right and every number uses Latin digits.
- [ ] Disconnect brings back the connect state, and no report row remains.
- [ ] Searching the page HTML and all network responses for `ca_`, `fake:` and `connection_ref` finds **no matches**.

**Real Composio check** (the human does this before enabling it in production):
- [ ] Create a `metaads` auth config in the Composio dashboard and set `COMPOSIO_META_ADS_AUTH_CONFIG_ID`.
- [ ] Connect a real ad account. **Write down the scopes shown on Meta's consent screen.** If they include `ads_management`, confirm that the reassurance copy (`adsConnectBody`) is shown before the redirect, and raise the "own Meta App" decision with the team (risk §8 in `meta-ads-reporting.md`).
- [ ] Compare spend, reach and results for the same 7 days with Ads Manager.
- [ ] Watch Composio usage for a week. Direct execution is capped at 10K calls a month and shared with publishing. Each sync costs about 3 calls, or 4 when the video fallback runs.
- [ ] Check whether real ad rows come back with `video_play_curve_actions` or whether the video fallback ran. If it ran, the logs will show 4 insights calls per sync. Update the video-fields row in `metaads-tools.md` to **VERIFIED** with what you found.
- [ ] Get the team's decision on `prd.md` Phase 5 / AC-58 before setting `META_ADS_PROVIDER=composio` in production.

**Out of scope (do not build):** chat tools, thumbnails or image storage, cron, alerts, email reports, history comparisons, multiple ad accounts, quota tables, sync locks, and any write action on Meta.
