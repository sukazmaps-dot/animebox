# Patch 32.1.1 — Poster Fallback Completion & Presence API Backoff

**Baseline:** 32.1, `04f7e33` on `main` (deployed successfully to Railway).  
**Scope:** bounded fallback metadata for recommendation surfaces and optional social-presence client backoff.  
**Schema / new infrastructure:** none. No R2 writes, buckets, external services, secrets or paid cache.

## Production evidence (18–19 October 2026)

Railway in the latest two-hour sample: 13,612 HTTP requests; 29 HTTP 5xx (0.213%); highest observed p95 bucket 3,093 ms. Runtime logs had Supabase-related localization timeouts and `social_presence_ip`/`social_presence_user` RPC timeouts (existing fail-closed path); this does **not** establish DDoS or a whole-site outage.

Patch 32.1 already preserves alternate provider URLs and a single batched `anime_shikimori_metadata` read, but only `enrichSavedAnimeMetadata` was using it. Other candidate and graph surfaces could return an AniList-only image URL. A missing DB row cannot be invented. A universal 100% image-availability guarantee is impossible with external origins.

## Implementation contract

### 1. Candidate feed `/api/recommendations`

After availability filtering, call `enrichAnimePosterSources(availability.items)` once before serializing. Preserve original IDs, ordering, candidate source, fallback source, cursor and hasMore semantics. The helper is an optional cached batch read (max 50 MAL IDs, 1.2 s deadline), and returns the original array if Supabase metadata is unavailable. Never make upstream Shikimori calls per poster.

### 2. Smart discovery `/api/discovery`

Apply the same helper **after** strict/relaxed semantic ranking and `slice(0, limit)`, never to the whole candidate set. Do not change intent parsing, seed matching, ranker, availability decisions, adult-content gates or cache semantics.

### 3. Title recommendations `components/RelatedAnime.tsx`

Apply only to the final 12 verified, ranked and deduplicated cards, preserving taxonomy scoring and the existing fail-closed availability policy. No new client code or storage route needed.

### 4. Optional presence heartbeat

Retain authenticated `/api/social/presence` route and its *existing shared database IP + user limit*, including fail-closed 429 and 503. Do not switch authenticated mutations to a per-instance limiter, skip Auth, bypass RLS, or turn 503 into success.

On the client, allow one in-flight request only, use a 5-second abort deadline and exponentially back off after non-2xx/network failures. Initial cooldown 60 seconds, then 120/240/300 seconds capped; parse numeric `Retry-After` with a 300 s cap. Reset on 2xx. Do not send heartbeat while offline/hidden; retain the existing coarse 60 s timer and resume listeners. This mitigates retry pressure, **not** the upstream Tokyo/Europe Supabase latency or database unavailability itself.

### 5. Cost + safety boundaries

- Keep Patch 32.1 CDN/R2 policy: `MEDIA_R2_WRITES_ENABLED` unset or `false`, existing cached R2 objects readable.
- Keep allowlisted image hosts, same-origin Shikimori proxy, finite fallback chain and terminal local placeholder.
- Keep original arrays on optional metadata errors (no reordered recommendations or empty-result cache poisoning).
- The post-filter enrichment has no additional outbound AniList/Shikimori requests or persistent object writes.
- Never log service-role keys, raw IPs, user IDs or image byte bodies.
- No new Supabase migration required.

## Verification / release

1. `npm run poster-reliability:check`: existing real batched/failing Supabase fixture and WebP/media Worker tests **plus** Patch 32.1.1 consumer-path assertions and executable heartbeat backoff tests.
2. `npm run patch30-1:check`, `npm run hotfix31-15:check`, `npm run hotfix31-16:check`, `npm run social-community:check` and `npm run prebuild`.
3. `npx tsc --noEmit` and targeted ESLint for changed application files.
4. Production build and GitHub Quality Gate including existing browser regressions; verify explicit release status before merge.
5. After an authorized Railway deployment, sample `/api/recommendations`, `/api/discovery`, a title's RelatedAnime and poster relay. Compare response item identities/order and degraded handling, verify current Worker revision independently (32.1 Worker deployment was not established by the Railway application deploy).
6. Track 5xx, p95, fallback/poster success, Supabase timeout rate over comparable intervals. Roll back application release if regressions occur; do not roll back schema (none changed).

## Non-goals / known limitations

No global IP limitation redesign, no new SQL/RPC or database migration, no new R2 writes, no guaranteed poster for an anime lacking all trusted upstream URLs. The observed `social_presence` server-side 503 remains correct fail-closed behavior when the shared DB limiter is unreachable. Network locality / Supabase plan and region investigation remain a separate backend infrastructure task.
