# Patch 18.2 — Catalog Integrity & Rating UI Fix

## Goals

1. Smart Feed rating badges must never float over a failed/local-fallback poster.
2. AnimeBox discovery surfaces must stop promoting titles that have been
   repeatedly confirmed to have no playable source.
3. Provider outages must never mass-hide the catalog.
4. Availability checking must stay cheap and bounded.

## Availability model

`anime_availability` is a server-only Supabase registry keyed by AniList ID.

Aggregate states:

- `playable`: at least one provider is confirmed available.
- `unknown`: never checked, stale, ambiguous, timed out, rate-limited, or
  fewer than three all-provider misses have been confirmed.
- `unavailable`: every configured provider returned a definite absence on
  three consecutive checks.

Provider states are tracked independently for Kodik, AniLiberty and Direct.

A timeout, 429, 5xx or ambiguous provider response is UNKNOWN and does not
increment the confirmed-miss counter.

## Load budget

User requests never synchronously fan out to video providers.

The hot path is:

`request -> one batch Supabase availability read -> response`

Missing/stale titles are queued through Next `after()` in small batches:

- catalog/search: at most 6 titles per request;
- recommendations: at most 5 titles per request;
- search bootstrap: at most 4 titles;
- process probe concurrency: 4;
- identical anime probes share one in-flight Promise.

A daily cron refreshes at most 24 stale registry rows.

TTL policy:

- PLAYABLE ongoing: 12h
- PLAYABLE finished: 7d
- UNKNOWN: 30m
- UNAVAILABLE: 24h

## Surface policy

- Catalog/search: PLAYABLE + UNKNOWN. Fresh UNAVAILABLE is hidden.
- Recommendations: PLAYABLE preferred. UNKNOWN remains a cold-start fallback
  until enough candidates have been verified.
- Upcoming: availability filtering is bypassed.
- Anime detail pages remain addressable; availability is about discovery and
  playback, not whether the metadata page exists.

## Rating UI

`AnimeImage` exposes `loading | loaded | fallback`.

Smart Recommendation cards render rating/match badges only while a real poster
is loaded. Score values are normalized to the 0–10 scale. The duplicate
`.smart-card__rating` positioning override was removed from
`design-v2-content-first.css`; `smart-home.css` owns its geometry.

## Admin

`/admin/catalog-health` exposes:

- total checked
- playable
- unknown
- unavailable
- stale
- recent unavailable rows
- manual AniList-ID recheck

Manual rechecks use the same concurrency guard and are audited.

## Migration

Apply:

`supabase/migrations/20260925050000_catalog_availability_v1.sql`

The application is intentionally schema-missing tolerant during rollout:
without the table it keeps titles UNKNOWN instead of breaking discovery.
