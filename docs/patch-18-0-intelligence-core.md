# AnimeBox 18.0 — Intelligence Core

## Goal

Unify Search, Smart Discovery, Taste Graph and Personal Home behind one
predictable intelligence layer. Exact relevance always wins; personalization
only resolves close choices. The system must explain what it understood and
must fail softly when local corpus/provider metadata is incomplete.

## Search modes

- title: short/normal title queries, aliases, translit, keyboard-layout and typo tolerance.
- structured: title plus season/part/episode markers.
- context: natural-language constraints, "similar to", exclusions, episode/year bounds and plot-like phrasing.

Context mode is deliberately gated. A short title query must never trigger the
heavier discovery path.

## Ranking order

1. exact canonical title
2. exact alias/synonym
3. title prefix
4. alias prefix
5. title/alias contains
6. structured continuation hints
7. typo/fuzzy similarity
8. long search_text/context evidence
9. mood/taste tie-break only after relevance

## Search corpus

anime_search_documents stays private. Public/anon/authenticated roles have no
direct table/RPC access. The server uses service_role. Runtime indexing remains
bounded and best-effort; search responses must not fail because an auxiliary
index write failed.

## Corrections

A correction is only emitted on page 1 when the local ranker has a sufficiently
strong non-containing match. Prefix/contains queries such as "фрирен" inside a
long canonical title are not needlessly corrected.

## Suggestions

Local-first, max 6. Provider bootstrap only for title/structured queries with a
specific query and a weak local corpus. Keyboard contract: ArrowDown/ArrowUp,
Enter selects, Escape closes. Stale requests are aborted.

## Context search

18.0 does not claim multilingual vector semantics until a suitable multilingual
embedding model is available. pgvector remains provisioned. Russian contextual
retrieval uses explicit intent parsing, tags/genres/descriptions and bounded
lexical/context ranking.

## Catalog UX

Typing preserves catalog filters. Results refresh in place. URL stays
shareable. Arbitrary query/filter states remain noindex/follow with canonical
/search. Empty states provide correction/constraint relaxation instead of a
dead end.

## Analytics

Capture mode, correction, fallback, local-index use, result count, active
filters and suggestion input method. Analytics is best-effort and never blocks
search.

## Performance

- 160–200 ms client debounce
- max 3 local query variants
- one provider bootstrap for weak suggestions
- bounded provider fallbacks for title search
- AbortController for stale requests
- public short-lived search cache
- no per-keystroke contextual provider fan-out

## Regression corpus

Must cover Russian typos, Latin translit, wrong layout, structured
season/episode intent and representative contextual phrases. The invariant
script blocks regressions in CI.

## Rollout

18.0.1 Search Core: classifier, lexical ranker v2, correction metadata,
suggestions keyboard UX and regression gate.

18.0.2 Discovery Bridge: shared classifier/seed resolution/context contract.

18.0.3 Personal Home: Taste Graph tie-break policy, rail ordering, continuation
health and intelligence analytics.

Database migration required for 18.0.1: search_anime_hybrid_lexical_v2.
