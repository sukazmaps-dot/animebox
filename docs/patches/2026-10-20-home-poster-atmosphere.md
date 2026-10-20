# Patch 32.9.1 — Poster Atmosphere Resilience (desktop home hero)

## Observed bug
A 1920px desktop home screenshot shows «Что посмотреть сегодня?» with a sharp 2:3 JoJo Steel Ball Run poster only on the far right and a nearly uniform dark rectangle spanning the rest of hero. The main banner is absent on this render, although poster_url exists.

## Verified root cause
- Home feed prioritizes saved, playable Supabase cards for speed and reliability. `anime_saved_playable_catalog`, `anime_search_documents` and `anime` store `poster_url`, not `bannerImage`.
- `enrichHomeHeroArt` makes a best-effort batched AniList request (2s); upstream circuits can open and art enrichment returns the unchanged saved items.
- `HomeTonightArtwork` selects `anime.bannerImage` on desktop, falls back to the poster in a crisp **2:3 slot** when absent or the banner fails. Existing CSS deliberately paints only a radial gradient behind that slot. Thus, the screen is not necessarily a broken image request: it can be a complete poster and missing wide banner.
- This is worsened by upstream unavailability but cannot be fixed reliably by increasing network retries or requiring a new external request per featured card.

## Implementation
- Preserve the real desktop banner if available and healthy, preserve the image component's fallback sequence and error signals.
- With no successful banner on desktops >=769px, render a second **decorative** instance of the same cover image as a low-detail, highly blurred, dim ambient backdrop. The sharp 2:3 poster remains the only legible/full-resolution artwork.
- Use identical image candidate, preset, quality and responsive sizes for poster/backdrop so browser can coalesce the actual media request. The ambiance is never a new server endpoint and never writes R2 data.
- The ambiance becomes visible **only after a real image load**. When all sources fail or the brand fallback appears, stay with a neutral CSS gradient and the original poster slot; no giant blurred brand logo.
- Use a noninteractive layer, dim left-to-right scrim for title and CTA contrast, `prefers-reduced-motion` guard; render no extra art layer on phones.
- Component + CSS Module only; no new global CSS, database schema or changes to recommendation logic.

## Acceptance
- Desktops 1366/1920, dark/light; no-banner and broken-banner scenario: poster remains sharp in 2:3, broad background has actual color/texture after load. Body, buttons and bookmark stay clickable and not obscured.
- Real banner present: no extra poster atmosphere/extra download, existing hero layout intact.
- Mobile <=768: no duplicate ambiance request, no poster/copy overlap.
- Network poster failure: fallback never grows into a giant logo or transparent loader; page remains readable.
- Browser test in `scripts/home32-browser-smoke.cjs`: requires loaded blurred, full-card, pointer-events none, same poster currentSrc; screenshots and geometry regression matrix.
- Before merge: Quality Gate success and browser screenshots. Production must remain unchanged until explicitly merged; release can follow once safe.

## Follow-up (optional, distinct)
If true wide image is desired on offline visits, plan separate persisted `banner_url` metadata with proper sync and freshness. This is NOT required to cure the empty hero today.
