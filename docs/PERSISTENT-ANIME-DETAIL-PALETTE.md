# Persistent anime detail and shared palette

## Problem and acceptance criteria

An existing public URL such as `/anime/sousou-no-frieren/episode/1` must not become a 404 after a deployment loses the local SQLite registry. Read-only inspection confirmed that `anime_search_documents` contains anime 154587, that exact slug and a 792-character description; the SEO index also contains its ID-bearing slug.

The resolver must use a persistent catalog when the local registry and stable ID parser cannot resolve a URL. Exact matches take priority. A legacy base may match `base-ID` only when the complete suffix equals the candidate anime ID and there is one distinct ID. Ambiguous/overflowing candidates remain unresolved. Invalid slugs never reach SQL. Catalog failures must not be silently converted to a definitive missing page. Queries use projections, a 21-row ceiling and three-second abort signals; no tables or access policies change.

Detail enrichment must use stored Shikimori fields even when AniList has returned a partial object. Persisted Russian catalog descriptions and already complete Russian provider descriptions retain priority. Cached description, studio, format, year and episode count can recover without a live Shikimori request. A stored non-Russian description is still usable when the provider description is empty. Missing information is not invented.

Public chrome must consume the shared `--ab-ui-*` palette in both themes. Poster colors must not recolor series navigation or readable labels. The banner overlay must follow the current theme instead of forcing black. Core text and subdued labels checked by the browser must reach a 4.5:1 contrast ratio and pages must not overflow at 390 and 1440 pixels.

## Color ownership audit

| Area | Palette owner / handling |
| --- | --- |
| Shared navigation, home, catalog | Shared UI tokens; original legacy `--ab-surface-*`, text and iris definitions now alias the same tokens |
| Schedule, tracker, rating, Watch Together, Telegram promotion | Shared-card consistency patch #193; regression check repeated here |
| Anime detail, facts, banner, episode navigation/completion | Route-owned `anime-route-palette.css`; theme-aware surfaces, labels and accent |
| Premium plans, benefits, support story, Boosty | Same route-owned sheet; legacy backgrounds and primary/secondary actions overridden |
| Settings | Component module owns theme choices, labels, panels and actions; enough specificity to beat old light-theme overrides |
| Friends | Semantic token utilities replace slate text and blue-black panels; friendship behavior unchanged |
| Achievements and journey | Component modules use common surfaces, primary text, muted labels and accent |
| Chat | Module changes chrome/composer/text; customized nickname effects and connection/error states remain separate |
| Not found | Local module aligns the card, heading, explanation and eyebrow |
| Customized profiles / Premium style demonstrations | Deliberately retain user-selected colors and illustrated scenes |
| Kodik iframe | Provider-owned rendering; this patch changes the AnimeBox shell only |
| Administrative tools | Not restyled by this public-interface patch |

No new root CSS import is added. The legacy foundation source changes instead of accumulating another root override layer. Root architecture check: 76 imports, 829701 bytes.

## Verification

- `node tests/persistent-anime-route.cjs`: exact recovery, stable alias, season-prefix exclusion, ambiguous exact/prefix matches, overflow, missing/invalid slugs, partial outage.
- `node tests/anime-detail-persisted-metadata.cjs`: offline cached details, catalog priority and preservation of a complete Russian description.
- Full `npm run build` prebuild gates passed. Initial TypeScript mismatch was corrected; production `next build` repeated successfully.
- ESLint for modified TS/TSX: no errors, existing image warnings only.
- `scripts/page-consistency-smoke.mjs`: 30 route/theme/viewport combinations for the prior patch.
- `scripts/section-palette-smoke.mjs`: guest Premium/friends pages and built CSS fixtures for authenticated settings/achievements and dynamic anime/episode chrome. It checks selected rendered labels in both themes at 390/1440 px. Authenticated mutations, live payments, provider iframe playback and every possible user profile theme are outside this visual fixture test.

## Release

This patch is stacked on #193. Merge #193 first, then retarget this PR to main. After deployment, verify the original Frieren episode URL, an anime with saved metadata, a signed-in settings/friends page, and Premium in both themes. No secret rotation, schema migration or DNS change is needed. Do not treat the fixture tests as confirmation that production has already received these changes.
