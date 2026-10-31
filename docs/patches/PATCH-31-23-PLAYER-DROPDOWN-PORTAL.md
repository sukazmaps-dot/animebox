# Patch 31.23 — Watch Together player dropdown portal

## Problem
Episode and voice selectors in `AnimePlayer` render their menus as absolutely positioned descendants of the player. The Watch Together desktop player has a fixed-height shell with `overflow: hidden`, so a menu opened near the bottom of a short viewport is clipped by the player container. Increasing z-index cannot escape ancestor overflow clipping.

## Fix
- Extract the shared selector into `components/PlayerDropdown.tsx`.
- Render the menu through a portal into `document.body`; while native fullscreen is active, portal into the fullscreen element so the menu remains visible there too.
- Position the menu relative to the trigger using fixed viewport coordinates. Open upward when the lower space is insufficient, downward when there is room, and clamp horizontally.
- Limit the option list to the available vertical space and keep it independently scrollable.
- Preserve existing option data, selection callbacks, mobile native select, outside-click close, Escape close, focus return and synced Premium theme variables.

## Scope
No database/API changes, migrations, dependencies, player source changes, Watch Together synchronization changes or global overflow overrides.

## Verification
- `npm run player-dropdown:check`: deterministic viewport geometry cases.
- `node scripts/player-dropdown-portal-browser-smoke.cjs`: browser regression with an `overflow: hidden` player fixture, upward/downward placement, scrolling, episode/voice selection, outside click and Escape.
- AnimeBox Quality Gate TypeScript, lint and Production build.
