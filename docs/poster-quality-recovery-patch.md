# Audit patch 3: Poster Resolution Ranking and Media 204 Soft-Fail

## Goal and observed behavior

Investigate report of reduced poster resolutions being prioritized over appropriate card sizes and clarify the role of HTTP 204 responses from the media delivery pipeline.

Investigation traced candidate resolution from card components (`AnimeCard`) through metadata merge (`mergeAnimeImageSources`), candidate generation (`lib/image-service.ts`), and the Cloudflare edge worker (`infra/cloudflare/media-worker.js`).

### Root Cause Analysis

1. **Candidate Quality Ranking Discrepancy:**
   In `lib/image-service.ts`, `posterSourceQuality` assigned rank 3 to `/cover/large/` AniList paths, while paths containing `extraLarge` or general origin URLs lacked a specific pattern rule and fell back to default rank 2.
   Consequently, when an `extraLarge` source was explicitly provided alongside `large`, `buildImageCandidateChain` sorted the `large` variant ahead of `extraLarge`.

2. **HTTP 204 Soft-Fail Mechanism:**
   In `infra/cloudflare/media-worker.js`, `sourceSoftFailureResponse` deliberately returns `HTTP 204 No Content` with header `X-AnimeBox-Media: source-soft-fail` when an upstream provider (Shikimori or AniList) returns 403, 404, 5xx, or times out.
   This avoids surfacing disruptive 502/504 errors in browser consoles and allows `<img>` error cascades (`naturalWidth === 0`) to seamlessly advance to the next fallback candidate.
   When paired with inverted candidate ranking, a 204 soft-fail on primary media could cause cascades to prematurely settle on thumbnail-grade candidates (`/medium/`, 230px).

3. **External Provider Upstream Constraints:**
   Inspection of actual upstream AniList GraphQL payloads confirmed that AniList's `extraLarge` property consistently maps to CDN paths containing `/cover/large/`. AniList does not maintain a distinct `/cover/extraLarge/` folder path.
   The ranking adjustment ensures that if distinct `extraLarge` or custom uncompressed sources are provided, they retain strict priority over smaller pre-scaled versions.

## Implementation

- Adjusted `posterSourceQuality` in `lib/image-service.ts`:
  - Assigned rank 3 to paths matching `/cover/extraLarge/i`.
  - Normalized `/cover/large/` to rank 2.
  - Preserved existing rank 1 for `/cover/medium/` and rank 0 for `/cover/small/` and preview thumbnails.
- Preserved existing same-origin proxy fallbacks (`/api/image?url=...&optimize=webp`) and bounded candidate chains.
- Added explicit regression assertion in `tests/poster-responsive-recovery.cjs` ensuring `extraLarge` candidates remain prioritized above `large` for card presets.

## Acceptance and checks

- `npm run poster-reliability:check`: **PASS** (all 4 suites: `poster-visible-recovery`, `poster-responsive-recovery`, `poster-source-reliability`, and `patch32-1-1-reliability`).
- `npm run security:check`: **PASS** (all 6 static boundary and invariant checkers).
- `npm run css:inventory:check`: **PASS** (218 stylesheets verified).
- Local branch: `fix/poster-quality-recovery`.
