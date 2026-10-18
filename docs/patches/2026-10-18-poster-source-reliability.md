# Patch 32.1 — Poster reliability without new object storage

## Evidence and scope

Production diagnostic: ten recommendation results had one distinct AniList URL
each; five already had another poster in saved Shikimori metadata. One media
request for a 240px WebP returned a 374KB original PNG via the Railway rescue.
Worker health reported an attached R2 bucket. Browser samples loaded successfully;
this is a resilience fix, not evidence of a universal outage.

## Requirements

1. Preserve alternate poster URLs when merging metadata. Use existing MAL
   mappings only; never infer another title by name. One bounded, cached batch
   read supplies alternatives to saved catalogue/recommendation cards. Failures
   leave the original cards and their order intact. No provider N+1 calls.
2. Keep primary image selection. Prefer a different origin as fallback, then
   other known URLs; deduplicate and cap the chain. Shikimori stays behind the
   validated same-origin proxy. Do not invent file paths or relax host checks.
3. Canonical relay may request a single bounded WebP derivative (maximum 1440px,
   no enlargement), shared across responsive widths. One transform at a time,
   finite queue, pixel/time limits, bounded in-memory cache. Keep the original
   if compression fails or increases its size. Do not claim exact variant sizes
   when Cloudflare resizing was unavailable.
4. Worker defaults to no new R2 writes, even with a bucket attached. Existing
   reads and CDN cache stay available; do not delete any objects. Health must
   distinguish attachment from write permission. Existing deployments need the
   updated Worker separately from the Next.js deployment.
5. Exercise alternate-source preservation, bounded cascade, metadata outage,
   compression/decode, coalescing and no-write behaviour. Run existing media,
   recommendation, TypeScript and build/prebuild checks.

## Acceptance

Recommendation ranking, IDs and membership do not change. Cards have a local
terminal fallback and no infinite retry. Cached donors are not mutated. No new
storage or paid service is provisioned. Supabase schema changes are unnecessary.
Deployment is complete only after both app and Worker revisions are live and a
production sample confirms health, alternate URLs and valid image responses.

## Local verification

- Full `npm run prebuild`, production `next build` and TypeScript passed.
- New behavioural test covers the actual image route and valid WebP bytes,
  metadata outage/coalescing, independent URLs and default-off R2 writes.
- Existing media relay, schedule, catalogue recovery and metadata tests passed.
- Targeted implementation lint has no errors (one pre-existing unused legacy
  `_malId` argument warning in image-service).
- The diagnostic PNG (373777 bytes) encoded to a valid 35706-byte WebP locally.
  This is a single source sample, not a fleet-wide bandwidth guarantee.
- Updated two historical Worker-version pins with an explanation; preserved
  their hardening assertions. Refreshed isolated metadata fixtures to match
  existing catalogue dependencies without weakening behavioural assertions.

## Release

Deploy the app before the Worker (the new relay query is backwards compatible,
but compression needs the new app). Ensure `MEDIA_R2_WRITES_ENABLED` is unset or
`false`, then verify `/health` reports `r2WritesEnabled: false`. An attached
bucket alone is no longer permission to write. Existing objects are untouched.
