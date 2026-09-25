# Patch 18.4.1 — CSS & Client Boundary Cleanup

## Baseline

Before this patch the root layout imported:

- 81 global CSS files
- 890,607 bytes of CSS source before Next/PostCSS processing
- route-specific profile, player and Home recommendation rules from the same global cascade

The Home client shell is still a separate architectural target:

- `components/HomePageClient.tsx`: 1,426 lines
- 42 hook-bearing lines
- 7 dynamic client islands

This patch intentionally does not rewrite that state graph yet.

## Safe boundary moves in 18.4.1

Only late-cascade styles with clear ownership are route-scoped in this pass.

### Patch 17.6 split

The former `patch17-6-watch-platform.css` mixed two unrelated surfaces while also being the final global cascade layer.

It is split without changing rule contents into:

- `patch17-6-player-runtime.css`
  - loaded by `/anime/[slug]`
  - loaded by the Watch Together episode theater route
- `patch17-6-home-recommendation-actions.css`
  - loaded only by the Home page

Because the original file was the final global stylesheet, route-scoping these two disjoint sections preserves their final-cascade ownership on the routes where they apply.

### Profile grid

`patch17-4-2-2-public-profile-grid.css` now loads from `app/profile/layout.tsx` instead of the root layout. It was already the penultimate global layer and does not share selectors with the final Watch Platform rules.

### Profile Studio / Telegram gate split

The mixed `patch16-6-5-profile-studio-gate.css` is split into:

- `patch16-6-5-profile-studio.css` — profile routes only
- `patch16-6-5-telegram-gate-brand.css` — remains global because the Telegram subscription gate can appear before access to any route

The old mixed files are removed.

## New root budget

The root layout is capped by `frontend-architecture:check` at:

- at most 79 CSS imports
- at most 880,000 bytes of root CSS source

The first pass lands at roughly 876 KB. The reduction is deliberately conservative because older patch layers have cross-route overrides that must be separated in cascade order rather than simply moved.

## 18.4.2 target — Home server/client decomposition

The next pass should decompose `HomePageClient` instead of adding more effects to it.

Planned ownership:

- Server page:
  - SEO / metadata
  - initial public feed
  - public schedule/top data that does not depend on browser state
- Critical client islands:
  - Hero interaction
  - Continue Watching
  - auth-dependent actions
- Deferred client islands:
  - Smart Recommendation Feed
  - mood/taste controls
  - retention/pulse/activation
  - chat / Telegram / support surfaces

The goal is to stop hydrating static Home structure as part of a 1,400+ line client component.

## Deferred CSS work

Do not blindly move these yet:

- `patch16-5-profile-widgets.css`
- `patch16-6-responsive-layout.css`
- `patch16-6-1-mobile-performance.css`
- `patch16-6-2-readability-2k-density.css`

They share profile selectors across multiple cascade generations. They need to be extracted as an ordered profile bundle in a dedicated pass so newer responsive rules continue to override older widget rules.
