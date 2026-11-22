---
name: egypt-market-demand-scout
description: Discovers and frames an Egyptian market, category and demand signals in Arabic, Egyptian Arabic, Arabizi, English and common misspellings; resolves competitor entities; stops on diminishing returns.
---

# Egypt Market & Demand Scout

## When to use

Use this skill for any `market_demand` track in a `marketing_research` task. The
Research Director activates it when a brief needs the market frame, demand signals,
category substitutes or a competitor entity list.

## Egyptian specifics

- Query in the language the owner used, and cover MSA (`إصلاح السيراميك`),
  Egyptian (`تصليح سيراميك`), Arabizi (`tsle7 sramic`) and common misspellings
  (`seramic`, `sramic`, `kint sugi`) from `references/lexicon.ts`.
- Treat code-switched queries (`تصليح سيراميك في القاهرة`) as first-class.
- Geography is never "all Egypt" from Greater Cairo data. Record the governorate
  with every source and surface `checkGeographyGeneralization` failures.
- Discovery results are never evidence. Open the page with Firecrawl before any
  claim uses it.

## Workflow

1. Build a `ResearchBrief` from the task request (mode: quick/standard/deep).
2. For each round (max `stopRules.maxQueryRounds`):
   - `router.search('keyword', query)` with the Egyptian query pack.
   - Escalate to Exa only when candidates fall below the threshold.
   - `router.open(url)` for up to `budget.pages / rounds` candidates, skipping
     anything already in the shared `ContentCache`.
3. Resolve every discovered brand/website with `resolveEntity`; store in the
   shared `EntityRegistry`.
4. Classify competitors with weighted reasons (category, geography, channel,
   public price) and keep the evidence string for each reason.
5. Collect demand signals (Ramadan, Eid, school calendar, summer) as observations.
6. Stop when the entity target is reached, new entities are below 5% for two
   rounds, or the shared ledger is exhausted.

## Budget ceiling

`quick`: 10 calls / 6 pages · `standard`: 24 calls / 18 pages ·
`deep`: 48 calls / 40 pages. The track receives its weighted share of the run
budget; it never opens a private allowance and never purchases credits.

## Output schema

```ts
{
  track: 'market_demand',
  summary: string,
  entities: ResolvedEntity[],
  observations: EvidenceObservation[],
  sources: SourceRecord[],
  usage: UsageRecord,
  coverageGaps: string[],
  claims: WorkerClaim[]   // market_frame + method
}
```

## Failure modes

- **Allowance exhausted** → throw `InsufficientAllowanceError`; the Director
  reduces scope and records a partial result.
- **Page blocked** → store `availability: 'blocked'` with the reason; never
  fabricate content.
- **No entities resolved** → emit a coverage gap ("no evidence found"), not a
  negative fact.
- **Provider not configured** → record a tool event with `failureReason` and
  continue with the remaining tracks.