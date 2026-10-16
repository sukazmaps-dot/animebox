# Patch 31.7 — player fullscreen and episode controls

## Trigger and diagnosis

In Android Telegram, the custom fullscreen control produced a black viewport with the Cinema header, selectors, episode navigation and tracking actions over the provider controls. The existing code already targeted `playerViewportRef`, not the entire card. Its fixed descendant still lived inside route/theater stacking and containing contexts; its CSS only hid global chrome, leaving local surfaces visible. The toolbar also retained a fullscreen button outside the media. A `flex: 1 1 340px` title block could grow vertically inside a column header. Legacy navigation CSS placed the all-episodes link inside the center selector with numerous breakpoint overrides. Page flex gap and component margins accumulated.

Kodik is an iframe. Direct playback uses the existing DirectVideoPlayer/video pipeline. Fullscreen does not change their keys, source URLs or mount location. This patch corrects geometry and fullscreen lifecycle; it does not claim to repair a provider/network outage that independently stalls playback.

## Implementation and ownership

- `hooks/usePlayerFullscreen.ts`: one lifecycle for native browser fullscreen plus CSS fallback; Telegram always uses CSS as the reliable player surface. The same element optionally enters the Popover top layer without a portal, reparenting or replacing the media. Older engines neutralize containing contexts on marked ancestors only while fullscreen is active.
- `app/tma-mobile-ux-v21.css`: owns fullscreen dimensions, sibling-surface isolation, backdrop and safe exit control. Sibling surfaces are hidden along the player ancestor path; hidden menus inside the player stay hidden. Body/root scrolling is locked and previous inline values/scroll restored.
- Telegram methods are gated with `isVersionAtLeast`: fullscreen/orientation 8.0, vertical swipes 7.7, BackButton 6.1. Exceptions and rejected host fullscreen leave CSS mode usable. Pre-existing host fullscreen, swipe disabling and orientation lock are retained on exit. An actual host exit closes the owned CSS session; failed entry does not.
- A temporary history entry preserves the URL and Next router state. The exit control, Escape, popstate and Telegram BackButton close the session. Listeners are removed on exit/unmount.
- `screen.orientation.lock('landscape')` is attempted where supported; Telegram locks only after the viewport becomes landscape, because its method locks the CURRENT orientation. On exit, owned locks are released and the entry screen orientation is restored on a best-effort basis. iOS and Android WebViews may reject forced rotation; manual rotation remains available.
- `components/AnimePlayer.tsx`: real DOM order is media, title/episode, source chips, two selectors. One primary fullscreen control is inside the media, away from the provider's bottom transport controls; in fullscreen it moves to the safe top corner. Current-provider status is separate from the selected Auto/Manual chip, preventing two selected chips.
- `components/EpisodePageDensity.module.css`: owns normal episode layout. Full-width media, title flex-basis reset, two equal selector columns, three equal-height navigation cells, separate full-width all-episodes row, two equal tracking action columns, 12px page gap. Existing provider selection, resume, analytics and episode callbacks are retained.
- `components/AnimeEpisodePage.tsx`: navigation and tracking actions precede supplemental progress/title information.
- `components/EpisodeQuickSelector.tsx`: all-episodes link is a sibling after the three navigation controls, not nested in the central selector.

No schema migration, Cloudflare Worker deployment or environment variable change is required.

## Automated verification

- TypeScript and targeted ESLint.
- Full existing `prebuild` contracts, with two legacy fullscreen checks updated to the new hook owner.
- Next production build.
- `scripts/player-fullscreen-browser-smoke.cjs`: real React fullscreen hook and EpisodeQuickSelector, compiled route CSS Modules and global route styles. 20 cases across 320, 360, 390, 412, 430, 844 and 1920px. Includes top layer/old-WebView fallback, transformed/paint-contained ancestors, iframe node and contentWindow identity, zero reloads, safe exit access, hidden internal control preservation, body lock/cleanup, browser Back, Telegram Back, Escape, rotation, API 6.0/7.6/7.7/8.0 gating, SDK failure and previously-owned host settings.
- `scripts/player-mobile-overlay-browser-smoke.cjs`: 14 existing compiled module layout cases, 320–1024px, cinema active/inactive. Fixture now models the actual icon-label structure and no longer invents a toolbar fullscreen control.

Browser harness dependencies are tooling only; app dependencies are unchanged. Supply `PLAYWRIGHT_MODULE_PATH`, `CHROMIUM_PATH`, and `ESBUILD_MODULE_PATH` when these tools are outside the project. Run `npm run player-fullscreen:browser`.

## Real-device acceptance checklist

These are follow-up manual checks, not claims of physical-device verification:

- Android Telegram current and an older client: Kodik iframe and AniLiberty direct playback, before playback and after seeking. Main fullscreen control opens only video; source/header/episode/status rows do not overlay it.
- Exit with own control, Android Back and Telegram BackButton; first Back exits video without leaving the episode. Repeat entry/exit and confirm playback position continues.
- Host fullscreen unsupported/rejected: CSS surface and exit remain usable. Already-fullscreen Mini App does not lose its prior host state on player exit.
- Rotate both ways, including portrait entry, landscape entry and denied orientation API. Ensure safe exit control clears the camera cutout and Telegram's floating chrome.
- iOS Telegram: CSS fallback, manual rotation, no accidental inline-video remount; check both notch orientations.
- Telegram Desktop and ordinary desktop browser: CSS host flow versus native DOM fullscreen, Escape, keyboard controls, window resize.
- Minimize/restore Telegram; compact/expanded Mini App and changed safe area/viewport height. Restore normal page scrolling and swipes after exit.
- 360–430px: source chips scroll if needed, selectors share a row, navigation stays 44px+, all-episodes button is separate, tracking actions cannot overlap video controls. Open each selector and all-episodes sheet.

Official API reference: https://core.telegram.org/bots/webapps
