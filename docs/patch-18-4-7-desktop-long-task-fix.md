# Patch 18.4.7 — Desktop Long Task & Background Work Fix

## Goal

Fix the pathological Lighthouse desktop runtime pattern where mobile TBT could stay near a few hundred milliseconds while desktop accumulated multi-second blocking work after the page was already visually ready.

This patch treats the issue as a background-work scheduling bug, not as a CSS-score problem.

## Findings

### 1. Full schedule was desktop-eager

`HomeScheduleRuntimeProvider` explicitly started the complete schedule request 700 ms after hydration on desktop. Mobile used viewport proximity instead.

The full endpoint can scan multiple AniList pages over a multi-day range and then localize titles through Shikimori. The desktop right rail needs only a handful of upcoming episodes, so this was disproportionate work in the critical Lighthouse window.

### 2. Recommendation rails could paginate on mount

`ScrollRow` considered a rail "near the end" using a threshold derived from viewport width. A wide desktop viewport can satisfy that condition immediately on mount.

That allowed `SmartRecommendationFeed` to call `ensureRailDepth()` before the visitor actually scrolled the rail.

### 3. Smart Feed performed an unconditional 5-second page prefetch

The feed scheduled another candidate page even with no user interaction.

### 4. Deferred sections woke up after 12 seconds

`DeferredMount` forced all off-screen deferred content to mount after 12 seconds even when it had never approached the viewport.

### 5. Hero parallax read geometry on every pointer event

Desktop pointer movement executed `getBoundingClientRect()` and style writes for every pointermove event.

## Changes

### Bounded home schedule window

The schedule API now accepts a validated `limit` parameter.

Home loads a bounded 78-hour window (6 hours back, 72 hours forward, max 60 items) during idle time. This small pool powers:

- the five upcoming episodes in the desktop rail;
- personal schedule cards;
- retention episode signals.

The complete schedule no longer has a desktop timer. It loads only when the actual schedule section approaches the viewport. A timer fallback remains only for browsers without `IntersectionObserver`.

### Interaction-gated recommendation pagination

`ScrollRow` gained `endReachedRequiresInteraction`.

Smart Feed enables it, so mount/resize/initial geometry checks cannot request the next recommendation page. Pagination unlocks only after a real pointer, wheel, keyboard, or explicit arrow interaction with that rail.

The old 5-second recommendation prefetch was removed.

### Deferred content stays deferred

When `IntersectionObserver` exists, `DeferredMount` now waits for actual viewport proximity. It no longer mass-mounts every deferred section at 12 seconds.

Legacy browsers without IntersectionObserver keep the short compatibility fallback.

### RAF-throttled hero parallax

Hero geometry is measured on pointer entry and reused. Pointer movement stores the latest coordinates and performs at most one style update per animation frame. Pending parallax work is cancelled on unmount/leave.

## Regression protection

`desktop-runtime-budget:check` prevents:

- a desktop full-schedule wake-up timer from returning;
- removal of the bounded schedule endpoint contract;
- Smart Feed pagination without interaction;
- return of the 5-second candidate prefetch;
- return of the 12-second DeferredMount wake-up;
- direct per-pointer hero geometry reads.

No database migration is required.

## Measurement

This patch intentionally makes no claim about the final Lighthouse score before production measurement. Compare fresh lab runs after deployment, with emphasis on:

- Desktop TBT
- main-thread long tasks
- recommendation requests before interaction
- schedule requests during the first five seconds
- JS execution / Other main-thread time
