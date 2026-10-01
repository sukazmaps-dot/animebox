# Patch 24.3 — Search Performance Observability

## Goal

Patch 24.2 made search feel fast by introducing a local-first instant lane.
Patch 24.3 makes that speed measurable in production and gives AnimeBox a
feedback loop for future search tuning.

The patch measures what matters to the user rather than only backend request
duration:

- time from input to first useful cards;
- time to authoritative provider enrichment;
- suggestion latency;
- local search server latency;
- local search delivery latency;
- instant-memory-cache share;
- which lane wins first-result races;
- local search index coverage.

## Phase A — Client search timing state

SearchCatalogClient owns one timing record for the active query.

The timer starts at the live input event, before the 90 ms debounce, so
first-result latency includes the delay the user actually experiences.

The record is reset whenever the normalized query changes and contains:

- query key;
- start timestamp;
- first-result timestamp;
- first-result source;
- whether enrichment telemetry was emitted.

Stale queries are already protected by request generation and AbortController;
telemetry follows the same active-query guards.

## Phase B — First useful result event

Add product event:

- search_first_result

It is emitted once per active query when the first non-empty result set becomes
usable.

Possible result_source values:

- instant;
- authoritative;
- discovery.

Metadata contains only operational data:

- latency_ms;
- result_source;
- result_count;
- query_length;
- search_mode;
- instant server_ms;
- instant delivery_ms;
- instant cache_status.

The latency event intentionally does not store the user's query text.

## Phase C — Authoritative enrichment event

Add:

- search_enrichment_ready

For normal title search, the event measures when the final provider-enriched
result set becomes available.

Metadata:

- total latency from typing;
- delta from first useful result;
- first result source;
- result count;
- whether the local index contributed;
- whether provider fallback was required.

This separates perceived speed from completeness.

## Phase D — Suggestion latency event

Add:

- search_suggestion_ready

Measurement begins before the 80 ms suggestion debounce and ends when the
current non-stale API response has been parsed.

It records:

- latency_ms;
- result_count;
- query_length.

The event is not emitted for aborted/stale responses.

## Phase E — Instant lane diagnostics

lib/instant-search-client.ts exposes:

- clientElapsedMs;
- clientCacheStatus = memory | network.

The instant endpoint continues returning its server-side tookMs and additionally
sets a Server-Timing header:

animebox_search_local;dur=<milliseconds>

This lets browser/devtools and product telemetry separate:

- Supabase/local-index execution;
- network/function delivery;
- client memory cache.

## Phase F — Search Performance admin dashboard

Add:

- /admin/search-performance
- /api/admin/search-performance
- lib/search-performance-server.ts
- shared search-performance contract.

The API is protected with requireAdmin(['owner', 'admin']).

Supported windows:

- 6 hours;
- 24 hours;
- 3 days;
- 7 days.

The dashboard displays:

- first-result p50;
- first-result p95;
- Instant API p95;
- Instant delivery p95;
- suggestions p95;
- full enrichment p95;
- first-result source distribution;
- instant memory-cache share;
- number of search-index documents;
- number of catalog documents;
- search-index coverage;
- latest search-index update;
- latest latency sample.

## Phase G — Health classification

Search health is intentionally simple and explainable.

Critical:
- first-result p95 > 1500 ms; or
- search-index coverage < 70%.

Warning:
- first-result p95 > 700 ms; or
- search-index coverage < 90%.

Healthy:
- no critical/warning condition.

This classification is diagnostic only and does not change product behavior.

## Phase H — Privacy and event volume

Performance telemetry must not include raw search strings.

Existing search analytics may continue storing queries where already required
for product intelligence, but latency-specific events contain query length and
mode only.

Analytics remains best-effort and must never delay search rendering.

## Acceptance criteria

1. The first-result timer begins from the live input event, not after debounce.
2. Only the current query may emit latency events.
3. First-result is emitted at most once per active query.
4. Instant first paint records server, delivery and memory/network cache timing.
5. Authoritative enrichment records the delta after first paint.
6. Context Smart Discovery can be the first-result source.
7. Suggestions record end-to-end latency including debounce.
8. Aborted suggestion responses emit no ready event.
9. No latency event metadata contains raw query text.
10. /api/admin/search-performance requires owner/admin.
11. Admin dashboard exposes p50/p95 and index coverage.
12. Search telemetry failure never breaks search.
13. No Supabase migration is required.
14. Existing Patch 24.2 fast path remains unchanged functionally.
15. TypeScript, search intelligence checks, Patch 24.2 and Patch 24.3 checks
    must pass before merge.
