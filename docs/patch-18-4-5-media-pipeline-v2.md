# Patch 18.4.5 — Media Pipeline v2

## Goal

Stop serving provider-sized poster artwork to small UI surfaces and make the AnimeBox media edge responsible for bounded responsive variants.

The patch is designed to remain safe while Cloudflare Image Transformations are disabled or temporarily unavailable.

## Variant protocol

AnimeBox media URLs now support a bounded protocol:

```
/image?url=<source>&w=<width>&q=<quality>&f=<format>
```

Allowed widths:

- 96
- 144
- 240
- 360
- 540
- 720
- 1080
- 1440

Allowed quality buckets:

- 60
- 70
- 80

Allowed formats:

- auto
- webp
- avif

Arbitrary dimensions or qualities are rejected with HTTP 400. This prevents unbounded cache cardinality.

## Presets

### tiny

For schedule rows, Continue Watching mini posters, compact Top Anime rows and retention cards.

- widths: 96 / 144
- default: 96
- quality: 60

### card

For catalog and Smart Recommendation posters.

- widths: 240 / 360
- default: 240
- quality: 60

### large

For larger editorial poster surfaces.

- widths: 360 / 540
- default: 360
- quality: 70

### hero

Reserved for large media-edge surfaces.

- widths: 720 / 1080 / 1440
- default: 1080
- quality: 80

The existing Home Hero remains on the deliberate Next Image LCP path in this patch.

## AnimeImage v3

`AnimeImage` now:

- uses its existing `quality` prop to build real media variant URLs;
- exposes `preset` and `format`;
- renders a responsive `srcSet` for the first AnimeBox media-edge candidate;
- keeps native `loading="lazy"`;
- removes the `srcSet` automatically when moving to direct/proxy fallback sources;
- preserves the bounded source failover from 18.3.x.

The default output format for mass posters is WebP. This keeps one deterministic transformed format per width and avoids multiplying unique transformation count only for content negotiation.

## Cloudflare Worker

The Worker parses and validates the variant parameters before touching cache.

Variant cache identity includes:

- source URL hash;
- width;
- quality;
- resolved format.

Successful transformed images use a separate R2 namespace:

```
posters-v2/<prefix>/<source-hash>/<variant-token>
```

The original R2 namespace remains unchanged for backward compatibility.

Cloudflare transformation uses `cf.image` with:

- `fit: scale-down`;
- bounded width;
- bounded quality;
- optional output format.

The Worker requires a successful `Cf-Resized` response header before it considers the result a real variant.

If transformations are disabled, unavailable, or the monthly free transformation limit is exhausted:

1. the Worker falls back to the original source;
2. the response receives a short transform-fallback cache;
3. the oversized fallback is not written into the variant R2 key;
4. a later request can become a real transformed variant as soon as Cloudflare transformations are available again.

## Current Cloudflare state

At implementation time, the `youranimebox.com` zone reports Image Transformations as disabled.

The repository patch is therefore backward-safe before the Cloudflare setting is enabled. Enabling the zone setting is a separate production step.

Cloudflare Images Free currently includes 5,000 unique transformations per calendar month. Existing transformations continue to be served if that limit is exceeded, while new transformations can fail. For that reason mass-card presets intentionally use only two canonical widths.

## Regression gates

`image-delivery:check` now verifies:

- AnimeImage has variant-aware `srcSet`;
- quality is wired into the URL;
- preset types and bounded width/quality lists exist;
- Worker uses `cf.image`;
- successful resize is confirmed through `Cf-Resized`;
- variant cache keys include the variant token;
- untransformed fallback cannot poison variant R2 storage;
- mass-card callsites use card/tiny presets;
- Hero LCP behavior remains unchanged.

No database migration is required.
