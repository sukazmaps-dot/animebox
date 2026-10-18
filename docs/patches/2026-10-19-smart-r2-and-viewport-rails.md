# Patch 32.2 — Curated R2 Poster Cache & Viewport-Aware Recommendation Rails

## Context / confirmed root causes

Patch 32.1.1 is live on Railway, and the owner confirmed media Worker
`media-shield-v7-no-storage-default` through `/health`, with
`r2: true`, `r2WritesEnabled: false`, `originRelayEnabled: false`.

A desktop 1680px screenshot shows the **История продолжается** row with only
five posters and empty space to its right while other rails render normally.

Code-level root cause:
- `SmartRecommendationFeed` bootstrapped rails only when they had fewer than
  `MIN_INITIAL_RAIL_ITEMS = 5`, irrespective of actual rail width.
- The `ScrollRow` end sentinel is deliberately gated by a first pointer/
  wheel/keyboard interaction, so five posters could remain underfilled without
  any additional fetch even if the candidate API still had pages.
- The previous bootstrap target was a fixed five cards and scanned only
  one additional page for an already populated sparse row.
- Special-purpose `story_continues` rows are limited to verified franchise
  continuations and cannot legitimately be bulk-filled with unrelated anime.

## Scope A: desktop rail completion

1. Measure the **actual row container** and poster width/gap, not global
   `window.innerWidth`, to account for sidebars, responsive layout and zoom.
   Fill target = visible capacity plus one, clamped to 5..12 cards.
2. Only prime rows close to the viewport (current 520px margin); retain
   IntersectionObserver plus passive scroll/resize geometry fallback.
3. Search no more than two additional shared candidate pages for already
   populated rows, three for zero-item bootstrap. Use the existing shared,
   deduplicated candidate request; do not perform per-row independent fetches.
4. If the row still lacks matching candidates after the bounded window,
   mark **that rail** temporarily exhausted and expose its existing
   "Показать больше похожих аниме" action. Further global pages may clear
   the pause. Do not automatically scan the whole catalog.
5. Preserve exact franchise eligibility, season/taste filters, availability
   protection, append-only rail ownership, mood/session stability, visibility
   and DOM virtualization limits, and the explicit interaction requirement
   for open-ended right-edge pagination.
6. On resize, allow a newly wider viewport to request a larger target without
   dropping earlier cards, resetting scroll position or triggering repeated
   same-target requests.

**Important limitation:** if the candidate universe contains only five eligible
continuations, leaving space to the right is correct; don't fabricate a sixth
title, duplicate cards or remove availability protections.

## Scope B: conservative, opt-in R2 usage

Cloudflare Worker revision: `media-shield-v8-curated-r2`.

- **Default remains off:** `MEDIA_R2_WRITES_ENABLED` unset/false; deployment
  alone does not increase R2 storage or Class A operations.
- Read all existing `posters-v3` R2 objects via the unchanged read path.
- When explicitly enabled, only store valid Cloudflare **actually transformed**
  WebP bytes for widths **240 or 360**, quality **70**, max **192 KiB**.
- Never persist raw/original, fallback, relay, HEIC/SVG, incorrect MIME, oversized,
  transformed-but-not-WebP, AVIF, duplicate quality/width variants or HEAD.
- Cache key remains the existing source-URL hash plus variant token; don't
  introduce a second object for the same canonical key. Same requested image
  still uses existing edge cache.
- Missing/failed R2 writes must not stop delivery; write in `ctx.waitUntil`
  and swallow rejected writes as optional cache degradation.
- Report `r2WritePolicy`, `r2WriteWidths`, `r2MaxWriteBytes` in `/health`.

**Cost limit:** the Worker cannot enforce an account-wide 10 GiB R2 quota:
other applications and prior cached objects count. Keep opt-in disabled until
actual bucket occupancy, object count, read/write and billable operation usage
are inspected in Cloudflare. Add explicit monitoring/alerts or stop-write policy
before unattended scale-up. R2 storage is not a solution for permanently
unavailable origins and does not guarantee 100% poster coverage.

**Cloudflare Image Transformations:** when disabled/unavailable and the origin
returns untransformed bytes, the Worker does not persist an image. That is
intentional. Evaluate usage before paying for Transformations.

## Release/checks

- Source tests for real computed rail capacity on desktop/mobile/capped width,
  partial windows, stable ownership/virtualized layout.
- Existing real feed lifecycle and browser smoke checks.
- Real Worker behavior on mock R2 bucket: writes off by default; only eligible
  transformed WebP writes; no PNG masquerading or other format/quality/size
  combinations; no broken media allowlist or fallback.
- Existing Image/Relay/Security tests, TypeScript, ESLint and Next.js build.
- Keep this as a **draft PR** until Quality Gate passes.
- Main app deploy is through Railway after authorized merge; **media Worker
  requires separate Cloudflare deployment** from its source file.
- Do **not** toggle `MEDIA_R2_WRITES_ENABLED=true` as part of merging.
- Verify current Worker revision through
  `https://media.youranimebox.com/health`; verify selected real poster URLs,
  source headers and bytes; inspect Railway `/api/recommendations` and live
  rendered rail under 1366/1680/1920 and mobile 390px.
