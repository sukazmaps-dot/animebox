# AnimeBox Patch 30.6 — Premium page geometry (four screenshot audit)

Branch: `patch-30-6-premium-page-geometry` from production `main` SHA `c53c8d387088b30d055c6bc2f1ba47d1e02461f0`.
Scope: four supplied screenshots (desktop title interaction panel, mobile tracker, mobile anime detail, mobile home). Independent of PR #234 metadata, #235 player and #236 SEO. No production deployment and no SQL migrations in this patch.

## CSS-source triage: where rules actually originate

This is a static cascade trace of class selectors + actual JSX bindings from repository source; browser computed-style verification must still run as a release gate. Avoid inferring that unused CSS module selectors apply:

1. `app/anime/[slug]/page.tsx` renders `layout.*` classes from `detail-layout.module.css` (NOT the older `styles.hero`, `styles.personalGrid` names in `page.module.css`).
   - `detail-layout.module.css` old `.secondary` grid `minmax(0,640px) auto` created a second, unconstrained column for a plain text watch-party link on desktop.
   - The same file defined a footer-heavy weak mobile gradient *twice*; last `.hero::after` at end of file overrode the earlier one.
   - `.genres > a + a::before` inserted a leading dot whenever a flex-wrapped link started a new row.
   - `.aliases summary` lacked the plus/minus indicator used by `.franchise > summary`.
   - `AnimePersonalPanel.module.css` duplicated 10-star grid layout and tiny summary overrides on top of `AnimeRatingControl.module.css` and `app/patch18-4-6-rating-cascade.css`.
   - No blanket `!important` overrides are added to fix this.
2. `app/list/page.tsx`, `app/tracker-library-compact.css` and `app/tracker-responsive-grid.css`:
   - The compact status had nested wrapper *and* trigger borders; mobile render visibly showed two.
   - `public/brand/icons/planned.svg` used an actual plus-path, despite the saved state already being `planned`.
   - `app/community.css` defines `.tracker-card::before` with `top:12px;bottom:12px`; `app/design-v5.css` changes it to 14px. Both create the clipped left stripe; remove for responsive tracker cards at their route scope without changing other cards.
   - Repeated eyebrow lives directly in `app/list/page.tsx`.
   - Actual progress is available as `item.progress`; do not invent episodes for planned titles or fabricate rating fields not present in tracker snapshot.
3. `components/HomeHeroCarousel.tsx`, `app/patch29-1-home-mobile.css`, `app/patch30-0-home-streaming.css`, `components/HomeHeroSocialLink.module.css`, `components/HomeHeroPagination.module.css`:
   - Mobile candidate list previously took `anime.mobileHeroImage` before `anime.coverImage`, even if the custom image was panoramic; new order prioritizes actual cover poster, falling back to old media only when needed. Desktop backdrop order is unchanged.
   - One `<picture>` and one Next/Image stay in place to avoid duplicate mobile downloads; the mobile source becomes poster-first, at an actual 2:3 right-hand slot, with stronger responsive scrim.
   - Earlier `patch29-1-home-mobile.css` explicitly set `max-width:100%`, `overflow:visible`, and no line clamp for the title. Replace that source rule instead of adding a new global patch.
   - The oversized third watch-together link is hidden *only* at mobile widths; home watch-party section remains available.
   - `HomeHeroPagination.module.css` is already the sole owner of navigation positions; update it for aligned background, 44px targets and 320px narrow safety.
4. `components/HomeContinueWatching.tsx` assigned `styles.featured` to first card, whereas `HomeContinueWatching.module.css` enlarged the first card and gave it a different color/border model. Remove use of the featured class; all cards share one geometry.
5. `components/home/HomePersonalRetentionSections.tsx` showed a skeleton/schedule heading during load with no actual `personalScheduleItems`. Hide the whole personalized block when there are no real entries, instead of an orphan title and configure button. The general public `HomeScheduleSection` is unchanged.

## Acceptance criteria: desktop detail

