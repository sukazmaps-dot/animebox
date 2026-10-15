# AnimeBox Patch 30.5 — SEO Index Integrity & Canonical Recovery

**Scope:** additive, bounded synchronization of the public anime catalog into the existing SEO registry. Independent of PR #234 (metadata) and PR #235 (player); branch from production `main`. **Do not deploy or apply production DB changes without review.**

## 0. Grounded diagnosis — 15 Oct 2026

Google Search Console export `youranimebox.com-Coverage-Drilldown-2026-10-15.xlsx` contains 1,000 sample URLs in the `Excluded by noindex` group out of 1,192 in GSC. The visible sample breaks down as: 535 `/anime/.../episode/N`, 342 `/login?next=...`, 115 `/anime/.../watch`, 7 anime detail pages, 1 chat. These are *not* 1,192 proven SEO bugs: login, chat, dynamic states, unverified/restricted episodes legitimately use noindex; `/watch` redirects to `/episode/N`.

Read-only database audit (observed, not predicted):
- `anime_catalog`: 1,660 rows, **608 with no `seo_anime_index` row**.
- `anime_saved_playable_catalog`: 1,077 rows, **435 missing from `seo_anime_index`**.
- `seo_anime_index`: 5,657 rows, all currently indexable in this snapshot.
- `seo_episode_index`: 35,305 confirmed indexable rows, including **16,072 rows across 621 distinct anime IDs without a corresponding `seo_anime_index` parent**.
- `/anime/dragon-ball-super-21175` appears in `anime_catalog` and saved catalog, yet ID 21175 is absent from the SEO anime registry.
- Some old episode slugs differ from current reindexed slugs, e.g. `gintama-9969` vs `gintama-2`.

**Interpretation:** title registry maintenance relies on bounded AniList source shards (70 shards × 500 candidates each, 7 per scheduled run). The playable/local catalogs and confirmed episode registry are maintained independently. A missing SEO parent does not imply a 404 or lack of playback; it *does* mean the sitemap sources can disagree. Historical GSC inspection dates mostly precede October SEO fixes. Re-crawl is necessary before counting persistent live noindex defects.

## 1. Invariants

1. Never strip noindex from `/login`, `/register`, `/chat`, user/account/admin/private routes, unsupported search states, or unverified/restricted episodes merely to reduce the count.
2. No global `robots`/X-Robots-Tag header changes; preserve API noindex and existing anti-index/copyright handling.
3. A title must be backed by a safe, real AnimeBox catalog record with a **positive AniList ID**, nonempty title, valid known slug, and independent metadata evidence (year, format, genres, episodes or safe poster). No guessed title, content, poster, episodes or playable source; no large-scale insertion of raw episode URLs.
4. Respect `shouldIndexAnime` (public named catalogue identity) plus stricter provenance/quality for *catalog repair candidates*; this only controls which local records are inserted to the persistent sitemap registry.
5. Never replace a more complete AniList SEO row with a minimal local catalog row. Do not forcibly overwrite `indexable=false` rows, publisher restrictions, or recently confirmed canonical identities.
6. Authoritative landing URLs are indexable anime details `/anime/:slug` and real, confirmed episode routes `/anime/:slug/episode/:number`. `/anime/:slug/watch?ep=N` should redirect to the real episode route; dynamic login state stays noindex.
7. Sitemap `<loc>`, response canonical, route redirect and internal links should converge on one slug **per AniList ID**, without accepting arbitrary `-ID` variants as canonicals.
8. Provider failure or missing optional DB tables must not turn a useful title into noindex or a blank page.
9. No changes to Kodik, rating, user watch history, registration, RLS or production scheduling secrets.
10. All writes only through existing authorized SEO cron and service-role access, never from public crawler GET.

## 2. Delivery slices

### 30.5.1 — Coverage audit and bounded reconciliation (this PR)
- Implement a pure validator `parseSeoCatalogRecoveryRow` for Supabase `anime_catalog` candidates (ID, canonical title, poster, status, genres, count, year, preferred slug).
- Read catalog in deterministic bounded pages with exactly one query for the page and at most one batched select for existing SEO IDs.
- Do not derive an index entry from a random `seo_episode_index` row without a validated title.
- Insert **missing only** with Supabase `upsert(..., { onConflict: 'anime_id', ignoreDuplicates: true })`; safe under concurrent AniList cron inserts.
- Reuse existing `seo_anime_index` row schema, fingerprint and sitemap shard `anime_id % 70`. Leave `source_shard=-1` for local-only evidence, preserve real `quality_score`.
- Never mutate existing `seo_anime_index` row's content fingerprint, timestamps, slug or indexability.
- Add conservative candidate quality threshold: title + valid slug + `shouldIndexAnime` + minimum one strong factual signal (a real poster, start year, known episodes or nonempty genres); reject default placeholders, malformed slugs, path separators and empty names.
- Add optional scheduled reconciliation to the existing authorized `/api/cron/seo-anime-index` run, **not to sitemap requests**.
- Scheduled repair rotates across stable pages of `anime_catalog` (approx 120 rows per day); support manual authenticated bounded page dry-run and targeted repair for operational recovery.
- Keep the existing 7 source-shard daily work and 50s budget; skip reconciliation if no safe time remains. Never create a new cron or N+1 external API calls.
- Report scanned/eligible/existing/created/rejected/error totals; avoid leaking query token or private data.
- No migration required; reuse existing schema and grants.

