# Patch 24.2 — Instant Search Response

## Goal

Search must feel immediate while preserving the existing smart-search accuracy,
fuzzy matching, provider fallbacks, filters and catalogue integrity.

The current problem is not only the 200 ms client debounce. The authoritative
catalogue request also waits on external provider work before the local lexical
index is consulted, and search suggestions may block on provider bootstrap when
the local corpus is sparse.

Patch 24.2 separates **first useful result** from **authoritative enrichment**.

## Current latency sources

### Client

- SearchCatalogClient waits 200 ms after the last keystroke before starting the
  catalogue request.
- SearchSuggestions waits another 170 ms before asking the suggestion API.
- While an existing result grid is refreshing, it is dimmed and pointer events
  are disabled.

### Server

- /api/anime starts with getAnimesWithShikimori and only after it resolves
  performs the local Supabase lexical search.
- Local search can execute up to three query variants serially.
- Local hits are hydrated after the primary provider request, adding another
  provider round-trip when the provider omitted those IDs.
- /api/search/suggestions can wait for provider bootstrap, indexing and a second
  local query before it returns.

## Phase A — Instant local lane

Add:

- /api/search/instant
- lib/instant-search-client.ts

The instant endpoint:

- accepts finite public q + limit parameters;
- uses the existing private server-side lexical search index;
- checks local availability;
- returns lightweight Anime-shaped cards from index metadata;
- never calls AniList or Shikimori;
- is public-cacheable;
- is best-effort and returns an empty successful payload on internal failure.

The local index already stores enough data for a useful first paint:

- anime id;
- canonical slug;
- display title;
- poster;
- genres.

Missing score/year/episode metadata is allowed during the short preview phase.
The authoritative request replaces these shells with complete Anime objects.

## Phase B — Two-stage catalogue search

For a normal title query on page 1 with default filters and no mood:

1. start /api/search/instant;
2. start the existing /api/anime request at the same time;
3. render the local result cards as soon as they arrive;
4. keep those cards interactive while provider enrichment is running;
5. atomically replace them with authoritative results when /api/anime completes.

The instant lane is disabled for:

- context/discovery queries;
- active structured filters;
- active catalogue mood;
- pagination after page 1.

Those paths keep their full semantic/provider behavior.

## Phase C — Lower input latency

Reduce:

- catalogue debounce: 200 ms -> 90 ms;
- suggestion debounce: 170 ms -> 80 ms.

AbortController and request sequence guards remain mandatory so fast typing
cannot display an older query after a newer one.

## Phase D — Faster local lexical lookup

The first normalized query variant runs alone.

If it already returns a healthy result set, no layout/transliteration fallback
RPCs are made.

Only sparse/uncertain primary searches execute fallback variants, and those
fallback RPCs run concurrently.

This improves both latency and database efficiency:

- common exact/prefix search: one RPC;
- typo/layout/transliteration recovery: bounded fallback RPCs in parallel.

## Phase E — Remove provider work from suggestion critical path

Suggestions return from the local index immediately.

When the index is sparse and the query is specific enough, provider bootstrap
runs through Next.js after() after the response. It can warm:

- search documents;
- availability metadata.

The current keystroke never waits for that provider request.

## Phase F — Parallel authoritative search

/api/anime starts provider retrieval and local lexical lookup concurrently.

After both settle:

- IDs already returned by the provider are not hydrated again;
- only local-only IDs need the existing hydration fallback.

This removes the previous provider -> local-index serial dependency and avoids
unnecessary hydration for overlapping candidates.

## Phase G — UX rules

While instant results are displayed:

- cards remain clickable;
- the grid is not dimmed;
- the user sees "N найдено · уточняем…";
- a thin progress line communicates background enrichment;
- page scroll position remains stable;
- the final result replacement uses the same query generation only.

When the authoritative request fails but instant results exist:

- keep the instant cards;
- show a non-destructive warning;
- do not replace the grid with an error screen.

## Performance targets

For a warmed common-title query:

- input debounce <= 100 ms;
- local API first useful response target: <= 150 ms server time under healthy DB conditions;
- first interactive search cards target: roughly 150–300 ms from stopped typing on a normal connection;
- suggestions should not wait for external providers;
- authoritative provider enrichment remains asynchronous from the user's point
  of view.

These are engineering targets, not hard guarantees; network, Supabase region,
cold starts and provider health can still affect observed latency.

## Regression shield

Add npm run patch24-2:check and keep it in prebuild.

The check protects:

- the instant endpoint;
- local Anime-shell mapping;
- reduced debounce values;
- provider-free instant path;
- non-blocking suggestion bootstrap;
- primary-first/fallback-parallel local lookup;
- provider/local parallel authoritative lookup;
- interactive instant-preview UI;
- request abort/generation protections.

## Non-goals

Patch 24.2 does not:

- remove fuzzy search;
- remove AniList/Shikimori;
- make context Smart Discovery local-only;
- weaken catalogue availability filtering;
- change SEO search indexing rules;
- require a Supabase migration.
