# Patch 30.4 — Unified Anime Metadata Source

Status: implementation in feature branch, NOT deployed. Based on release 30.3. Owner: AnimeBox.

## Why
The first screen uses `anime_saved_playable_catalog` persisted playable rows. Its `provider_score` joins `anime_shikimori_metadata.score` by MAL ID. Detail uses AniList `getAnimeById` + 30-minute Next cache, with a separate localization layer. Catalog/search uses AniList when available and saved rows during upstream outages. Existing 30.3 unified the 0–10 display, **not the source values**; therefore the same anime can display a different score.

## Goals / non-goals
Goals:
1. Canonical AniList score for a given AniList ID, shared between pages without N+1 provider requests.
2. Server-side persistent, bounded metadata snapshots, with provenance and freshness.
3. Explicit total/available episode semantics; provider counts are never considered verified playable episodes.
4. Graceful fallback when migration is missing, AniList is down or the cache is unavailable.
5. Home LCP cannot wait for remote AniList hydration; cached list page order, filter and availability remain authoritative.

Non-goals: changing Kodik/source availability, progress, social/community rating, user data, redesign/CSS, SEO slugs, catalogue membership/order, adding a new cron or dependency.

## Source priority & data contract
- Primary: eligible AniList ANIME record, indexed by **AniList anime_id**; no MAL ID mixing.
- Cold fallback: existing persisted Shikimori score; no invented zeros. Cold source difference with detail is possible until canonical cache has been populated; this is an explicitly documented eventual-consistency window.
- Cached AniList records (including an explicitly *unknown* score) supersede Shikimori fields while fresh, so unknown scores are not silently replaced with unrelated ratings.
- Expired snapshots do not override fallback; they are candidates for bounded refresh.
- No blind `Math.max` on published count; don't synthesize released episodes from planned totals.
- Display score uses existing `formatAnimeScore` exactly one decimal. A score of 0/invalid is null.
- A snapshot overwrites only score, total episodes, aired episodes and status **when explicitly present**; it never changes title, MAL ID, cover, popularity, rank, slug or availability flags. A genuinely unknown score should remain unknown.
- Keep `metadataSource: 'saved'` to preserve availability fast-path.
- For finished anime, provider total can be definitive; for RELEASING, total can mean planned count. `animeEpisodesDisplay` from Patch 30.3 determines captions.

## Schema / security
One additive `public.anime_public_metadata_cache` table:
- PK `anime_id bigint` positive, numeric(3,1) nullable 0 < score <= 10, `episodes_total` positive nullable, `episodes_aired` nonnegative nullable, status nullable, `source='anilist'`, `fetched_at`, `expires_at`.
- Expiry index, CHECK constraints, RLS ON, no anon/auth policies, revoke PUBLIC/anon/auth grants, grant service_role DML.
- Atomic **30-row maximum** merge RPC, SECURITY INVOKER, restricted to service_role. `ON CONFLICT DO UPDATE ... WHERE existing.fetched_at <= excluded.fetched_at` prevents older writes from overwriting newer observations.
- No credentials, account information or user history in this table.
- Deploy ordering: SQL migration first (after review), then branch merge and Railway deployment; backwards-compatible if schema unavailable.

## Server path
`lib/anime-public-metadata-server.ts`:
- batch read up to 30 distinct safe AniList IDs, one Supabase select, with 1200 ms timeout; short-circuit on errors;
- normalize/cache only expected fields; reject malformed IDs/dates/scores rather than mixing identities;
- overlay fresh canonical snapshots onto already selected cards, keeping order and identity;
- batch persist live AniList metadata via merge RPC; no writes on server/client render critical path;
- bounded refresh for saved home groups: at most 24 distinct IDs / one AniList GraphQL `id_in` request, only for missing/stale snapshots; 3s abort; refresh is a best-effort `after()` task; no per-card requests or blocking the page.

`lib/saved-catalog-server.ts`: apply overlays to fallback catalog pages and saved metadata batches; no auth or RLS regressions. Continue to use Shikimori fallback on cache failure.

`lib/anime-route.ts`: successful AniList title response writes a canonical snapshot asynchronously; unavailable AniList title does **not** persist a fallback as AniList.

`lib/home-feed-server.ts`: only after successful verified first-screen feed schedule up to one bounded background batch; failed upstream cannot blank existing cards or poison `unstable_cache`.

## Observability / limiting
- No raw provider payloads or keys logged.
- One batched DB snapshot query per saved page (up to 50 records read in two chunks at most, no N+1).
- Limit scheduled background query to 24 IDs per 5-minute cached home feed. A home request never directly waits for `getAnimesByIds`.
- DB 1200 ms, AniList refresh 3000 ms; read/write errors are fail-open with aggregate warning logging (do not log user data).
- Keep existing home `unstable_cache` revalidate 300 seconds; no new client bundle imports.
- Existing saved catalog order based on Shikimori rank is unchanged; Patch 30.4 standardizes displayed score and episodes, not rankings.

## Test matrix
1. AniList 93/100 -> 9.3; 90 -> 9.0; unknown != 0.
2. Saved score 8.0 vs canonical 9.3 -> 9.3 on home / catalog.
3. Fresh snapshot with null score -> null, not old Shikimori 8.0.
4. TTL-expired snapshot -> preserve saved fallback and queue refresh.
5. Same AniList ID only; MAL ID never used for cache overlay.
6. Two anime IDs cannot mix scores.
7. Nonnegative episodes aired, positive planned totals, inconsistent values do not create playable episode links.
8. Stable card order / field preservation (cover/title/slug/availability).
9. Empty/missing schema/timeout fails open; page responds from previous path.
10. Batch requests remain bounded, duplicates collapsed.
11. Concurrent stale writes cannot overwrite newer ones in DB.
12. TypeScript, relevant source guards, search fallback test, home verified cache, GitHub Quality Gate, Next build.
13. Mobile 320/360/390/430, 768, desktop 1440/1920: score labels fit; no CSS changes expected.

## Rollout / rollback
1. Review SQL and security grants, test on staging if available; apply additive migration to production before merging.
2. Merge one green PR, allow Railway `main` auto-deploy. Check correct SHA, logs, HTTP 2xx and 5xx rate, card score parity, SQL row counts.
3. During initial warmup older fallback scores can persist until the first cache refresh. No assertion of immediate absolute parity for all titles.
4. Code rollback: Railway redeploy previous successful image or revert merge; new table remains harmless and locked.
5. Database rollback generally unnecessary and risky; remove table only after confirming no running code references it.
6. Stop immediately on DB permissions leak, increased 5xx, failed build, expensive repeated provider refreshes or blank home cards.

## Delivery
- Full changed-file list in PR, pre/post root cause and how to reproduce.
- No migration applied, main merge or Railway deployment unless specifically authorized.
