---
name: egypt-competitor-commercial
description: Builds competitor profiles from opened pages, normalises products and prices, and compares landed Egyptian prices with VAT, delivery, pack size, offers and validity.
---

# Egypt Competitor & Commercial Intelligence

## When to use

The `competitor_commercial` track of a `marketing_research` task, after the
market scout has resolved entities.

## Egyptian specifics

- Prices are quoted as `EGP`, `جنيه`, `دولار`, `1.5k`, with or without VAT
  (`شامل الضريبة`). Never compare a VAT-inclusive shelf price with an exclusive
  invoice price: use `landedPrice`.
- Delivery (`توصيل`), cash on delivery (`الدفع عند الاستلام`), installments
  (`تقسيط`), pack size (`12 pcs`, `500 جم`) and offers (`خصم`, `باقة`) all move
  the real price.
- A missing price is `unknown`, never zero and never "unchanged".

## Workflow

1. Read the market scout's entities and sources from `context.prior`.
2. Search price and offer queries (`price`, `أسعار`, `عروض`) through the router.
3. Open the highest-value pages; parse each line with `parsePriceText` and
   `parsePackSize`.
4. Build `PriceObservation` records with competitor, product, pack size, VAT
   treatment, delivery, COD, installments, MOQ, availability, channel, geography,
   captured/valid dates, offers, source id and raw text.
5. Classify offers with `classifyOffers`.
6. Compare with `compareLandedPrices`; keep the basis string next to every total.
7. Emit a `pricing` claim with the comparison basis and any unresolved conflicts.

## Budget ceiling

Weighted share of the run budget (see `TRACK_BUDGET_WEIGHT`); pages are the
binding constraint. Prefer opening one price page over three discovery pages.

## Output schema

```ts
{
  track: 'competitor_commercial',
  summary: string,
  entities: ResolvedEntity[],
  observations: EvidenceObservation[],   // observation + price
  sources: SourceRecord[],
  usage: UsageRecord,
  coverageGaps: string[],
  claims: WorkerClaim[]                  // competitor_landscape + pricing
}
```

## Failure modes

- **No price captured** → the pricing claim says the comparison is unknown, and
  the coverage gap records that prices are not public.
- **Mixed VAT treatment** → warn and compare landed totals only.
- **Pack size missing** → record `unitLabel: 'per unit'` and flag that unit
  prices are not comparable.
- **Unresolved conflicts** → keep both figures with their sources; never pick
  the more attractive one.