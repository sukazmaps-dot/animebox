# AnimeBox Patch 12.4.4 — Performance Consolidation

## Lighthouse baseline used
The uploaded mobile audit identified:
- render-blocking CSS with ~630 ms potential saving;
- oversized image delivery with ~126 KiB potential saving;
- LCP render delay around 1.82 s;
- 1,577 DOM elements;
- unused JS/CSS;
- Yandex Metrika main-thread work during the audit window.

## Changes

### LCP
- The first Hero image keeps high fetch priority and now requests synchronous decode.
- Yandex Metrika no longer starts during the normal load event. It starts on first user interaction or after a 12 s fallback timeout.
- Existing Hero animation lock before interaction remains intact.

### Images
- Next imageSizes now include 160/192/224/288/320 so mobile cards do not jump directly to 384 px candidates.
- Explicit Next 16 image quality allow-list enables the requested 55/60/62/etc instead of falling back to q=75.
- Standard AnimeCard and SmartRecommendationCard quality is 62.
- Optimized image cache minimum is 30 days.

### DOM / JS
- Initial personalized recommendation count: 30 -> 12.
- Home popular and ongoing grids: 10 -> 8 items each.
- SmartRecommendationFeed, HomeChatTeaser, TelegramPromoCard and SupportAnimeBoxCard are split from the critical Home client bundle.

### CSS
- performance.css is consolidated into performance-v2.css and removed from RootLayout imports.
- anime-page-v3.css and the 12.4 anime foundation stylesheet are moved into /anime/[slug]/layout.tsx, so the Home route no longer blocks on them.

## Boundaries
No changes to playback, watch progress, recommendations scoring, monetization behavior, Metrika counter ID, auth, Telegram Mini App logic or database schema.

## Re-measure
After deployment rerun the same mobile Lighthouse profile and compare:
- render-blocking CSS;
- LCP render delay;
- image transfer sizes;
- DOM node count;
- unused JS/CSS;
- third-party main-thread time.
