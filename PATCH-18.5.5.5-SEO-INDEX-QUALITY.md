# Patch 18.5.5.5 — SEO Index Quality & Crawl Intelligence

## Mission

AnimeBox already has strong page-level SEO:

- canonical title URLs and permanent redirects from stale slugs;
- quality-gated `index/noindex` metadata for anime pages;
- provider-confirmed episode indexing;
- `TVEpisode` + `VideoObject` structured data;
- episode and video sitemaps;
- curated genre/year/ongoing landing pages;
- arbitrary catalogue filters kept `noindex,follow`;
- copyright-aware episode suppression.

The remaining architectural weakness was the **crawler discovery layer**.

Before this patch, every `/anime/sitemap/{id}.xml` request could call AniList directly. That created three problems:

1. crawler traffic could become upstream traffic;
2. sitemap eligibility was not guaranteed to use the same quality gate as page metadata;
3. `lastmod` came from AniList's generic `updatedAt`, not from an AnimeBox SEO-content change.

Patch 18.5.5.5 moves AnimeBox from a provider-projected sitemap to a **local canonical SEO index**.

---

## 1. Canonical SEO anime registry

New table:

`public.seo_anime_index`

The row is keyed by AniList `anime_id` and stores:

- canonical AnimeBox slug;
- page heading/title;
- representative image;
- release status;
- background source shard;
- stable sitemap shard;
- SEO quality score;
- `indexable`;
- SEO content fingerprint;
- `last_content_change_at`;
- `last_verified_at`;
- audit timestamps.

### Stable sitemap sharding

`sitemap_shard = anime_id % 70`

This means adding/removing one title does not reshuffle thousands of other URLs between sitemap files.

### Security boundary

The registry is server infrastructure, not a browser API.

- RLS enabled;
- no grants for `anon` or `authenticated`;
- service role receives only SELECT/INSERT/UPDATE/DELETE;
- service-role-only policy is present as defense in depth and to keep advisor output clean.

No user-specific data is stored.

---

## 2. Shared page/sitemap quality gate

`lib/anime-seo.ts` now exports:

`animeSeoQualityScore(anime)`

`shouldIndexAnime()` delegates to the same score.

The background registry uses the exact same scorer.

Current signals remain:

- meaningful description;
- release year;
- known episode count;
- genres;
- usable artwork;
- `catalogEligible !== false`.

Required score remains `>= 2`.

This prevents the page metadata and the sitemap registry from developing separate SEO definitions.

---

## 3. One canonical slug contract

Production Vercel routes historically generated deterministic slugs from the title + AniList id.

That logic is now centralized in:

`stableAnimeSlug(id, title)`

Both:

- runtime `anime-registry.ts`;
- SEO registry source ingestion;

reuse this helper.

Examples:

- `Jigokuraku` / `128893` → `jigokuraku-128893`
- `Sousou no Frieren` / `154587` → `sousou-no-frieren-154587`

The regression gate executes these canonical cases.

---

## 4. Crawler isolation

Before:

`Googlebot → anime sitemap → AniList GraphQL`

After:

`Googlebot → anime sitemap → seo_anime_index`

`app/anime/sitemap.ts` is forbidden from importing or calling the AniList SEO source.

If the registry/database is temporarily unavailable, the sitemap shard returns an empty result and logs the failure. It does **not** fall back to hammering AniList.

This is deliberate crawl backpressure.

---

## 5. Background source verification

`lib/seo-anilist.ts` is no longer a crawler-time sitemap generator.

It is a background registry source.

Each source shard fetches up to:

- 10 AniList aliased pages;
- 50 titles per page;
- 500 candidates.

The query is restricted to `countryOfOrigin: JP`, matching the public AnimeBox catalogue boundary, and includes the fields needed by the real AnimeBox quality gate:

- title;
- description;
- year;
- genres;
- episodes;
- format;
- status;
- artwork.

Requests go through the common `fetchWithRetry()` layer introduced into the upstream pressure shield, so SEO crawling does not bypass the AniList concurrency/circuit protection.

---

## 6. Daily registry refresh

New protected job:

`/api/cron/seo-anime-index`

Vercel schedule:

`53 4 * * *`

The job processes seven source shards sequentially.

With 70 source shards, one complete source cycle takes ten scheduled runs.

Sequential execution is intentional:

- one cron cannot create an AniList burst;
- each GraphQL call is still protected by the upstream budget/circuit;
- writes are chunked before Supabase upsert.

The route also accepts an authenticated `sourceShard` query parameter for surgical operator repair/testing. An unauthenticated request cannot trigger the job.

---

## 7. Background-only writes

SEO registry writes deliberately stay off user-facing metadata/playback paths.

This prevents two independent enrichment sources (raw AniList vs localized Shikimori data) from alternately overwriting the registry and creating fake `lastmod` churn.

The registry is therefore refreshed only by the bounded background source job. User requests read normal application data and do not mutate crawl state.

---

## 8. Accurate `lastmod`

The registry calculates a SHA-256 fingerprint from SEO-relevant content:

