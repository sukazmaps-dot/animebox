# Patch 18.6.3 — Home Loading UX / Skeleton States

## Mission
Loading on the AnimeBox home page must look intentional. A user must never have to guess whether a recommendation rail is empty, broken, or still fetching.

## State contract
Every affected surface distinguishes loading, ready, empty, error and loading-more. No empty carousel with a navigation arrow is a valid loading state.

## Recommendations
Initial loading renders recommendation-shaped placeholders: poster, title, metadata, reason and actions. Zero-item rails with hasMore are automatically bootstrapped. Completely empty rails may scan up to three candidate pages, then pause instead of rendering an empty carousel. Scroll arrows are hidden until at least one real card exists. Bootstrap failures expose retry instead of permanent shimmer.

## Schedule
Global and personalized schedule loading mirrors final card geometry: poster, copy and time chip. Personalized schedule reserves space only when the home is personalized and known anime IDs exist.

## Motion/accessibility
Loading surfaces expose role=status / aria-live and aria-busy. Decorative skeletons are hidden from assistive tech. Reduced-motion disables shimmer animation. Light theme receives separate neutral loading surfaces.

## Acceptance
- no blank recommendation rectangle during fetch;
- no lone arrow on an empty "Ещё для тебя" rail;
- visible zero-card rails load without user interaction;
- existing cards remain mounted during pagination;
- schedule placeholders resemble final schedule rows;
- dark/light/reduced-motion states are supported;
- TypeScript, targeted ESLint, regression gates and production build remain green.
