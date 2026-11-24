---
name: social-media-analytics
description: Evaluate social account reach, views, engagement, audience growth and message activity using authorized platform data.
metadata:
  version: 1.0.0
  owner: busmora
---

# Social Media Analytics

## Method
- Establish the decision, account, channel, date range, timezone, organic/paid scope and measurement level (account, post or campaign). Read the actual available data and metric metadata. A publishing connection does not prove analytics permissions. If a read fails, report its status and use a valid supplied export if available.
- Separate unique exposure from repeated exposure, interactions from unique interacting accounts, and video starts from qualified views. Use current provider definitions and the API version returned by the integration. Do not silently substitute a renamed or deprecated metric. Identify overlapping intervals and lifetime counters before aggregating.
- Calculate rates with the named denominator and comparable time window: interactions per reach, interactions per impressions, or follower-based rate are different indicators. Calculate net follower change from opening and closing counts or verified gains/losses; distinguish growth rate from absolute growth. Do not add unique reach across posts or days as if it were unique account reach.
- Compare observed patterns with the business goal. For awareness inspect exposure and audience growth; for consideration inspect meaningful interactions, clicks or inquiries; for conversion use verified downstream events. Separate paid from organic when data permits and report the mixed scope otherwise.

## Egyptian relevance
A Facebook message, Instagram DM, WhatsApp inquiry, branch visit and completed order are distinct outcomes. Only connect them with supported event definitions or authorized matching data. For local businesses, relevant service-area exposure may matter more than total reach. Interpret audience location and language only from observed aggregates; do not infer demographics from names or photos. Compare timing in the account timezone, noting Egypt's local timezone if relevant.

## Return and review
Return period, source/account reference, metric definitions, computed indicators, trend comparisons, meaningful observations, missing metrics and action-oriented implications. Include counts alongside rates and avoid claiming that interaction growth guarantees sales. Verify totals against available platform aggregates; flag rather than force reconciliation. Use the calculator or data analysis tool for derived numbers. Request additional evidence via Director if needed; never contact followers, publish, or modify an account.
