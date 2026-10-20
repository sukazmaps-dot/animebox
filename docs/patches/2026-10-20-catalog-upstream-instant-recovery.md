# Catalog recovery and indexed first-result patch — 2026-10-20

## Symptom / confirmed evidence
- Mobile catalog reports `catalogMeta.source=saved` and delayed results.
- Railway production logs: repeated AniList `circuit_open`, Shikimori `TimeoutError`/`circuit_open`.
- `/api/anime` previously waits up to 4.5 seconds for a typed search and 8 seconds for browsing before reading the playable snapshot.
- Russian title search via Shikimori -> AniList MAL mapping could retry up to 12 individual unsignalled AniList requests after a failed batch.
- Supabase on 2026-10-20: 3,395 lexical search documents and 2,638 playable snapshot rows; both lexical v4 and v2 RPCs exist.
- `EXPLAIN ANALYZE` lexical v4 cold/warm examples: 1,084–1,702 ms for titles `фрирен`, `naruto`, `добро пожаловать`. Indexed `search_text LIKE` query returned `naruto` in 5 ms warm, `добро пожаловать` in 225 ms cold. Values are sampled DB execution time, not user-perceived latency.

## Scope
1. Keep existing 90-ms catalog input debounce and the full authoritative `/api/anime` request.
2. The lightweight `/api/search/instant` handler now uses `searchInstantLocalIndex`: one normalized `LIKE '%query%'` scan against the **existing GIN trigram index** on public search documents, with a bounded pool and exact/prefix/contains ranking. A query not found via containment falls back to the current lexical v4 fuzzy/transliteration logic. Public output still passes through verified availability filtering and saved metadata; no new access to inaccessible titles.
3. Preserve `/api/anime` original AniList/Shikimori semantics whenever the shared upstream circuit is healthy. During an open/half-open AniList circuit (or Shikimori for Cyrillic queries), skip the predictably failing request and use `getSavedCatalogPage`. Limit first provider attempt to 2.6 s search / 3.5 s browse when not already open. Circuit half-open probing elsewhere still restores normal operation.
4. `/search` SSR bootstrap uses the *already verified* saved snapshot first. Only if empty/unavailable does it try original provider, with an abortable 2.8-s budget. The existing client refresh still requests /api/anime.
5. Do not amplify bounded Russian batch mapping errors into 12 single AniList queries that ignore the parent's AbortSignal. When batch fails or returns no rows on a bounded request, surface the error and let /api/anime use its verified saved fallback.

## Invariants
- Canonical AnimeBox/AniList ID, availability-before-display, 0 new tables and no RLS or public GRANT changes.
- Filter semantics, ordering and server response JSON remain the same, including `catalogMeta` and pagination.
- No provider call inside instant search or unbounded extra retries; no infinite fanout under outage.
- An empty local containment match must not turn a valid fuzzy/keyboard-layout query into an empty result.
- No permanent disabling of AniList/Shikimori and no promise of absolute zero-latency on cold DB, poor mobile networks or missing titles.
- Only existing server SQL indexes used; no risky live migration necessary.

## Verification
- `npm run schedule-media:check` (catalog recovery and new indexed first-result tests)
- `npm run patch24-2:check` (updated source contract, exact intended change)
- TypeScript, targeted ESLint, full prebuild + production build in Quality Gate.
- Mobile 320/360/390/430 and PC: simple RU/EN title, no result, typo/transliteration, query changed mid-flight, filtered search, pagination, upstream forced offline, Supabase temporarily unavailable, light/dark.
- Compare actual API `Server-Timing` and real perceived p50/p95 before/after. Aim: visible cached/available exact-title results within hundreds of ms; not a guaranteed network SLA.

## Release gates
PR only until CI green. Confirm live Railway production and test 2–3 actual queries after deployment; watch upstream pressure/circuit and DB query load. Revert PR if index path increases failures or quality regresses.
