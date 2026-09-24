# Patch 17.9.7.1 — Rail continuation + poster reliability

## Root cause: horizontal recommendation feed

The candidate stream rotates between broad and narrow public sources. A narrow
source such as ongoing, mood or preferred genre can return an empty page before
ranked/popularity is exhausted. The previous API only used its fallback source
when the primary request threw an error. An ordinary empty array therefore
set hasMore=false for the entire shared recommendation cursor.

The API now falls back on both source errors and empty narrow-source pages.
Only an empty broad ranked/popularity fallback can terminate the cursor.

ScrollRow keeps IntersectionObserver as the primary mechanism and adds a
geometry fallback to its existing requestAnimationFrame-throttled
scroll/resize path. Short rows auto-fill, and rows within 55% of their right
edge request the next batch even if the 1px sentinel is missed by
scroll-snap/resize timing.

## Root cause: missing posters

AniList mapping accidentally populated coverImage.medium with the large URL,
so the supposed medium fallback repeated the same failed asset. It now uses
the real AniList medium URL.

Image delivery is also host-aware:
- AniList/MAL-style CDN assets stay direct-first;
- Shikimori assets try the same-origin proxy first so the required Shikimori
  Referer is supplied;
- stalled image attempts advance after 6s instead of 12s.

No SQL migration is required.
