# Patch 24 — SEO Organic Growth Engine

## Goal

Patch 24 turns the existing AnimeBox SEO foundation into a stronger organic
acquisition system without creating crawl traps, thin programmatic pages, or
extra provider load during builds.

The existing production baseline already contains canonical anime URLs,
quality-gated anime/episode indexes, sharded sitemaps, recent/video sitemaps,
SSR title pages, breadcrumbs, structured data, noindex rules for dynamic search
states, and SEO regression checks. This patch extends that architecture instead
of replacing it.

## Phase A — Curated discovery landing pages

### Studio landing pages

Add canonical server-rendered routes:

- `/anime/studio/mappa`
- `/anime/studio/studio-ghibli`
- `/anime/studio/madhouse`
- `/anime/studio/wit-studio`
- `/anime/studio/bones`
- `/anime/studio/kyoto-animation`
- `/anime/studio/ufotable`
- `/anime/studio/toei-animation`
- `/anime/studio/cloverworks`
- `/anime/studio/a-1-pictures`

Only the curated studio registry is indexable. Unknown slugs resolve to 404 and
must never create arbitrary indexable pages.

Each landing must provide:

- SSR H1 and explanatory copy;
- canonical metadata;
- index/follow robots metadata;
- Open Graph metadata;
- `CollectionPage`, `ItemList` and `BreadcrumbList` through the shared
  `SeoAnimeLanding` component;
- direct crawlable links to anime pages;
- an ISR window to avoid unnecessary provider load.

### Seasonal landing pages

Add canonical routes in the shape:

`/anime/season/<winter|spring|summer|fall>/<year>`

Only a bounded recent season window is indexable:

- current year and four previous years;
- next winter becomes valid in Q4 so pre-season discovery can start without
  exposing every arbitrary future year.

Unknown seasons and out-of-window years return 404/noindex behavior rather than
creating an infinite programmatic SEO surface.

Each season landing is server-rendered, canonical, crawlable and uses the same
structured-data component as genre/year/ongoing landings.

## Phase B — Catalog crawl graph

The clean `/search` catalogue URL stays indexable while query/filter variants
remain `noindex,follow`.

Improve the clean catalogue metadata with a specific title and description.

Add a visible internal-link section that connects the catalogue to:

- ongoing anime;
- the current seasonal landing;
- curated genres;
- curated studios;
- recent year archives.

This gives bots and users a normal HTML navigation graph instead of relying on
sitemap discovery alone.

## Phase C — Sitemap expansion

Keep provider APIs out of `app/sitemap.ts`.

Extend the root sitemap only with deterministic local URLs:

- studio landings;
- bounded season landings;
- the copyright/trust page.

Anime and episode URLs continue to come from the Supabase-backed sitemap
registries, preserving the existing anti-429 architecture.

## Phase D — IndexNow delta notifications

Add an IndexNow verification key as a root public file and a server-only client.

The notifier must:

- submit only same-origin AnimeBox URLs;
- deduplicate URLs;
- strip fragments;
- cap one request to the IndexNow 10,000-URL protocol limit;
- use a hard network timeout;
- treat IndexNow as best-effort so crawler notification can never break the SEO
  indexing cron.

Extend the SEO anime registry writer to expose changed slugs. On each cron run,
collect only URLs whose indexed content fingerprint changed. If a canonical slug
changed, include the previous slug as well so crawlers can discover the redirect.

The cron then submits those changed URLs to Yandex IndexNow. A failed IndexNow
request is observable in the cron summary but does not fail the indexing job.

## Phase E — Regression shield

Add `npm run patch24:check` and include it in `prebuild`.

The check verifies:

- studio and season registries exist;
- only bounded seasonal URLs are generated;
- catalogue discovery links remain crawlable;
- studio and season pages keep canonical/indexable metadata;
- sitemap exposure remains wired;
- IndexNow host/key/timeout/url-limit invariants remain present;
- the SEO index continues to expose changed slugs;
- the cron continues to submit those deltas.

## Non-goals

Patch 24 does not:

- make arbitrary search-result URLs indexable;
- generate thousands of combinatorial filter pages;
- call AniList from sitemap generation;
- remove existing episode/video SEO;
- weaken copyright restrictions or noindex behavior;
- claim that IndexNow guarantees indexing or ranking.

## Expected effect

The patch increases the number of useful entry points for queries around anime
studios and seasonal discovery, improves internal crawlability, and shortens the
time between meaningful AnimeBox title updates and Yandex learning that those
URLs changed.

Organic growth still depends on content quality, demand, crawl/index decisions,
competition and user behavior; this patch improves the technical acquisition
surface rather than manufacturing traffic.
