# Patch 18.5.5.2 — Scale Readiness: Supabase + API Hot Paths

## Mission

Prepare AnimeBox's hottest database/API paths for a sudden traffic burst without reducing playback integrity, personalization quality, security boundaries, or data correctness.

The patch is based on production evidence, not synthetic guesses.

At patch start, live Supabase `pg_stat_statements` shows:

- `consume_api_rate_bucket`: ~20k calls and ~306s cumulative database execution time;
- authenticated watch traffic currently creates **two Postgres rate-bucket RPCs per write request** (IP + user);
- retained rate-bucket rows show watch writes are the highest-volume application scope;
- profile/community RPCs are materially more expensive than ordinary indexed point reads;
- `anime_catalog`, `anime_availability`, watch progress and product analytics are high-frequency surfaces;
- Supabase Performance Advisor reports three foreign keys without covering indexes.

This patch attacks amplification first: repeated work caused by one user action must not multiply into avoidable Postgres work.

---

## 1. Watch heartbeat write-pressure shield

### Current amplification

A normal heartbeat currently performs:

1. authenticated user lookup;
2. Postgres IP rate-limit RPC;
3. Postgres user rate-limit RPC;
4. watch-session lookup;
5. episode/progress reads;
6. heartbeat insert;
7. progress upsert;
8. session update.

The two rate-limit RPC writes happen on every legitimate heartbeat even though the watch session already has server-owned anti-replay state.

### New contract

Split watch write protection by action.

**Session lifecycle actions** (`start`, `end`):
- keep durable Postgres IP + user rate limiting;
- use a dedicated `watch_session_*` scope;
- these actions are low-frequency and security-sensitive.

**Heartbeat**:
- no per-heartbeat Postgres rate-bucket writes;
- ownership remains authenticated by user + session id;
- sequence number remains monotonic;
- session expiry remains authoritative;
- add a server-side minimum persisted-heartbeat interval derived from `sessions.last_received_at`;
- a too-fast heartbeat returns HTTP 429 before episode/progress/heartbeat writes;
- rejected heartbeats do **not** advance `last_seq`, so the client can safely retry the same sequence;
- keep provider-skip data pending client-side until a heartbeat succeeds.

Target: remove two auxiliary Postgres writes from the normal heartbeat path and cap one authenticated session to a bounded DB write frequency even if a client is modified.

---

## 2. Availability registry burst cache

`filterAnimeByAvailability()` is invoked by home, recommendations, discovery and other public surfaces. Candidate pages can be cached while availability rows are still re-read repeatedly.

Add a bounded server-process cache:

- key: anime id;
- value: availability row or a short-lived missing-row tombstone;
- positive TTL: ~60 seconds;
- missing TTL: shorter (~20 seconds);
- bounded LRU-like eviction;
- exact-batch in-flight deduplication so concurrent identical bursts share one PostgREST request;
- successful refresh/upsert updates the cache immediately;
- cache is fail-soft and never turns unknown/missing into playable;
- existing verified-first exposure rules remain unchanged.

This cache is only an acceleration layer; Supabase remains source of truth.

---

## 3. Anime catalog burst cache

`ensureAnime()/ensureAnimes()` is a watch-session hot path.

Add a short server-process metadata cache:

- key: anime id;
- TTL: ~60 seconds;
- cache DB rows, not browser/user state;
- query Supabase only for cache misses;
- retain existing 24h upstream metadata refresh rule;
- refresh/upsert writes replace cache entries immediately;
- bounded entry count;
- no caching of thrown errors.

This protects popular-title bursts where hundreds of viewers start the same anime.

---

## 4. Recommendation edge-cache activation

The recommendation route already emits public CDN cache headers and its URL context is finite/public (page or opaque cursor, 0..3 bucket, canonical genre, finite mood).

However the global proxy currently marks it private because it is absent from the public API allowlist.

Fix the policy:

- add `/api/recommendations` to the public-cacheable API allowlist;
- use the shared `publicApiCacheHeaders()` helper in the route;
- successful responses: short browser cache + 5m edge freshness + long SWR;
- invalid/error responses remain private/no-store;
- keep durable rate limiting for cache misses;
- do **not** add arbitrary natural-language `/api/discovery` to the CDN allowlist in this patch, avoiding unbounded cache-key cardinality.

Expected effect: repeated feed pages across visitors are served at edge and do not execute recommendation logic or rate-limit RPCs.

---

## 5. Database index hygiene — safe additive only

Apply only the three covering indexes currently requested by Supabase Performance Advisor:

- `comment_reports(reporter_id)`;
- `comment_reports(resolved_by)`;
- `profile_favorite_anime(anime_id)`.

Rules:

- `CREATE INDEX IF NOT EXISTS`;
- no index drops in this patch;
- no speculative indexes based only on low traffic;
- no schema/data-destructive operations.

After migration, rerun Supabase Performance Advisor.

---

## 6. Hot-path observability markers

Add explicit response/diagnostic signals where useful:

- recommendation responses expose a stable cache profile marker;
- watch 429 from the session cadence guard is distinguishable from global rate limiting;
- no user identifiers are added to logs/headers.

System Health already records 429 and route latency, so no new telemetry table is required.

---

## 7. Correctness invariants

The patch must not weaken:

- watch session ownership;
- monotonic heartbeat sequencing;
- anti-skip and coverage math;
- completion threshold;
- one-active-session protection;
- playback resume integrity;
- catalog verified-first policy;
- provider availability refresh;
- recommendation cursor semantics;
- private API no-store defaults.

No anonymous/public user data is cached in the server-process maps.

---

## 8. Regression gate

Add `patch18-5-5-2:check` covering:

- heartbeat route does not call durable rate-limit RPC on every heartbeat;
- start/end retain durable dual limits;
- heartbeat minimum persistence interval is enforced before expensive episode/progress work;
- too-fast heartbeat throws 429 without sequence advancement;
- availability cache TTLs and bounded size;
- availability exact-batch in-flight dedupe;
- refresh writes update the availability cache;
- anime catalog cache is bounded and short-lived;
- metadata refresh semantics remain 24h;
- recommendations are present in the public edge allowlist;
- recommendation success uses shared public cache headers;
- discovery remains outside the public CDN allowlist;
- three additive FK indexes exist in migration;
- no DROP INDEX / destructive DDL in the new migration.

---

## Release gates

- TypeScript;
- targeted lint;
- retention regression;
- production build;
- watch-service regression;
- Supabase hot-path regression;
- edge-cache regression;
- DB-query audit;
- 18.5.5.0 media warmup;
- 18.5.5.0.1 media reliability;
- 18.5.5.1 large-screen;
- new 18.5.5.2 hot-path gate.

Migration is applied only after application CI is green.

---

## Success criteria

For ordinary active playback, one heartbeat should no longer create two auxiliary `api_rate_buckets` RPC writes.

For repeated public recommendation URLs, the edge should be allowed to absorb repeat traffic.

For bursts around the same popular titles, repeated availability/catalog metadata reads should collapse inside each warm server process.

The patch is the first scale step; cache-stampede control across instances and synthetic 100/500/1000 concurrent load testing remain subsequent 18.5.5.x phases.
