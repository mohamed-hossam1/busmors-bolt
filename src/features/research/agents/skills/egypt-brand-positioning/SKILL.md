---
name: egypt-brand-positioning
description: Frames the category and real alternatives, derives perceptual axes from audience language, and proposes positioning hypotheses with stress tests; declares white space only when all four evidence conditions hold.
---

# Egypt Brand & Positioning Intelligence

## When to use

The `brand_positioning` track of a `marketing_research` task. It depends on the
competitor and audience tracks and consumes their artifacts through
`context.prior`.

## Egyptian specifics

- Positioning language must survive translation: Egyptian Arabic claims carry an
  Arabic statement and an English equivalent.
- Trust (`ثقة`), proof (`ضمان`) and delivery speed (`سريع`, `نفس اليوم`) are the
  axes Egyptian buyers actually mention; they are derived from captured quotes,
  not from a fixed price/quality grid.
- "White space" is never declared from one attractive signal.

## Workflow

1. Build the category frame from the brief and the competitor artifacts:
   category, subcategories, substitutes and the "do nothing" option.
2. Describe the current position from evidence (`known for`, `leader`,
   `الأشهر`) and the desired position from the business profile.
3. Separate parity points (must be present) from difference points (proof the
   audience asked for).
4. Derive perceptual axes with `perceptualAxes(quotes)` and the theme vocabulary
   in `agents/themes.ts`.
5. Produce 2–3 positioning hypotheses, each with an axis, evidence and a stress
   test (do competitors already claim this? can we deliver it?).
6. Evaluate white space with all four conditions: real demand, competitor
   weakness, business ability, plausible proof with testable economics.

## Budget ceiling

This track is evidence-reusing: it should need no provider calls once the
competitor and audience tracks have run. Any call it makes comes from the shared
ledger.

## Output schema

```ts
{
  track: 'brand_positioning',
  summary: string,
  sources: SourceRecord[],
  observations: EvidenceObservation[],
  claims: WorkerClaim[]   // positioning_frame, perceptual_map, white_space
}
```

## Failure modes

- **No audience quotes** → perceptual axes are provisional and the coverage gap
  says so.
- **Competitors already claim the promise** → the hypothesis stress test returns
  `weak`; it is not presented as a differentiator.
- **White space conditions not met** → no white space is declared; the unmet
  conditions are listed in the claim.