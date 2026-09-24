# Patch 17.8.9 — Smart Feed Infinite Rails & Media Stability

## Problem fixed

The horizontal `ScrollRow` already had an IntersectionObserver sentinel, but
SmartRecommendationFeed only enabled it for the final `endless` rail. Sparse
rails such as “За пределами привычного” therefore stopped after the initial
candidate pool and could only receive new data after the user reached the
bottom-most rail.

## Architecture

- every recommendation rail owns its horizontal sentinel;
- IntersectionObserver uses the row viewport as `root`, not the page;
- all rails share one cursor stream and one in-flight candidate promise;
- concurrent rail requests deduplicate onto the same network request;
- each rail expands its materialization target in batches of six;
- up to three empty candidate pages may be skipped for a sparse rail;
- visible cards get sticky rail ownership, so new pages do not teleport cards
  between “taste”, “explore”, “quick watch” and “endless”;
- anime IDs are deduplicated for the whole recommendation session;
- mood changes abort stale network work, reset ownership and start a new
  recommendation session;
- failed rail loading is local to that rail and exposes a compact retry tile.

## Core Web Vitals safeguards

- no page-level scroll listener is used for pagination;
- ScrollRow's UI-only scroll state is requestAnimationFrame-throttled;
- image slots keep the existing 2:3 aspect ratio before network completion;
- poster containers use layout/paint containment;
- AnimeImage advances to the next source if a remote image hangs for 12s;
- recommendation posters remain lazy-loaded;
- loading placeholders occupy fixed rail-card geometry;
- ranking updates from candidate pages are scheduled with React
  `startTransition`;
- candidate prefetch remains delayed outside the hero/LCP window.

No database migration is required for this patch.
