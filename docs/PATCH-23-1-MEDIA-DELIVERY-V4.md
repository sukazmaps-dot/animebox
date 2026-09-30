# Patch 23.1 — Media Delivery V4 / Instant Card Rendering

Status: **implemented / under CI**

Contract: `23.1-media-v4`.

## Problem statement

Patch 23.0.1 stabilized recommendation rows and removed background reshuffles.
The remaining visible latency is mostly media delivery:

- a virtualized card can remount and briefly show its skeleton even though the
  same poster was already decoded earlier in the session;
- neighbouring horizontal posters can start too late;
- card `sizes` definitions drifted between generic and smart cards;
- priority hints were either ignored by near-mode or risked becoming too broad;
- the browser should never create an eager/high-priority storm across every rail.

## A. Session-success poster cache

`AnimeImage` owns a bounded in-memory success cache:

- max 640 source chains;
- keyed by the bounded source-chain signature;
- stores the last successful source index only;
- a virtualized/remounted poster can immediately render from the browser cache;
- no skeleton reset is required after an already successful decode;
- a real image error removes the cached success immediately;
- fallback placeholders are not stored as successful remote media;
- no persistent storage or hydration-sensitive sessionStorage is used.

This cache is UX state only. It does not replace HTTP/R2 caching.

## B. Near-mode priority budget

Near-mode remains the default for mass posters.

- `fetchPriority=high` is honoured only after the shared warmup observer has
  released the image;
- only the first four cards in the `top_match` rail request high priority;
- all other smart recommendation posters remain low priority;
- generic `AnimeCard` keeps its explicit caller-controlled priority API;
- no card grid switches to global eager loading.

## C. Surface-specific card sizes contract

Media V4 deliberately separates two sizing contracts instead of pretending all
poster surfaces have the same geometry:

- `MEDIA_SMART_CARD_SIZES` follows the Home recommendation rail. Up to 768px
  its declared slot is capped at 162px, matching the real mobile rail CSS;
- `MEDIA_ANIME_CARD_SIZES` remains conservative for catalogue/search grids,
  where a two-column phone layout can produce cards wider than 162px.

Both surfaces use the same bounded card variant ladder:

- 240;
- 360;
- 540;
- 720.

This keeps ordinary Home recommendations on 360/540 when appropriate without
making wider Search/Catalogue cards soft on DPR 2/3 devices. 720 remains
available when the real rendered slot and DPR justify it.

## D. Horizontal warmup V4

The application still owns exactly one shared media IntersectionObserver.

Connection-aware margins:

- Save-Data: `100px 48px 160px 48px`;
- 2G/slow-2G: `180px 80px 260px 80px`;
- 3G: `420px 360px 760px 360px`;
- default/4G: `700px 720px 1600px 720px`.

This deliberately reduces horizontal fan-out versus the previous 900px
default while still warming several neighbouring cards before they enter the
viewport.

## E. Existing Cloudflare/R2 shield retained

The existing media worker already satisfies the V4 server-side requirements:

- edge cache before origin;
- R2 before origin;
- same-variant in-flight coalescing;
- source-probe coalescing;
- negative cache;
- bounded origin retry;
- stale-while-revalidate cache headers;
- transformed variants never poison R2 with raw oversized bytes;
- /image soft-fails without an explicit 502 response.

No worker behaviour is changed in 23.1-A, reducing deployment risk.

## F. Performance budgets

- no per-card API fetches;
- exactly one shared near-viewport observer;
- Smart Feed DOM cap remains 36 items;
- no global eager poster policy;
- max four high-priority smart recommendation posters;
- successful-state cache max 640 entries;
- browser/R2 caching remains authoritative for bytes.

## G. Definition of Done

- revisiting a virtualized card does not visibly flash a poster skeleton;
- Top Match first viewport starts sooner;
- neighbouring horizontal posters begin warmup before entering viewport;
- Home recommendation cards use the smallest suitable responsive variant;
- wider catalogue/search cards retain enough source resolution;
- no media request storm is introduced;
- circuit breaker/fallback behaviour remains intact;
- TypeScript, lint, Patch 23.1 regression gate and production build pass.
