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

3. **External Provider Upstream Constraints & Contract:**
   Inspection of actual upstream AniList GraphQL payloads confirmed the provider's exact layout:
   - `coverImage.extraLarge` -> `.../cover/large/...` (the highest resolution available on their CDN, ~460x650)
   - `coverImage.large` -> `.../cover/medium/...` (downscaled thumbnail, ~230x325)
   - `coverImage.medium` -> `.../cover/small/...` (icon thumbnail, ~100x150)
   AniList does not maintain a distinct `/cover/extraLarge/` folder path on their CDN.

4. **Impact of 204 Soft-Fail on Fallback Cascade (Client-Side Consumer Fix):**
   The Cloudflare Media Worker code itself (`infra/cloudflare/media-worker.js`) remains intentionally unchanged: its 204 soft-fail contract is necessary to avoid 502/504 errors on external origin outages.
   What this fix repairs is the **client-side consumer behavior** (`lib/image-service.ts` -> `buildImageCandidateChain`):
   - When the primary media endpoint returns 204, the browser image cascade (`AnimeImage.tsx`) detects `naturalWidth === 0` and advances to candidate #2.
   - Under the unified candidate chain, candidate #2 is the same best-known original routed through `/api/image?url=...&optimize=webp`, rather than immediately downgrading to a 230px thumbnail (`/medium/`).
   - Non-AniList sources (Shikimori `/original/` vs `/preview/`, MyAnimeList/Jikan uncompressed vs `t.jpg`) preserve their highest-quality original at the front of the chain, preventing degradation across all providers.

## Implementation

- Adjusted `posterSourceQuality` in `lib/image-service.ts`:
  - Assigned rank 3 to paths matching `/cover/extraLarge/i` (if provided by mirrors or custom overrides).
  - Normalized `/cover/large/` to rank 2.
  - Preserved existing rank 1 for `/cover/medium/` and rank 0 for `/cover/small/` and preview thumbnails (`/preview/`, `/x48/`, `/x96/`).
  - Unmatched uncompressed origins (such as Shikimori `/original/` or MAL full paths) retain default rank 2, ensuring parity with AniList originals without artificial down-ranking.
- Preserved existing same-origin proxy fallbacks (`/api/image?url=...&optimize=webp`) and bounded candidate chains.
- Updated `tests/poster-responsive-recovery.cjs`:
  - Added regression test reflecting real AniList GraphQL payload (`extraLarge` -> `/cover/large/` vs `large` -> `/cover/medium/`).
  - Added regression test for explicit `/cover/extraLarge/` mirror overrides.

## Acceptance and checks

- `npm run poster-reliability:check`: **PASS** (all 4 suites: `poster-visible-recovery`, `poster-responsive-recovery`, `poster-source-reliability`, and `patch32-1-1-reliability`).
- `npm run security:check`: **PASS** (all 6 static boundary and invariant checkers).
- `npm run css:inventory:check`: **PASS** (218 stylesheets verified).
- Local branch: `fix/poster-resolution-ranking`.
