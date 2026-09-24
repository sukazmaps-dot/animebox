# Patch 17.9 — Search Intelligence 2.0 + SEO 2.0

## Search behavior

AnimeBox now resolves title searches through a hybrid lexical pipeline:

1. normalized exact title;
2. prefix / unfinished title;
3. aliases, RU/EN/Romaji/native synonyms;
4. keyboard-layout and transliteration variants;
5. Postgres pg_trgm similarity;
6. provider fallback only when the local corpus is weak.

Natural-language discovery additionally extracts genre/context concepts and
searches indexed descriptions/tags before merging provider recommendation,
genre and tag pools.

The search corpus is incrementally enriched by real catalogue/discovery
traffic. pgvector storage and the semantic RPC are provisioned for later
embedding backfill, but Russian context search never depends on an
English-only embedding model.

## Live catalogue UX

- catalogue results settle after a 200ms debounce;
- stale requests are cancelled with AbortController;
- global search suggestions use a separate 180ms abortable request;
- suggestions are capped at six visible items;
- local indexed candidates are preferred so typing does not fan out provider
  requests;
- search analytics record settled queries, context queries, zero-result states
  and suggestion clicks.

## SEO boundary

Only stable curated discovery URLs are indexable:

- /search
- /anime/ongoing
- /anime/genre/{curated-genre}
- /anime/year/{year}

Any /search URL containing query/filter/view state receives noindex,follow and
canonical /search. This prevents typo, fuzzy, semantic and filter combinations
from creating crawl traps or duplicate index pages.

Stable landing pages server-render their first anime batch and expose
CollectionPage + ItemList + BreadcrumbList structured data. The root sitemap
lists curated genres, current/recent years and the ongoing landing without
calling AniList during sitemap generation.
