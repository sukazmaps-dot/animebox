# AnimeBox Patch 12.4.4.1 — LCP hotfix without visual quality loss

## Why
The post-12.4.4 Lighthouse run showed:
- TBT improved to 30 ms;
- CSS critical-chain cost dropped sharply;
- card images now use smaller Next Image candidates;
- Performance was still held back by LCP 4.3 s and CLS 0.124.

Two concrete resource issues were visible:
1. the 24x24 Premium sidebar icon loaded the original 768x768 WebP (~94 KiB);
2. the first Home Hero image used synchronous decoding.

## Changes

### Premium icon
SidebarMembership now uses next/image at 24x24 with sizes="24px".
The source artwork is unchanged, so visual fidelity is preserved while the browser receives an appropriately sized optimized derivative.

### Hero LCP
The first Hero keeps:
- priority=true;
- fetchPriority=high;
- quality=55;
- the same responsive source and visual design.

Only decoding changes from sync to async, allowing Chromium to schedule image decode without blocking the next paint.

### Cache
/public/premium assets now receive the same seven-day browser / longer CDN cache policy as /brand and /ui.
No filenames or asset content were changed.

## Explicitly not changed
- Hero quality;
- card quality;
- visual effects;
- layout sizes;
- Premium artwork;
- functionality;
- recommendation logic;
- player/progress;
- authentication;
- monetization logic.

CLS is intentionally not patched speculatively. If it remains above 0.10 after this deploy, the exact shifting element should be captured from Lighthouse/Performance and fixed at its source.
