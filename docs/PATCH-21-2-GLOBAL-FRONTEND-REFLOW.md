# Patch 21.2 — Global Frontend Reflow & Readability

## Goal
Finish the global frontend refactor started from production Patch 21 without merging the separate Patch 22 recommendation branch.

## Contract
- Fluid typography based on rem/clamp rather than fixed pixel font sizes.
- Long-form copy constrained to roughly 60–75 characters per line.
- 200–400% browser zoom and narrow viewport reflow without horizontal page scrolling.
- Catalogue/tracker grids use fluid CSS Grid geometry instead of fixed breakpoint column counts.
- Long anime titles wrap to two stable lines without breaking card height.
- Mobile primary text and controls remain at least 1rem.
- Telegram and catalogue advertising surfaces size to their content and cannot widen the viewport.
- First two visible catalogue posters are eager/high-priority; remaining posters use the shared near-viewport scheduler.
- Anime poster delivery negotiates AVIF/WebP through a picture/srcset/sizes pipeline while retaining AnimeBox media-edge fallback logic.
- Existing 2K/4K and Watch Together behavior stays isolated from this patch.

## Validation
`npm run patch21-2:check` is part of prebuild and guards the root import order, relative typography, fluid catalogue geometry, eager poster contract and picture format sources.
