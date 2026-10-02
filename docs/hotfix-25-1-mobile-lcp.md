# Hotfix 25.1 — Mobile LCP & Image Delivery Recovery

## Trigger

Mobile Lighthouse on the production Home route reported:

- Performance: 73
- FCP: 1.8 s
- LCP: 6.5 s
- TBT: 180 ms
- CLS: 0
- estimated image transfer saving: about 2.6 MiB

The report showed two concrete network regressions:

1. decorative mood artwork was fetched at source dimensions far above its ~27 px rendered slot;
2. Home anime cards were observed using direct AniList source images instead of the responsive AnimeBox media edge.

## Changes

### Production media origin fallback

`getPrimaryMediaOrigin()` keeps the environment override, but production now falls back to the canonical `https://media.youranimebox.com` origin when `NEXT_PUBLIC_MEDIA_ORIGIN` is absent from the build.

This prevents a missing public build variable from silently disabling the entire responsive poster `picture/srcset` path.

### Mobile poster warmup budget

The shared poster scheduler previously warmed up to 1600 px below the viewport on the default/4G path. On mobile this could turn several off-screen Home rows into eager image requests during the LCP window.

The scheduler is now viewport-aware:

- mobile: 460 px bottom overscan;
- tablet/small desktop: 720 px;
- wide desktop: 1000 px;
- Save-Data/2G/3G receive tighter budgets.

Card quality is unchanged. Only request timing changes.

### Mood artwork

Mood illustrations are decorative and much larger than their rendered chip slot. Native `loading=lazy` was insufficient because browser lazy-loading heuristics still fetched them near the initial viewport.

The initial mood picker now renders zero-network glyph fallbacks. Original artwork is released only when the user reaches/interacts with the picker (pointer hover/down or keyboard focus), and remains low-priority.

## Deliberately not changed in this hotfix

- hero visual design;
- poster quality presets;
- recommendation logic;
- CSS cascade/route scoping;
- Vercel Image Optimization policy.

The Lighthouse render-blocking CSS finding should be handled as a separate route-scope refactor because moving historical global patch CSS changes cascade order and requires broader visual regression QA.
