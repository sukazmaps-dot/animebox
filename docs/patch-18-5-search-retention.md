# Patch 18.5 — Search, Recommendations & Retention

## 18.5.1 — Search Continuity & Mobile Image Quality

### Catalog/search continuity
- Use provider pagination metadata instead of guessing from `items.length === 20`.
- Keep request aborts and sequence guards so stale responses cannot overwrite newer filters or queries.
- Accumulate later catalog pages and dedupe by Anime ID.
- Load the next page near the end of the result set, with an explicit “Показать ещё” fallback.
- Reset query/filter changes to page 1.
- Keep Cyrillic/Shikimori pagination conservative when native PageInfo is unavailable.

### Mobile poster sharpness
- Do not use AniList `medium` as the primary source for compact cards.
- Feed a sufficiently detailed `large` source into the AnimeBox media Worker.
- Generate/cache responsive WebP card variants at 240/360/540/720 widths.
- Use 360px / q70 as the default card variant for high-DPR phones.
- Keep `medium` only as a bounded fallback.

### Guardrails
- No Hero/LCP changes.
- No per-card IntersectionObserver.
- No original-size poster downloads for normal cards.
- Preserve native lazy loading, async decoding and the existing media edge/R2 path.
- Run 15 regression scenarios plus the existing AnimeBox Quality Gate.

## Remaining 18.5 work
1. Search relevance: aliases, typo/fuzzy/transliteration precision and ranking diagnostics.
2. Recommendation exclusions, diversity, franchise suppression and stronger session intent.
3. Exposure → open → watch → return analytics with recommendation/session/version identifiers.
4. Retention ranking and re-entry surfaces driven by watch history, saved titles and Taste Graph.
5. Load/caching budgets for thousands of users, then full build and production verification.
