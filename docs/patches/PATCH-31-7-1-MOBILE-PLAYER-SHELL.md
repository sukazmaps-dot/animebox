# Patch 31.7.1 — mobile avatar bounds and playback controls

## Report and causes

User screenshots after 31.7 show (1) a large avatar escaping the bottom navigation on an Android Telegram landscape viewport, (2) two episode selection surfaces on the ordinary episode page, and (3) a fullscreen text badge obstructing the video/cover.

- The compact landscape shell enables mobile navigation through 1100px, while the base `.mobile-nav__avatar` display/clipping and image sizing lived only in the <=768px block in `visual-refresh.css`. Landscape rules set wrapper dimensions without the missing base clipping/display contract. Premium image zoom amplified the overflow.
- `showEpisodeNavigation={false}` disabled AnimePlayer's bottom navigation, but did not disable its separate episode dropdown; AnimeEpisodePage also rendered EpisodeQuickSelector.
- The primary fullscreen button's label became visible at >=390px. In narrow video viewports this occupied a substantial part of the frame.

## Changes

- Move the existing avatar/media base rules outside the portrait-width media query in the same owning stylesheet, `app/visual-refresh.css`. Preserve breakpoint dimensions, circle clipping, crop/zoom and guest icon. Give the nav image intrinsic 24x24 dimensions as well.
- Add explicit `showEpisodeSelector` with default true. The normal episode page sets it false and retains EpisodeQuickSelector as the episode selection owner. Embedded/Watch Together retains its selector. A single translation/quality dropdown spans both columns through the existing EpisodePageDensity owner.
- The existing primary fullscreen control is an icon-only 44x44 button, with its accessible label, keyboard focus indicator, safe-area exit placement and fullscreen lifecycle intact. Normal overlay background is less opaque. No media source, key or iframe mounting changes.

## Verification

- `scripts/mobile-player-shell-smoke.cjs` uses the actual MobileAccountNav component with an auth fixture, actual PlayerDropdown/header/fullscreen JSX extracted from the TypeScript AST, and actual EpisodeQuickSelector. Loads global route styles and compiled owning CSS module. The small fixture utility set includes sizing/layout utilities from the source markup.
- 14 portrait/landscape cases: 360x800, 390x844, 430x932, 740x360, 844x390, 960x440, 1100x500; image zoom 1 and 3. Checks bounded avatar and clipping outside its frame, no overflow, one episode picker, full-width bounded-height translation selector, 44x44 icon-only fullscreen and retained embedded selector.
- This regression runs with the existing episode-controls browser step in GitHub Quality Gate.
- Rerun existing fullscreen lifecycle/iframe identity browser matrix, TypeScript, targeted lint, prebuild and production build.

## Device follow-up

Check real Android Telegram portrait -> landscape -> portrait with a cropped/zoomed avatar. Verify guest fallback too. On Chrome and Telegram, open an episode: one episode selector below the player, voice/quality above navigation, unobtrusive fullscreen icon on cover and playback, accessible exit in fullscreen. Watch Together must retain its own episode control.

These browser fixtures do not claim physical-device playback verification. No database, Worker, deployment config or environment changes are needed. Long hero titles remain a separate planned patch.
