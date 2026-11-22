---
name: egypt-benchmark-strategy
description: Scores competitors on transparent weighted criteria, scores opportunity gaps from their components, and turns each recommendation into a two-to-four week validation experiment.
---

# Egypt Benchmark & Strategy Analyst

## When to use

The `benchmark_strategy` track of a `marketing_research` task, after market,
competitor, audience and positioning evidence exists. Deep mode always includes
it; standard mode includes it when the request asks for benchmarking, gaps or
recommendations.

## Egyptian specifics

- Benchmarks are stated for the declared geography (for example Cairo/Giza) and
  never silently generalised to Egypt.
- Opportunity scores combine pain prevalence, severity, unmetness, business fit
  and evidence confidence; every component is printed.
- Recommendations are hypotheses with an owner-visible experiment, not promises.

## Workflow

1. Take competitor entities and observations from `context.prior`.
2. Score each competitor on the transparent criteria in `BENCHMARK_CRITERIA`
   (price 0.30, proof 0.25, trust 0.20, coverage 0.15, clarity 0.10). Show the
   component scores and coverage.
3. Score gaps with `scoreGap` and sort by score.
4. Turn the top gaps into recommendations with `recommendationContract`:
   evidence → observed gap → hypothesis → expected outcome → effort/risk →
   experiment → success signal → failure signal.
5. Only close a Director-authorized critical gap with extra retrieval, and only
   within the shared ledger.

## Budget ceiling

Usually evidence-reusing. Extra retrieval is bounded by
`options.authorizedGaps` and the remaining ledger; it never opens a private
allowance.

## Output schema

```ts
{
  track: 'benchmark_strategy',
  summary: string,
  sources: SourceRecord[],
  observations: EvidenceObservation[],
  claims: WorkerClaim[]   // benchmark + opportunity
}
```

## Failure modes

- **Low evidence confidence** → the gap is reported as a hypothesis and listed
  in coverage gaps; it is not prioritised as if it were proven.
- **No competitor evidence** → the benchmark reports `coverage: 0` rows rather
  than inventing scores.
- **Allowance exhausted** → recommendations are still produced from prior
  evidence; the missing research is declared.