1. The main personal panel is single column, max 680px. `LibraryStatusControl`, optional inline notification, rating, and a full-width watch-party CTA line up on the same left/right edges; 8/12/16px spacing and at least 44px interactive height.
2. Finished titles show a *noninteractive* textual status, not a dead bell button; ongoing titles retain operational notification settings.
3. The rating scale is a 10-point accessible button group, not a stretched 10-star horizontal void. One owner for star grid layout and sensible 440px width cap; summary at readable font size, clear control is a real touch target.
4. `Другие названия` and `Порядок частей` are native semantic `<details><summary>` elements sharing plus/minus affordance and 52px summary.
5. Watch-party CTA and alternate titles do not overlap rating or leave their parent grid.

## Acceptance criteria: mobile tracker

1. Card poster retains 2:3 dimensions. Remove each card's duplicate eyebrow; first line is anime title, not redundant category text.
2. One status border only. Dropdown opens above neighbor card via existing positioned menu; no clipping or horizontal overflow.
3. `В планах` uses bookmark, never misleading plus icon. No fake progress; real tracked episodes display the existing count, resume episode and progress bar. Planned titles with no trackable history show small `Просмотр ещё не начат`.
4. No clipped purple stripe. Filter `Все / Смотрю / В планах / Просмотрено / Брошено` stays functional. Empty-state remains actionable; card count and footer adapt to available items.

## Acceptance criteria: mobile anime detail

1. Hero includes a strong theme-aware left/bottom scrim, with identity content starting below upper art; text has readable contrast over background. Separate true horizontal AniList banner only; when unavailable use the existing small 2:3 poster instead of stretching a cover image to banner shape.
2. Main play action and circular action row occupy real normal-flow height. No icon overlap on description or outside hero at 360, 412 or 768px.
3. Translate/dedupe `Military/Военное` and `Space/Космос`, plus genres already registered in taxonomy. No leading dot on wrapped line; unknown tags aren't falsely translated.
4. Season heading and open-watch link align centrally on shared baseline, with mobile wrapping at narrow screens and no overflow.

## Acceptance criteria: mobile home

1. Portrait hero art from `coverImage` is the *first mobile choice*, rendered at aspect-ratio 2:3 in an independent right-hand position; horizontal `bannerImage` is fallback only. Desktop wide hero retains scenic banner.
2. Hero title line clamps at two and max width 80%, with `clamp()` font scaling and enough scrim contrast. Two visible mobile actions `Смотреть`/`Подробнее`; the social CTA stays on desktop and in its separate homepage section.
3. Pager counter and five dots share one background strip, buttons are all at least 44x44px and keyboard focus remains visible at 320–1920.
4. Continue-watching cards share poster width, border radius, height, progress and arrow geometry (first index is no longer visually special).
5. The personalized schedule renders only if the user has actual upcoming entries. The general schedule component remains available.
6. Remove unnecessary blank vertical space where practical without enforcing fake fixed-height content.

## Testing

- Source contract test: `node tests/patch30-6-visual-contract.cjs`.
- Existing checks: `node scripts/patch30-0-home-streaming-check.mjs`, `node scripts/home-hero-pagination-smoke.cjs` in Chromium, `node scripts/anime-detail-layout-smoke.mjs`, `node scripts/route-layout-matrix-smoke.cjs`, `npx tsc --noEmit`, lint, production build.
- Responsive matrix: 320px, 360px, 390px, 412px, 768px, 1024px, desktop 1440px, 1920px; light/dark and Android Chrome/WebView if available. At each width test title/card right boundaries, interactions, no horizontal document scrollbar; screenshot 360+412.
- Manual: preview several titles *with* an AniList banner and *without* one, one finished anime and one ongoing, planned+watching+completed tracker, hero with very long title, private vs guest, toggle both themes. Toggle watch party link and accordion, rate 1/5/10, remove rating, change library status, and resume real progress.

## Safety and release

- No Supabase schema changes or writes; no Railway deployment from this branch.
- Existing main CSS files are edited in place; no new `app/patch*.css` import is created. No new blanket document overflow hacks. Existing `!important` values were not removed indiscriminately, because other legacy page contracts rely on them.
- Before merging, require green CI + responsive smoke and user approval. Roll back by reverting the single PR merge. Check Railway service health and live mobile screenshots after release.
