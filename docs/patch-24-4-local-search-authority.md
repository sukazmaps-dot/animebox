# Patch 24.4 — Local Search Authority & Self-Healing Index

## Goal

Turn the fast local search introduced in Patch 24.2 into a durable local
authority for the first search experience.

The first visible result must no longer depend on AniList/Shikimori for card
metadata that AnimeBox already knows locally.

Patch 24.4 has two linked goals:

1. make local search hits rich enough to render useful AnimeCard metadata;
2. make the catalog -> search-index projection self-healing and observable.

## Current problem

Patch 24.2 returns local cards quickly, but the legacy search RPC only exposes:

- anime id;
- title;
- slug;
- poster;
- genres;
- match diagnostics.

Therefore the first card can temporarily show generic values such as:

- "Аниме";
- "Эпизоды уточняются";
- no year.

The provider enrichment eventually fixes that, but the user still sees a
visible quality jump.

The search index also relies on triggers and historical indexing calls. A past
deployment, a missing trigger execution or a partial rollout can leave holes
between `anime_catalog` and `anime_search_documents`.

## Phase A — Rich search document schema

Extend `public.anime_search_documents` with catalog-card metadata:

- `studios text[]`;
- `format text`;
- `start_year integer`;
- `total_episodes integer`;
- `finished boolean`;
- `catalog_metadata_version smallint`;
- `catalog_updated_at timestamptz`.

The table remains server-only. RLS and service-role-only search RPC access are
not relaxed.

## Phase B — Catalog projection trigger

Replace `sync_anime_catalog_search_document()` so inserts/updates in
`anime_catalog` project the card fields into the search document.

Trigger coverage includes:

- title;
- slug;
- genres;
- studios;
- format;
- start year;
- total episodes;
- finished state;
- poster;
- catalog updated_at.

The trigger must preserve richer search-only data already accumulated from
provider indexing:

- aliases;
- tags;
- description.

It must rebuild `search_text` from canonical fields instead of repeatedly
concatenating old `search_text`, otherwise repeated catalog syncs would make
the document grow without bound.

## Phase C — One-time full backfill

The migration backfills every current `anime_catalog` row into
`anime_search_documents`.

Existing search documents are updated in place while preserving aliases, tags
and description.

This means the deployment does not wait for future user traffic to obtain rich
metadata.

## Phase D — Lexical ranker v3

Add `search_anime_hybrid_lexical_v3(query_text, match_count)`.

Ranking behavior remains based on the proven v2.1 rules:

- exact title/alias dominance;
- prefix matching;
- contains matching;
- fuzzy matching;
- keyboard/transliteration fallback at the application layer;
- title-shape tie-break;
- bounded match count.

v3 additionally returns:

- studios;
- format;
- start_year;
- total_episodes;
- finished;
- catalog_metadata_version.

The RPC remains `security definer`, revoked from public/anon/authenticated and
granted only to service_role.

## Phase E — Safe staged rollout

Application code calls v3 first.

If Supabase has not received the Patch 24.4 migration yet:

1. v3 reports a missing-function/schema-cache error;
2. server automatically retries v2.1;
3. legacy v1 remains the final fallback.

Provider search-document upserts also attempt rich columns first and retry the
legacy payload when the new columns are not yet visible in PostgREST schema
cache.

This prevents a deployment-order outage.

## Phase F — Rich AnimeCard shells

`LocalAnimeSearchHit` gains:

- studios;
- format;
- startYear;
- totalEpisodes;
- finished;
- catalogMetadataVersion.

`localAnimeSearchHitToAnime()` maps these into the shared Anime type so the
instant first paint can already show:

- year;
- format;
- episode count;
- studios where relevant;
- finished status semantics.

Provider enrichment remains the authoritative second layer for fields the
catalog does not store, such as ratings or richer detail metadata.

## Phase G — Instant response quality

`/api/search/instant` stays provider-free.

It now returns:

