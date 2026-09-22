# AnimeBox Patch 12.4.0 — Anime Page Ultimate Foundation

## Goal
Turn /anime/[slug] from a collection of feature blocks into one coherent title experience.

Flow:
1. title identity;
2. primary watch action;
3. factual title summary;
4. seasons and episodes;
5. personal tracker / notifications;
6. Watch Together;
7. franchise;
8. episode discussions;
9. related titles.

## Changes

### Hero
- Per-title accent now uses the AniList cover accent color.
- Added a compact Catalog breadcrumb.
- Reduced generic pill/glass styling.
- Primary watch action gets clear hierarchy.
- Decorative banner uses low fetch priority; the poster remains the important eager image.
- Mobile poster is capped instead of filling most of the screen.

### Episodes
- Existing EpisodeList is now present directly on the anime page.
- Existing season/availability/completed-episode logic is reused.
- Active season/group/current episode inherit the title accent.
- No second playback/progress implementation is introduced.

### Personal title controls
- Library and Telegram notification controls become one "Мой AnimeBox" surface.
- Both use their existing compact variants.

### Brand voice
- "Паспорт тайтла / Главное без лишнего" -> "О тайтле / Коротко".
- Franchise "Content Intelligence" wording removed.
- Watch Together copy made shorter/product-like.
- Episode discussion copy made direct and spoiler-focused.

### Mobile
- Compact poster.
- Primary watch CTA spans the row.
- Secondary favorite/tracker actions share the next row.
- Personal controls stack.
- No large promo cards are added.

## Regression boundaries
No change to:
- Kodik / player implementation;
- watch heartbeat;
- completion thresholds;
- progress persistence;
- library API schema;
- notification backend;
- franchise data algorithm;
- SEO canonical / structured data;
- Supabase schema.

No migration required.
