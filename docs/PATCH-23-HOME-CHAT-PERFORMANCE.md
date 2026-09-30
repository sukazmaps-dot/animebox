# Patch 23 — Home Instant Cards & Chat Fast Boot

Status: **Phase 23.0.1 implemented / under CI**

## Goals

- show recommendation rails as soon as the initial rank is ready;
- stop background card/rail reshuffles during an active Home session;
- make horizontal pagination feel like continuous scrolling, not a refresh;
- recover sparse rows before they reach the viewport;
- remove broken-looking specialized rows that cannot reach minimum density;
- make Home chat teaser and /chat initial boot faster without competing with LCP.

## Recommendation Session Stability

During one recommendation session:

- background Taste Graph, history and catalogue refreshes do not reorder cards;
- newly fetched candidate pages are ranked independently and appended;
- existing rail ownership remains sticky;
- visible rail order is stable;
- explicit mood changes may start a new composition;
- explicit feedback may intentionally re-rank the loaded pool.

## Sparse Rail Recovery

- minimum initial density: 5 cards;
- sparse bootstrap starts up to 520px before the rail enters the viewport;
- the final bounded bootstrap hop uses relaxed matching;
- specialized rails below minimum density are hidden after exhaustion instead
  of remaining visually broken;
- Top Match and Endless remain available even for a small terminal pool.

## Candidate Warmup

- the next public candidate page is prefetched as data immediately after the
  recommendation session mounts;
- prefetch never mutates the visible rail;
- subsequent pages keep the Patch 22 shared in-flight/cache/timeout contracts.

## Home Critical Path

Before:

rank -> dynamic chunk -> DeferredMount observer -> SmartRecommendationFeed

After:

rank -> dynamic chunk -> SmartRecommendationFeed

The legacy home-deferred CSS class remains for styling and older regression
contracts, but it no longer adds a second IntersectionObserver gate.

## Chat Fast Boot

- Home teaser remains protected by the outer Home DeferredMount;
- the redundant 6-second interaction timer is removed;
- teaser data starts at browser idle with a 900ms timeout;
- /chat SSR sends 24 latest messages rather than the default 40;
- older messages still use cursor pagination;
- Realtime/Presence starts after first paint/idle instead of competing with
  history hydration.

## Runtime Budgets

- rail virtual DOM remains bounded at 36 items;
- overscan increases from 6 to 8 to prepare nearby posters earlier;
- no per-card recommendation HTTP calls;
- no second recommendation runtime;
- no Realtime connection on Home;
- no unbounded retry/pagination loop.
