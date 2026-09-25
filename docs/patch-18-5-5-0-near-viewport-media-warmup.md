# Patch 18.5.5.0 — Near-Viewport Media Warmup

## Goal

Make poster-heavy lower sections feel instant without turning AnimeBox into an eager image loader and without sacrificing mobile PageSpeed, bandwidth discipline or responsive image quality.

The problem is scheduling, not image quality:

- card data and DOM can already exist before the user reaches a rail;
- poster URLs are responsive and served through the AnimeBox media edge;
- native lazy loading may still wait until the card is very close to the viewport before starting the request;
- the existing 300 ms reveal transition adds visible delay after the image has already decoded.

This patch starts the **correct responsive poster request** shortly before the card becomes visible.

## 1. Shared near-viewport scheduler

Do not create one IntersectionObserver per image.

Create one shared client scheduler for mass posters. It observes card image hosts and releases them for loading when they enter an adaptive warmup band.

Warmup distance is connection-aware:

- default / 4G: roughly 1–2 viewports ahead vertically and several cards horizontally;
- 3G: reduced warmup distance;
- 2G / slow-2G: small warmup distance;
- Save-Data: minimal warmup distance;
- no IntersectionObserver support: fall back to native lazy loading.

The scheduler unobserves an image immediately after activation.

## 2. AnimeImage loading modes

Extend the poster component from:

- eager
- lazy

to:

- eager
- lazy
- near

For `near`:

- before activation, do not assign the remote poster request;
- keep the existing skeleton;
- when the shared scheduler activates the host, mount the real `img`;
- use native `loading=eager` only after activation;
- use `fetchPriority=low` so near posters never outrank hero/LCP media;
- continue using existing `srcset`, `sizes`, card preset and media edge;
- keep bounded fallback/watchdog behavior after the request has actually started.

## 3. Card rollout

Use `near` for mass poster surfaces that benefit from scroll-ahead loading:

- standard AnimeCard;
- SmartRecommendationCard.

Do not convert hero/backdrop media or every site image to eager loading.

Horizontal rails benefit automatically because the shared root margin also warms a bounded distance to the left/right.

## 4. Perceived reveal latency

Reduce AnimeImage opacity reveal from 300 ms to about 180 ms.

This does not alter network priority or image quality; it only removes artificial post-decode delay.

## 5. Media-origin connection hint

Add one preconnect/dns-prefetch hint for the configured primary AnimeBox media origin.

Constraints:

- only when a media origin is configured;
- never add a large list of third-party preconnects;
- keep the existing Shikimori dns-prefetch fallback.

## 6. Performance invariants

The patch must preserve:

- no Next Image optimizer for mass poster grids;
- one shared IntersectionObserver, not one observer per card;
- no global eager loading of poster grids;
- responsive card srcset 240/360/540/720;
- quality and format negotiation;
- Save-Data/slow-network backoff;
- async decoding;
- lazy fallback when IntersectionObserver is unavailable;
- existing Cloudflare/R2 media cache behavior;
- existing feed DOM virtualization/backpressure.

## 7. Regression gate

Add `patch18-5-5-0:check` that verifies:

- shared observer exists;
- AnimeImage itself does not instantiate IntersectionObserver;
- adaptive network margins are present;
- Save-Data uses a conservative window;
- `near` does not mount the remote image before activation;
- activated near images are low-priority;
- AnimeCard and SmartRecommendationCard use near mode;
- responsive srcset/sizes remain wired;
- reveal duration is shortened;
- primary media preconnect is bounded to one configured origin;
- feed virtualization remains intact.

## Expected result

When the user scrolls toward lower recommendation/catalog rails, nearby posters should already be downloading or decoded before they enter the visible viewport, while distant cards still consume no image bandwidth.

This is a perceived-performance patch, not a quality-reduction patch.
