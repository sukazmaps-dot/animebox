# Patch 18.4.6 — CSS Cleanup II

## Goal

Reduce CSS inherited by every route without changing the visual cascade on the routes that actually use the styles.

This pass deliberately avoids deleting old patch layers based on filenames alone. It moves only styles with clear route ownership and replays the later mixed-layer overrides that previously came after them in the root cascade.

## Baseline

Before 18.4.6:

- 79 CSS imports in `app/layout.tsx`
- 876,630 bytes of root CSS source

## Route-scoped files

### Profile

`patch16-5-profile-widgets.css` is exclusively profile-widget/profile-editor presentation and no longer loads on Home, Search, Schedule, Anime pages or other routes.

Because it originally sat before later global responsive/readability layers, moving it directly to the profile layout would reverse parts of the cascade. To preserve behavior, the route loads:

1. `patch16-5-profile-widgets.css`
2. `patch18-4-6-profile-widgets-cascade.css`
3. existing modern profile-route CSS

The replay file contains only matching profile-widget rules extracted from:

- `patch16-6-responsive-layout.css`
- `patch16-6-1-mobile-performance.css`
- `patch16-6-2-readability-2k-density.css`

### Anime / episode

`patch14-5-episode-identity.css` is now owned by `/anime/[slug]`.

Its later episode-list overrides are replayed from:

- `patch15-title-accent.css`
- `patch16-6-6-home-desktop-stability.css`
- `patch16-6-7-light-surfaces.css`

### Anime rating

`patch16-6-8-star-rating-light-polish.css` is now owned by `/anime/[slug]`.

The later rating precision rules from `patch17-4-2-ui-precision.css` are replayed after it, preserving the original final cascade.

## New root budget

After this pass:

- 76 root CSS imports
- 822,199 bytes of root CSS source
- 54,431 bytes removed from the root cascade

That is roughly a 6.2% reduction in root CSS source before Next/PostCSS minification.

The small replay files are route-only and therefore do not return this cost to unrelated routes.

## Regression protection

`css-route-scope:check` verifies:

- the three route-only styles never return to `app/layout.tsx`;
- profile and anime import order remains stable;
- every relevant rule currently present in the later mixed global layers also exists in the corresponding route replay;
- if a future patch adds a new matching override to one of those mixed files, CI fails until the route replay is updated.

`frontend-architecture:check` also tightens root budgets to:

- at most 76 root CSS imports
- at most 830,000 root CSS source bytes

No database migration is required.