- canonical slug;
- titles/localized title fields;
- description;
- episodes;
- status/format;
- genres;
- year;
- representative image;
- catalogue eligibility.

`last_content_change_at` changes **only when that fingerprint changes**.

A verification that returns identical content updates `last_verified_at`, not `last_content_change_at`.

Anime sitemap `lastModified` comes from `last_content_change_at`.

This prevents meaningless crawl signals from timestamps that changed for provider-internal reasons.

---

## 9. Bootstrap strategy

The migration does not deploy an empty sitemap registry.

It immediately seeds already-known AnimeBox metadata from:

- `anime_search_documents`;
- `anime_catalog`.

The live migration seeded:

- 381 canonical/indexable titles;
- all 70 sitemap buckets populated.

The daily source scan then expands this registry toward the full long-tail inventory without making crawler requests wait on AniList.

---

## 10. Sitemap index

New route:

`/sitemap-index.xml`

It lists:

- `/sitemap.xml`;
- `/video-sitemap.xml`;
- all anime sitemap shards;
- all episode sitemap shards.

`robots.txt` now advertises this single sitemap index instead of expanding roughly ninety child sitemap URLs inline.

The child sitemap architecture remains compatible with already-known URLs.

---

## 11. Search/facet boundaries

The patch intentionally does **not** create arbitrary filter landing pages.

Existing behavior remains:

- clean `/search` can be indexed;
- arbitrary query/filter states are `noindex,follow`;
- curated genre/year/ongoing routes remain indexable.

This avoids turning combinations of genre/year/status/tag/studio/search into an effectively infinite thin-index surface.

---

## 12. Episode/video SEO

Existing provider-confirmed episode rules remain unchanged.

System Health now additionally reports:

- indexable anime titles;
- quality-noindex titles;
- stale anime registry rows;
- indexable episode rows;
- stale episode confirmations;
- video sitemap entry count;
- latest anime registry verification.

A stale row is an operational freshness warning, **not automatic proof that the URL should be deindexed**. Finished episodes can remain valid for long periods and must not disappear merely because nobody opened them recently.

---

## 13. Watch Together structured data cleanup

The old `FAQPage` block has been removed from Watch Together.

The normal `WebPage` structured data remains.

The page's useful visible explanatory content is kept; the patch only removes the obsolete rich-result-oriented markup.

---

## 14. Regression gate

New command:

`npm run patch18-5-5-5:check`

It verifies:

- `seo_anime_index` migration, RLS and grants;
- service-role least privilege;
- crawler-facing anime sitemap has no AniList dependency;
- sitemap index contains root/video/anime/episode maps;
- robots advertises only the sitemap index;
- page and registry share `animeSeoQualityScore`;
- canonical slug helper is shared by runtime routes and SEO ingestion;
- AniList registry source goes through bounded retry/upstream protection;
- 7-shard daily schedule covers all 70 shards in one ten-run cycle;
- System Health exposes SEO inventory;
- retired FAQ schema cannot reappear;
- package/prebuild wiring is intact.

The gate also executes representative canonical slug cases.

---

## 15. Database release

Live migrations:

- `20260925220358 seo_index_quality_v1`
- `20260925220504 seo_index_quality_grants_hardening`
- `20260925221156 seo_index_quality_drop_unused_changed_index`

The second migration exists because the project's historical default privileges initially left service_role with broader table privileges than the registry requires. The hardening migration explicitly reduces it to CRUD. The third removes a speculative `last_content_change_at` index after review showed no production read path for it; only the sitemap and freshness indexes remain.

---

## 16. Invariants that must not regress

- copyright-restricted episodes never re-enter episode/video sitemaps;
- arbitrary search filters remain noindex;
- sitemap requests never create AniList/Shikimori traffic;
- sitemap and page quality logic share one scoring function;
- no browser role can access `seo_anime_index`;
- `lastmod` is not refreshed merely because a crawler requested a sitemap;
- a transient upstream outage does not mass-deindex titles;
- registry writes remain background-only and never enter normal user-facing title/community flows;
- canonical slug + permanent redirect + sitemap URL stay on one contract.

---

## 17. Rollout expectations

Immediately after deployment:

1. all 70 anime sitemap shards read from the local registry;
2. the bootstrap rows are available without waiting for AniList;
3. the scheduled source scanner starts expanding/refreshing the inventory;
4. user-facing title/playback requests do not mutate crawl state;
5. System Health shows index coverage/freshness.

A full background pass through all 70 AniList source shards takes ten successful daily runs at the configured cadence.

This is intentional: SEO discovery is background work and must never compete with playback/user traffic.

---

## 18. Release gates

Before merge:

- package.json parse;
- `patch18-5-5-5:check`;
- existing 18.5.5.x regression chain;
- TypeScript/Next production build when Vercel capacity permits;
- Supabase Security Advisor;
- Supabase Performance Advisor;
- live service-role CRUD verification;
- live registry row/shard verification;
- GitHub diff review for accidental crawler-time upstream calls.

Vercel build-rate-limit must continue to be reported separately from an application compile error.
