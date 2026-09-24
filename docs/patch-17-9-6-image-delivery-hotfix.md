# Patch 17.9.6 — Image Delivery Hotfix

## Problem

AnimeBox card surfaces rendered remote anime posters through Next Image. Large
catalogue/recommendation/schedule surfaces therefore created many unique image
transformations across poster URLs, widths and quality settings. When the image
optimizer is unavailable or quota-limited, cached transformations can continue
to render while uncached posters fail into the local placeholder.

## Delivery policy

Mass poster surfaces now use direct remote CDN images:

1. extraLarge direct
2. large direct
3. medium direct
4. original/preview direct
5. one same-origin /api/image proxy attempt for the primary remote source
6. local AnimeBox fallback

This removes the old direct/proxy/direct/proxy fan-out and avoids routing
hundreds of ordinary poster cards through /_next/image.

The fixed-size/aspect-ratio card containers remain unchanged, so bypassing
Next Image does not introduce layout shift. Posters stay lazy-loaded and async
decoded.

## LCP

HomeHeroCarousel is intentionally unchanged. The first hero image keeps an
optimized/prioritized attempt for LCP and already falls back to an unoptimized
remote request if that path fails.

## Proxy

/api/image now sends a Shikimori Referer only to Shikimori hosts. AniList/MAL
requests do not inherit that unrelated referrer. Successful proxy responses
also receive explicit Vercel and Cloudflare CDN cache headers.

No database migration is required.
