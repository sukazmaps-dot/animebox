# Patch 16.6.1 — Mobile Performance & Resilience

## Goal

Reduce the amount of work and visual/network traffic required for the mobile AnimeBox home page while making repeated visits more resilient to weak or temporarily unavailable networks.

This patch intentionally improves the web client first. It does not try to turn AnimeBox into a full offline application and does not cache private account state.

## Initial home payload

The SSR home feed previously fetched:

- 20 popular anime;
- 20 ongoing anime.

The UI only needs a smaller bounded set for the hero and visible catalogue sections.

Patch 16.6.1 reduces the server payload to:

- 12 popular anime;
- 12 ongoing anime.

The client resilience fallback uses the same limit.

This reduces serialized App Router data, metadata objects and initial memory pressure without changing the visible 10-card popular section.

## Deferred client islands

The following noncritical client-only Home blocks now mount only when they approach the viewport:

- Smart Recommendation Feed;
- Home Chat teaser;
- Support AnimeBox card;
- Telegram promo.

`DeferredMount` uses IntersectionObserver and a large prefetch margin so content is normally ready before the user reaches it.

On Save-Data / 2G connections the margin is reduced, keeping work closer to the viewport.

A delayed fallback ensures embedded/older browsers still receive the content even if IntersectionObserver behaves unexpectedly.

## Image budget

Anime poster `sizes` now follows the responsive shell:

- phone portrait;
- compact phone landscape;
- tablet;
- desktop.

Landscape phones no longer request poster widths sized for a portrait two-column grid.

Regular catalogue cards use quality 60 instead of 62. Hero/LCP assets keep their independent higher-quality path.

All poster wrappers retain a stable aspect ratio and code/CSS fallback surface, so a failed image does not collapse the card or move the layout.

## Paint and GPU work

A final mobile performance stylesheet adds:

- content-visibility for below-the-fold Home sections;
- layout/paint/style containment for cards and deferred islands;
- realistic intrinsic size reservations;
- removal of hover-only card shine on coarse pointers;
- removal of unnecessary mobile backdrop blur from noncritical Home panels;
- a prefers-reduced-data visual contract where supported.

Critical navigation and hero layout are not hidden by content-visibility.

## Bounded offline/public cache

AnimeBox now registers `/animebox-sw.js` after window load and an additional delay, so service-worker setup does not compete with LCP.

Cached categories:

- `/api/anime` public GET responses;
- `/api/schedule` public GET responses;
- Next static assets;
- AnimeBox brand/UI assets;
- Next optimized images;
- AnimeBox image proxy responses.

Cache sizes are bounded and old entries are evicted.

### Explicitly not cached

The service worker refuses document/navigation HTML and does not cache:

- auth/session responses;
- profile data;
- watch progress/history;
- community/private APIs;
- user-specific HTML.

This prevents stale authenticated UI and cross-account cache leakage.

## Update behavior

`/animebox-sw.js` is served with `no-cache, no-store, must-revalidate` and `Service-Worker-Allowed: /`.

The browser can therefore pick up cache-policy changes quickly even though the assets managed by the worker are long-lived.

## Quality gate

`mobile-performance:check` validates:

- no HTML navigation caching;
- same-origin service-worker scope;
- bounded image/public-data caches;
- private endpoint exclusions;
- production/post-load registration;
- viewport-deferred Home blocks;
- reduced home feed size;
- landscape image sizing;
- performance stylesheet ordering.
