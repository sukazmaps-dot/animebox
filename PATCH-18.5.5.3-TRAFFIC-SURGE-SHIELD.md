# Patch 18.5.5.3 — Traffic Surge Shield

## Mission

Prepare AnimeBox for a sudden multi-instance traffic burst without allowing a popular title to trigger duplicate upstream refreshes from every warm Vercel instance.

Patch 18.5.5.2 already removed hot-path database amplification and added short per-process caches. 18.5.5.3 closes the next gap: cache stampedes across serverless instances.

## 1. Two-layer deduplication

Every expensive refresh must pass through two barriers:

1. **Local in-flight dedupe** — concurrent calls inside one Node.js instance share one Promise.
2. **Distributed refresh lease** — only one serverless instance owns the refresh for a given scope/key.

Lease scopes are deliberately finite:

- `catalog_availability:<animeId>`
- `anime_catalog_metadata:<animeId>`

No user id, session id, IP address, request payload, or natural-language query becomes a lease key.

## 2. Availability refresh shield

`refreshCatalogAvailability()` and batch refreshes keep the existing local `inFlight` map.

Before probing Kodik/AniLiberty/direct:

- attempt a short distributed lease;
- lease owner performs the provider refresh and persists the result;
- non-owner waits only 180 ms;
- non-owner bypasses the local read cache once and re-reads Supabase;
- if the remote owner has not finished yet, reuse the previous verified row or return pending/null;
- never convert a provider timeout into `unavailable`;
- never expose an unverified title.

The existing verified-first, degraded-grace and consecutive-miss rules remain unchanged.

## 3. Anime metadata refresh shield

`ensureAnimes()` gains a dedicated per-title refresh in-flight map.

For metadata older than 24 hours:

- one local Promise owns the refresh inside a process;
- one distributed lease owner calls AniList/Shikimori across processes;
- non-owner with stale metadata returns the stale row immediately;
- non-owner on a first-ever cold miss waits 120 ms + 240 ms for the remote writer;
- if no row appears within that bounded budget, fail open and fetch upstream rather than generating a false 404.

This trades a rare duplicate cold fetch for correctness and low user-facing latency.

## 4. Lease storage and security

Lease rows live in `private.runtime_refresh_leases`.

Security contract:

- private schema;
- RLS enabled;
- explicit service-role-only policy;
- table privileges revoked from `PUBLIC`, `anon`, and `authenticated`;
- RPC functions are `SECURITY INVOKER`;
- `EXECUTE` revoked from `PUBLIC`, `anon`, and `authenticated`;
- only `service_role` can execute acquire/release RPCs;
- TTL is clamped to 5–60 seconds;
- owner token is a random UUID;
- release succeeds only for the current owner token;
- stale leases self-heal through expiry.

The lease layer is fail-open. If the coordination RPC is unavailable, AnimeBox keeps serving requests using the existing local in-flight shield.

## 5. Applied migrations

- `20260925211630_traffic_surge_refresh_leases_v1.sql`
- `20260925211831_traffic_surge_refresh_leases_rls_policy.sql`

Both are additive. No user data or playback data is modified.

## 6. Regression gate

`patch18-5-5-3:check` verifies:

- local in-flight maps remain present;
- both distributed lease scopes remain wired;
- bounded remote-settle waits remain present;
- fail-open behavior remains present;
- migration uses `private` schema + RLS;
- no `SECURITY DEFINER` is introduced;
- execute permissions remain service-role-only;
- the explicit RLS policy remains present;
- a deterministic 12-instance burst model collapses 100, 500 and 1000 simultaneous requests to one upstream refresh.

The gate is part of `prebuild`.

## 7. Invariants that must not change

This patch must not weaken:

- watch ownership or heartbeat sequencing;
- anti-skip / completion math;
- verified-first catalogue exposure;
- degraded grace windows;
- provider miss thresholds;
- 24-hour anime metadata refresh semantics;
- recommendation edge-cache policy;
- private API no-store defaults;
- existing rate limits.

## 8. Release gates

Before merge:

- inspect GitHub diff;
- run Patch 18.5.5.3 regression gate;
- run TypeScript/build when CI capacity is available;
- rerun Supabase Security Advisor;
- rerun Supabase Performance Advisor;
- verify the live lease RPC with `service_role`.

Vercel build-rate-limit is an infrastructure gate, not a code failure. A rate-limit-only Vercel failure must be reported separately from application regressions.

## Success criteria

Under a hot-title burst, one Vercel instance may serve hundreds of callers through one local Promise, while multiple instances coordinate through one short database lease.

A traffic spike should increase user requests without multiplying provider probes linearly.