- `source: local-index-v3`;
- `richItems`;
- `richSharePct`;
- existing server timing;
- existing lexical match diagnostics.

`richSharePct` becomes part of first-result performance telemetry so AnimeBox
can distinguish "fast but sparse" from "fast and complete".

## Phase H — Self-healing SQL repair

Add `repair_anime_search_documents_v1(p_limit)`.

The RPC finds bounded missing/stale search documents by comparing:

- document existence;
- metadata version;
- catalog sync timestamp;
- title/slug;
- genres/studios;
- format/year/episodes/finished;
- poster.

Only the bounded candidate batch is upserted.

The repair function does not call any external provider.

## Phase I — Daily maintenance job

Add `/api/cron/search-index-maintenance`.

The cron:

- requires cron authorization;
- uses `beginOperationalJob()`;
- respects background-job disable/brownout controls;
- uses a runtime lease to prevent duplicate workers;
- repairs a bounded batch;
- records system job success/degraded/failure telemetry;
- treats a missing Patch 24.4 DB migration as degraded rollout state, not a
  destructive failure.

The Vercel schedule runs once daily after catalog availability and before SEO
maintenance.

## Phase J — Manual admin recovery

Add:

`POST /api/admin/search-performance/repair`

Security:

- owner/admin only;
- `requireAdminMutation`;
- existing admin rate limits;
- audit event `search_index_repaired`.

The Search Performance dashboard gets a "Починить индекс" control for manual
recovery.

## Phase K — Coverage diagnostics

Search Performance distinguishes:

### Index coverage

`anime_search_documents / anime_catalog`

Answers: "Does a local search document exist?"

### Rich metadata coverage

Catalog-synchronized search documents with actual card metadata divided by
catalog rows.

Answers: "Can the local result render a useful card without provider
enrichment?"

The dashboard also shows:

- rich document count;
- latest search document update;
- latest catalog metadata sync;
- average rich-card share observed in real instant-search first results.

## Phase L — Health policy

Search health continues to consider first-result p95 and index coverage.

Patch 24.4 additionally considers rich metadata coverage:

Critical:
- first-result p95 > 1500 ms; or
- index coverage < 70%; or
- rich coverage < 70%.

Warning:
- migration not ready; or
- first-result p95 > 700 ms; or
- index coverage < 90%; or
- rich coverage < 90%.

## Phase M — Performance rules

The user hot path must not run repair work.

For a healthy common title query:

- one local lexical RPC;
- zero provider calls before the instant result;
- availability filtering remains intact;
- provider enrichment proceeds independently.

Repair is cron/admin/background only.

## Phase N — Regression requirements

Patch 24.4 must preserve:

- fuzzy typo search;
- keyboard layout correction;
- transliteration recovery;
- exact alias ranking;
- Smart Discovery;
- availability filtering;
- AbortController;
- stale request generation guards;
- provider fallback;
- existing search analytics/privacy rules.

## Database rollout

One migration is required:

`supabase/migrations/20261001133000_patch24_4_local_search_authority.sql`

The application remains functional before the migration through the v2.1
fallback, but full Patch 24.4 behavior requires applying it.

## Acceptance criteria

1. Common instant hits carry year/format/episodes when the catalog knows them.
2. Instant search performs no external anime-provider call.
3. v3 missing-function rollout falls back to v2.1.
4. Rich search upsert falls back to legacy columns before migration.
5. Full backfill preserves aliases/tags/description.
6. Repeated catalog sync does not cumulatively append old search_text.
7. Catalog updates refresh rich search metadata automatically.
8. Repair RPC fixes missing/stale documents in bounded batches.
9. Cron uses auth, operational job controls and system observer.
10. Admin repair uses admin mutation boundary and audit log.
11. Search Performance reports both index and rich coverage.
12. First-result telemetry records rich-card share without raw query text.
13. Search remains available when repair telemetry or maintenance is down.
14. Patch 24.4, Patch 24.3, Patch 24.2, search intelligence, security,
    TypeScript and production build pass before merge.
