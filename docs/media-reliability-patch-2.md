# Audit patch 2: visible posters and artwork recovery

## Goal and observed behavior

Keep poster surfaces usable when delivery stalls or catalog metadata updates.
Production inspection found valid posters loading through `/api/image` after
media-edge failures. The relevant code also had two deterministic failure modes:
native-lazy images had no watchdog once visible, and adding fallback URLs reset
already decoded images to an invisible loading state.

Several consumers additionally used only `coverImage`, ignoring valid legacy
`image` fields or the legacy URLs behind a non-null but empty cover object.

## Implementation

- `AnimeImage` and `AnimeImageCascade` share a viewport-based recovery hook.
  Native-lazy images become eager only while visibly loading. A single shared
  observer services pending images; older WebViews use one shared scroll/resize
  listener pair and a coalesced animation frame.
- Existing source timeouts remain conservative (6.5s primary / 7.5s alternate /
  9.5s server proxy; 8.5s for cascade sources). One pass has a 24s visible,
  foreground budget. Scrolling away or hiding the tab pauses both the source
  and overall budget. Exhaustion reaches the local fallback, then the existing
  bounded transient-retry policy can run a new pass.
- Loaded images survive metadata changes while their successful candidate is
  still present. Different image sources reset normally. Attempt generations
  reject late callbacks, including A → B → A reuse.
- A global edge cooldown no longer rewrites the `picture`/`srcset` of an already
  loaded image. Circuit-driven skips are persisted so cooldown expiry cannot
  rewind an active independent request.
- Successful delivery paths are remembered for up to two minutes, at most 128
  entries, in tab memory only. Hints apply once per candidate chain and are
  invalidated when that path fails. SSR ignores hints for deterministic markup;
  hydration/client rendering can reuse them. No image bytes are stored.
- Catalog, recommendations, continue-watching, top lists and tonight artwork
  merge `coverImage` with legacy `image`, preserving independent known sources.
- `data-image-request-state` distinguishes missing-source, deferred,
  offscreen-pending, visible-pending, loaded and exhausted. Existing failure
  stage/reason attributes remain available on the shared poster component.
  These are local diagnostics, not a new analytics collection pipeline.

## Acceptance and checks

`tests/poster-visible-recovery.cjs` mounts real components/hook/observer with a
virtual clock and checks visible lazy stalls, foreground-only budget, scroll/tab
pause and resume, cached decoding, metadata continuity, old attempt callbacks,
loaded srcsets during cooldown, cooldown expiry, SSR-safe session hints, expiry
and entry bounds, no-IntersectionObserver fallback, shared observer cleanup,
and actual catalog/top consumer handling of legacy posters.

The test runs inside `poster-reliability:check` and the existing prebuild gate.
The test sets NODE_ENV=test before React imports, including under a production
build environment. Existing source/srcset, WebP decode, edge cooldown, delayed
retry, proxy cache and warmup tests must continue passing.

The static image-delivery check now enforces the real visibility guard rather
than forbidding every lazy watchdog. The warmup guard now requires exactly two
module-shared observers (overscan and true visibility), plus cleanup, rather
than one observer that could not distinguish these jobs. No stylesheet layers, provider URL guesses,
new storage writes, SQL migrations or environment variables are introduced.

## Release and canary

After deployment, inspect search/catalog and recommendation rows, a title page,
and tonight hero. For visible pending surfaces, inspect failure stage/reason and
request-state. Repeat after scrolling away/back, updating a card's metadata and
switching tabs. A missing URL must remain distinguishable from a delivery error.

Third-party outages can still exhaust every known source. The patch guarantees
bounded recovery and stable surfaces, not universal availability of external art.
