# Patch 17.8 — Discovery Engine 2.0

## Pipeline

AnimeBox recommendations now use a staged, explainable pipeline:

1. Data foundation and attribution identifiers.
2. Taste Graph v6 with explicit ratings, completion behaviour, negative feedback,
   mood weights, confidence and a bounded exploration rate.
3. Multi-source candidate retrieval from ranked, popular, ongoing, preferred
   genre and mood pools.
4. Versioned ranking with component-level score breakdown.
5. Diversity reranking with franchise caps, genre concentration control and
   controlled 8–20% exploration.
6. Personalized home rails, mood-first presentation and cold-start copy.
7. Funnel analytics from viewport impression through click, playback, 15m,
   30m and completion, grouped by algorithm version, rail and position.
8. Cursor pagination, cross-page client dedupe, CDN-safe public context,
   source fallback, rate limiting and cache hardening.

## Privacy boundary

Candidate retrieval never receives a user id, anonymous id or recommendation
session id. The cacheable request context is limited to a four-value exploration
bucket, one canonical genre and one finite mood. Personal exclusions and ranking
remain client-side, while first-party analytics stores bounded recommendation
attribution separately.

## Compatibility

The recommendation endpoint accepts the legacy `page` parameter for bootstrap
and older clients. Responses expose `nextCursor`; current Smart Feed clients
switch to the opaque cursor after the first pagination request.

## Operational safeguards

- candidate endpoint: IP rate limit + bounded page/limit values;
- invalid cursors fail closed with HTTP 400;
- 15 minute server/CDN candidate cache with 24 hour stale revalidation window;
- one-source retrieval failures retry through ranked/popularity fallback;
- client caches are versioned and bounded;
- one-page delayed prefetch stays outside the LCP window;
- empty personalized pages can hop a bounded number of times;
- recommendation cards are deduplicated by anime id across appended pages;
- analytics and attribution remain best-effort and never block playback.
