# Hotfix — устойчивый каталог при AniList/Shikimori outage (2026-10-20)

## Production evidence

- Android screenshots show 20 results followed immediately by the discovery footer, a `CATALOG_PAGE_SOURCE_CHANGED` retry banner and fallback-notice messages.
- Supabase `public.anime_saved_playable_catalog` contains 2,663 verified playable rows, including 223 titles from 2026 and 2,663 posters; page 2 returns normal rows. The data exists.
- Railway production logs during the incident record AniList HTTP 429 / circuit_open, Shikimori localization timeout / circuit_open and `Catalog provider deadline exceeded`. Endpoint success HTTP 200 does not prove a healthy upstream or stable result source.
- SSR `app/search/page.tsx` prefers saved verified rows. However, `SearchCatalogClient` later requested `/api/anime` with no source contract, whose provider-first logic could return provider, saved or degraded pages. Mixing those incompatible offsets triggered the explicit fatal source-change handler; some provider result sets reported `hasNextPage=false` after only 20 cards.

## Requirements implemented

1. Browser catalog (including ordinary search, genre/studio/year/status/format filters) requests `catalogSource=saved`, locking the canonical list to `anime_saved_playable_catalog`. Existing general `/api/anime` callers retain their provider-first behavior.
2. No AniList or Shikimori call is required to paginate the visible playable grid.
3. The saved route sends explicit `pagination.hasNextPage` using the DB's limit+1 page query. No inference from a 20-card page.
4. A canonical verified page has `catalogMeta.completeness=full` and no scary "резервный каталог" notice. A schema-compatibility/limited result remains marked partial and can retain already verified previews.
5. A source mismatch caused by an older SSR/HTTP result automatically restarts at page 1 instead of leaving the user at a frozen retry banner. Never combine offsets from different sources.
6. Source-pinned DB failure returns 503 with no-store/Retry-After; already loaded cards remain visible, a retry re-runs the same page. Do not silently pivot a mid-pagination request to an external source.
7. Unreleased/upcoming status remains on the pre-existing provider route because the saved playable view intentionally excludes yet-to-air titles.
8. Never bypass availability checks: the saved view is already verified playable. No new migrations, public permissions, RLS changes, or extra upstream fan-out.

## Caveats / follow-up

- The database is now the catalog's display-time source of truth; a future background metadata ingest should maintain richness and discoverability without affecting scroll reliability.
- Saved canonical coverage is 2,663 playable rows (as measured during the incident), not the full universe of anime in AniList. Product UX should communicate the playable subset when relevant.
- Mood ranking remains per fetched page; a separate non-emergency patch can implement indexed/global mood ranking.
- Browser/page visibility still matters. Mandatory production canary: 20 -> 40 -> 60 cards, filters and `Исекай`, provider 429/circuit, query changes, repeat fetches, return navigation, mobile Chrome/Telegram Mini App, edge cache behavior.

## Regression checks

- `tests/catalog-stable-search.cjs`: pinned source request, full saved result precedence, automatic reset of legacy offset change, existing partial metadata semantics.
- `tests/catalog-recovery-fix.cjs`: direct pinned route returns saved page 1 and 2 with no provider calls while original provider-outage/compatibility tests remain valid.
- Existing tests already invoked by `catalog-integrity:check` / `schedule-media:check` and full `prebuild`.
- Require green GitHub Quality Gate, production TypeScript/lint/build and mobile canary before merge/deploy. Vercel blocked-account check is unrelated; Railway is production.