### 30.5.2 — Canonical identity and episode parent integrity (audit first)
- Join confirmed `seo_episode_index` episodes by AniList ID to current parent slug before publication, without one DB call per episode. Plan the required DB view/RPC and index for a separate audited migration only if measurements warrant it.
- Do not mass-delete the 16,072 orphan episode entries before verifying parent recoverability; add parent coverage metrics first.
- Where a parent is eligible, preserve historical legacy-slug 308/307 redirect (currently Next.js `permanentRedirect`) to a *single* vetted canonical; do not redirect between competing variants.
- Ensure canonicals in metadata and sitemap match for 10 sampled GSC URLs; avoid 200 on made-up slugs.
- Avoid making a confirmed episode unindexable merely because Kodik times out or the provider temporarily returns `unknown`; keep current copyright checks.
- The episode index and video sitemap must never advertise a currently blocked episode.

### 30.5.3 — Search Console and production QA
- Audit one representative URL of each GSC type (7 anime detail, 10 episodes, redirects, login) via ordinary GET + browser; compare HTTP code, meta robots/Googlebot, canonical, rendered identity and Sitemap presence.
- Verify `/robots.txt`, `/sitemap-index.xml`, anime shard, episode shard, and video sitemap are available without authentication and never respond with fake success on failure.
- Issue Google Search Console live URL checks and validate fix **only** for historically erroneous noindex URLs; do not request indexation for login/chat.
- Measure baseline before release and 24h/7d/14d after release: 5xx, indexable title counts, parentless episodes, actual GSC indexed URLs, impressions, sitemap errors, p95 home and title TTFB.
- Monitor `seo_anime_index` writes, shard budget, cache churn, IndexNow sizes and provider rate limits.

## 3. Data contract and guardrails

Existing tables:
- `anime_catalog(id,title,slug,total_episodes,finished,genres,poster_url,format,start_year,...)`.
- `anime_saved_playable_catalog(anime_id,slug,title,poster_url,provider_status,...)`.
- `seo_anime_index(anime_id,slug,title,image_url,status,source_shard,sitemap_shard,quality_score,indexable,content_fingerprint,last_content_change_at,last_verified_at,updated_at)`.
- `seo_episode_index(anime_id,episode_number,slug,indexable,first_available_at,last_confirmed_at,...)`.

Source shard (-1) means a verified local-only backfill, distinct from AniList shard 0..69. Indexing remains governed by title eligibility and quality; backfill never asserts an episode was playable. The source cron later enriches missing content when AniList is available.

**Batching:** `CATALOG_PAGE_SIZE=120`, exactly one source page and one indexed-ID read, at most one batch insert per run. `limit <=120` and parameter validation. 10s local repair budget; skip if main job < 12s remains. A request without the signed cron secret must get HTTP 401 and perform zero writes.

**Concurrency:** `ignoreDuplicates: true` protects existing AniList rows even when they appear between read and insert. Empty batches perform no write. Unknown database failure returns 500 for the authorized cron (operators can retry); **public pages and sitemaps must not be modified or fail closed because a cron job failed.**

**Manual inspection:** optional `?catalogRepair=1&catalogPage=N&dryRun=1` behind existing cron authentication and operational lease; dry-run must do no write. Scheduled rotation uses a UTC day page selection with deterministic modulo count.

## 4. Acceptance tests

A. 608 missing / 435 missing / 621 parentless are **baseline audit values**, not mandatory target counts on day one; no inflated success claims.
B. Dragon Ball Super ID 21175 and several GSC titles are eligible for real catalogue recovery when encountered; unavailable noncatalog IDs are not invented.
C. Valid title + metadata + slug -> correct ID, title, poster, status, fingerprint, stable shard.
D. Numeric MAL IDs are never used as the AniList primary key.
E. Invalid ID, title, path-like slug, blank poster/year/genres/count stub, excluded title -> no new index row.
F. Existing indexable=false/restricted or existing AniList record -> untouched.
G. Two concurrent repair runs cannot overwrite each other, because DB insert ignores duplicates.
H. 120 candidate limit holds even for large tables and a manual page.
I. Unauthorized GET/POST, invalid input, exhausted lease/budget -> no DB writes.
J. Scheduled cron source shards and IndexNow unchanged and don't require a new env variable.
K. Snapshot of legitimate login/chat/auth `noindex` rules unchanged.
L. Schema/table migration **not required** for first slice.
M. `npm run patch30-5:check`, `npx tsc --noEmit`, lint on touched files, `npm run build` and full GitHub Quality Gate green.
N. Production canary: 5XX not higher than baseline; sitemap links match valid IDs, no mass publishing of thin/blocked episodes.

## 5. Release and rollback

- PR and CI first; no production database mutation in this development work.
- Operator manually invokes authorized `?catalogRepair=1&catalogPage=...&dryRun=1` and reviews counts; a separate explicit approval is required for production writes and merge/deploy.
- Merge one green PR into `main`; Railway automatically deploys production. Check exact SHA, logs and p95.
- If any regression: revert merge and redeploy last healthy Railway image; local-only inserted SEO index entries can be quarantined by `source_shard=-1` after review. Never blind-delete existing AniList rows or orphan episodes.
- Google re-crawl may require days/weeks; no guaranteed instant organic uplift or 0 excluded URLs.
