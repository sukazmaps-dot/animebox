# Patch 18.3 — Discovery Runtime & Feed Scale

## Goal

Keep the Netflix-style Smart Feed effectively infinite without letting a long
horizontal session turn into hundreds of live cards, images, observers and
retry timers.

Patch 18.3 is based on Patch 18.2. It does not change catalog availability
semantics; it changes how already-approved recommendation data lives in the
browser.

## Runtime architecture

```
candidate pages
    ↓
shared cursor loader
    ↓
Taste Graph + 18.3 ranking
    ↓
sticky rail ownership
    ↓
full rail data model
    ↓
horizontal virtual window
    ↓
<= 36 mounted slots per rail
```

Data can keep growing while the mounted DOM remains bounded.

## Horizontal virtualization

`components/ui/ScrollRow.tsx` now supports a fixed-slot horizontal virtual
window.

Contract:

- maximum live window: 36 children per Smart Feed rail;
- overscan: 6 items;
- hidden prefix/suffix are represented by inert flex spacers;
- spacer widths are calculated from the measured card width + current CSS gap;
- responsive card-width changes preserve the approximate scroll anchor;
- the end sentinel stays at the true logical end of the rail;
- snap, touch scrolling, arrows and keyboard focus remain native;
- no MutationObserver is needed.

Unmounted SmartRecommendationCards also release their AnimeImage timers,
IntersectionObservers and DOM image elements.

## Stable recommendation analytics across remounts

Virtualization intentionally unmounts cards. A small tab-local identity cache
keeps recommendationId, impressionId and the "impression already sent" bit
stable across a virtual unmount/remount.

This prevents scrolling away and back from creating duplicate impressions.

## Cursor/backpressure safety

The existing tab-global page cache and in-flight page dedupe remain.

Patch 18.3 additionally remembers consumed page/cursor identities. If an
upstream response ever points to the same cursor/page again, the client closes
that pagination chain instead of requesting the same window forever.

Only one shared candidate page request may be active for the Smart Feed at a
time, while each rail still has its own load latch.

## Same-session negative feedback

"Не интересно" now updates a compact local negative-genre profile immediately.

The current loaded candidate pool is re-ranked in the same tab after a dismiss,
so related genres are de-emphasized before the next server Taste Graph refresh.

The local profile is bounded to 24 genre tokens and decays on each explicit
feedback update.

## Diversity v2

18.3 keeps the existing franchise-family cap and adds:

- larger candidate window;
- stronger genre concentration control;
- format repetition penalty;
- five-year release-era repetition penalty.

This keeps long sessions from collapsing into one franchise, one format or one
release era.

## Diagnostics

Existing recommendation rail health events now include:

- pool_size
- rail_items
- rendered_items
- virtual_window_max
- virtualized
- pages_scanned

/admin/recommendations exposes max DOM / logical rail depth and total scanned
candidate pages per rail.

## Performance target

A long Smart Feed session may retain recommendation data in JS memory, but it
must not linearly grow live cards/images in the DOM. The hard UI contract is
36 mounted children per rail (plus the one-pixel sentinel and virtual spacers).
