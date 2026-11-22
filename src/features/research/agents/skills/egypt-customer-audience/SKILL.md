---
name: egypt-customer-audience
description: Builds a bounded public Voice-of-Customer sample from allowlisted social reads, preserves the original Egyptian quote, declares the sample frame and who is missing, and derives functional segments.
---

# Egypt Customer & Audience Intelligence

## When to use

The `customer_audience` track of a `marketing_research` task. Activate it when
the brief asks about customers, complaints, reviews, segments or messaging.

## Egyptian specifics

- Quotes stay in the original language (`quoteLanguage: 'ar-EG' | 'en'`).
  Translations are stored separately and are `null` unless one was produced.
- Social samples over-represent people who post publicly. The sample frame
  always lists what is missing: non-posters, offline buyers, other governorates.
- Only Composio SCRAPECREATORS allowlisted reads are callable:
  `profiles_get`, `posts_list`, `comments_list`, `transcripts_get`, `channels_get`,
  `videos_list`, `ad_library_search`.
- PII/enrichment actions (`creator_email`, `age_gender`, `audience_demographics`,
  `follower_following`, `email_lookup`) are blocked before any transport call.

## Workflow

1. Gather semantic candidates for complaints and price reactions
   (`router.search('semantic', ...)`).
2. Run the bounded Composio sample per platform (`router.social`), respecting
   `capsForRun()`: max 12 profiles, 30 posts, 12 videos, 4 comment pages.
3. For instant actions, inspect the price first; refuse when payment is required.
   Reserve the worst-case credit estimate before execution.
4. Normalise items with `extractSocialItems`, classify themes with
   `themeOfPublicText`, and record one observation per quote.
5. Build the sample frame (platforms, geography, window, count) and the missing
   groups; emit a `method` claim that states them.
6. Derive functional segments (job, trigger, workaround, urgency, price
   sensitivity, barriers, channels, trust) and a `voice_of_customer` claim.

## Budget ceiling

Capped by `capsForRun()` and by the track's share of the shared ledger. The
sample never grows to "more data" on its own; it grows only when the Director
authorises the track.

## Output schema

```ts
{
  track: 'customer_audience',
  summary: string,
  observations: EvidenceObservation[],   // quote
  sources: SourceRecord[],               // composio + firecrawl
  usage: UsageRecord,
  coverageGaps: string[],
  claims: WorkerClaim[]                  // voice_of_customer + method
}
```

## Failure modes

- **Social action refused** → record the reason in coverage gaps and continue
  with the discovery sample; never substitute invented quotes.
- **Payment required** → refuse before execution; no credits are spent.
- **Empty sample** → the audience claim is a hypothesis and the bias card is
  explicit that no social evidence exists.
- **PII in a quote** → the acceptance suite scans claims for email/phone
  patterns and blocks publication.