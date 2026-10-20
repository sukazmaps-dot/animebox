# Patch 33.0 — Anime Detail: Compact Cinema / One-Place Interactions
Date: 2026-10-20
Target: `/anime/[slug]` in Next.js App Router. Source branch `main`, feature branch `feat/detail-compact-density`.
Scope: presentation-only. Avoid overlap with pending PRs #295 (watch controls), #296 (catalog recovery), #297 (home atmosphere).

## 1. Problem and principle
The current desktop detail page contains a 390px minimum-height hero, 96px tall episode cards, an extensive ten-star 2-row rating block in the 320px sidebar, a large library/notification surface and another large Watch Together CTA. A title with only three episodes leaves a large visually sparse grid. The combined result takes too many scroll screens for the core operation: selecting a show and episode.

Design principle: the first click starts watching. Secondary choices remain nearby but hidden until needed. Compact != tiny: >=44px accessible touch targets and visible focus states. Preserve useful personal data rather than deleting XP/ratings.

## 2. P0 Hero layout
- Keep the newly shipped dedicated 2:3 poster visible regardless of banner; banner stays a subtle, decorative, noninteractive background.
- Desktop >=1024: decrease base hero minimum from 390px to approximately 328px; poster from 220px to 192px (2:3), responsive if long title/description needs height. Content padding ~28px, gap ~9px, width reserve matching poster; long names wrap and cannot overlap art.
- At 768–1023: poster ~160px, content shrinks proportionally; do not force a 2-column internal text row that can collide.
- On mobile <=767: keep poster + title row, no newly introduced 150px empty top region, primary CTA visible without scrolling a giant banner. Preserve wrap of state chips/controls, especially 320px.
- Avoid fixed maximum height; CSS min-height allows genuine long or translated copy to expand rather than get cut off.
- The synopsis remains optionally expandable using the existing AnimeSynopsis component. Keep heading H1, canonical, SEO metadata, JSON-LD, genre links.

## 3. P0 Compact episode browser
- Component ownership: `components/CinematicEpisodeList.module.css` and `CinematicEpisodeCard.tsx`; only the cinematic variant, never the generic episode list or Watch Together.
- Without a thumbnail: interactive episode rows <=70px in typical desktop conditions, >=48px touch height; episode numeral ~40–44px slot rather than a tall 76px panel, title in a single/two-line adaptive label, play icon in a quiet 32px hit area within the whole clickable card.
- With a real thumbnail: 16:9 image still visible but capped at ~90px; do not distort or crop a real still incorrectly, maintain progress overlay.
- Keep the same `Link` destination, current episode indicator, watched states, playback resume %, durations and playback availability gating.
- Desktop list: 2 columns above 900px, 1 column at smaller widths; don't create filler ghost cards for odd counts. Reduce rows/gap so 3 or 8 episodes don't feel like giant cards.
- Seasons horizontal scroller is compact (>=44px touch); don't change selection/grouping, episode counts, manual resets, 'more' pagination and backend endpoints.

## 4. P0 Rating as progressive disclosure
- `AnimeRatingControl` adds optional `variant='compact'` scoped only to /anime/[slug] sidebar. Existing default rating markup/behaviour elsewhere unchanged.
- Default compact view is one <details>/<summary> line: star symbol, 'Моя оценка', selected score when known, community mean when loaded, right-hand chevron. 44px minimum height. Render no 10-star grid until user expands; do not fetch more than today. Do not gate the ability to expand for guests in other surfaces.
- On expand: same established ten-step 1–10 controls, currently selected score, message, delete action. Keep POST/DELETE endpoints, payloads, success/error/loading, account requirements. Keyboard/Enter/Space and focus work via native details; no extra JS overlay or focus trap. '1 star = 1 point' long explanation may be replaced by a concise instruction within expanded panel, but 10-point semantics must remain obvious.
- Keep separate AniList and AnimeBox/community ratings transparent; do not merge them.
- Don't accidentally mount two rating instances, duplicate IDs or duplicate auth checks.

## 5. P0 Sidebar: library/notification/together
- Use existing `AnimePersonalPanel`, `LibraryStatusControl`, `AnimeNotificationControl`; compact appearance via route-local styling.
- Single column of controls at <=1079px, sidebar 280–320px >=1080. No nested tall cards; avoid `min-height` > actual content. No redundant label 'My title' etc.
- For finished anime show concise inert message 'Тайтл завершён' with optional explanation in title tooltip, rather than a full multi-line bordered notification card; no subscribing to finished anime.
- 'Смотреть с друзьями' becomes one simple 44px link, not another callout. Preserve /watch-together URL and activation.
- Guest continues to see auth link from AnimePersonalPanel with original canonical next URL. Hide no essential functionality or post-auth state.

## 6. Hierarchy, spacing and UI rules
- Unify cross-section margins: hero → main ~20–24px; episodes and personal sidebar top-aligned. Related rail, aliases, franchise, discussion remain after primary grid.
- Content first, low visual chrome. Consistent radius 8–12px, thin border only where visually necessary, clear high-contrast title and first CTA.
- No new global stylesheet, no additional !important. Edit present component CSS Module owners; do not stack patch override on old rules. Remove or change contradictory definitions within existing files.
- Use CSS variables in both light/dark. Support reduce-motion and keyboard-visible focus.
- Do not change poster image origin pipeline, fallback, R2, Supabase, server APIs, progress or permissions.
- Do not touch /watch, /episode, home, tracker, catalog or /watch-together UI.

## 7. Acceptance tests
- Widths: 320,360,390,412,430,768,844 (landscape),1024,1080,1366,1440,1920; light and dark.
- Titles: long RU/Japanese, no banner, failed banner, poster-only, rich synopsis and no synopsis, many genres, 1/3/8/24 episodes, first/last, no confirmed playback, restricted title, signed-in/guest, currently watching.
- No horizontal page overflow; no hero text/poster collisions. Link to play, episode list, library and WT preserved.
- 48px typical episode touch surface; max 70px no-thumb desktop. Thumbnail episodes may be taller; no blank ghost cards for odd counts.
- Compact rating initially closed, one accessible summary. Press summary → 10 score buttons visible (at least 44px each), retain current score, API save/delete and keyboard focus. No two score widgets simultaneously.
- Regression: existing tests `scripts/anime-detail-layout-smoke.mjs`, `scripts/route-layout-matrix-smoke.cjs`, episode and rating interaction checks; introduce compact-rating-specific test. Quality Gate full prebuild, TypeScript, ESLint and production build. Do not update pin assertions just to silence failures: explain changes.
- Test screenshot review at 390/1366/1920 and production Railway health after CI, but do NOT merge or deploy this PR before checks.

## 8. Rollout and rollback
1. Implement isolated patch; send draft PR and attached guide.
2. Verify CI and real browser matrix, check visual artifacts and accessibility.
3. Merge only on explicit release approval or established release handoff. Railway auto deploy from main, verify final commit, one healthy replica and API/HTTP status.
4. On regression revert PR, leave API/DB untouched.

## 9. Deferred work
The home minimalism redesign and global design-token consolidation are separate PRs. Do not change the hero ranking, recommendations, chat or watch-party room creation.
