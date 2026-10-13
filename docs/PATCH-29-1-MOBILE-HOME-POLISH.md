# AnimeBox — Patch 29.1 Mobile UX & Performance Polish

## Goal and rationale
Promote the retention action before the social lobby for returning viewers, preserve discoverable Watch Together for new users, and reduce mobile first-screen weight. Patch 29.0 introduced social features above the original continuation shelf; legacy CSS had a 25rem minimum Hero which overrode older mobile heights. The public lobby had a window interval even while offscreen, though fetching was checked for visibility.

## UI acceptance
1. Homepage DOM flow: Hero → Continue Watching (only when real resume items exist) → Watch Together → Discovery (personal schedule, mood, recommendations) → existing shortcuts and catalog.
2. Existing HomeContinueWatching is mounted exactly once and receives items via useHomeFeedRuntime(); neither a new API request nor a second provider is permitted. Keep attribution, timecode, episode links and last-watched context unchanged.
3. Watch Together server header and two links remain visible without hydration; up to three actual joinable rooms, honest loading/empty/degraded/error views. Public snapshot must not reveal invite secrets.
4. For phones 391–768px, mobile Hero minimum height is 340px; 320–390px, 320px. Height auto-expands for long localized names; never clip title or actions. The primary and secondary watch CTA retain at least 44px height.
5. Compact social room grid: one column, small lazy posters, two-line names, episode/host/viewer count, button at least 44px. Narrow widths preserve all links without scrolling horizontally.
6. Respect light/dark theme colors, focus-visible and reduced-motion. No new autoplay or video transport.
7. Mobile Hero no longer applies expensive CSS filter or will-change on large backdrop/key-art images. Keep the already established single high-priority Hero backdrop and adaptive sizes; do not promote a second high-priority mobile image before field measurement.

## Client lifecycle / bandwidth
- Dedicated deferred import and IntersectionObserver, no player, chat transport, PeerJS, iframe or additional WebSocket in homepage.
- When observer enters proximity and document is visible: fetch once (subject to 30-second cooldown) and run a 30-second interval.
- On observer exit or hidden tab: stop the interval, abort an in-flight room-list request. No timer continues to wake the background page.
- On return: restart timer and fetch only if the cooldown has elapsed, otherwise wait until the next interval; respect aborted request and timeout.
- On unmount: disconnect observer and listeners; abort listing/join requests.

## Test matrix
Phones 320/360/375/390/430/768 px; tablet 1024px; desktop 1440/1920px; guest vs authenticated; zero/one/multiple resume items; empty/live/stale/full/degraded rooms; theme dark/light; prefers-reduced-motion; hidden tab, scroll-away/return; browser Back navigation and failed room join; save-data or 2G.

## Performance goals, not yet measured
Lighthouse mobile >=95 in a repeatable throttled lab profile; p75 LCP <=2.5s, INP <=200ms, CLS <=0.1 on actual traffic. No page-wide horizontal overflow, new iframes or new playback connections.
Measure on the production domain after CI and Railway deploy. Do not claim the target solely from source-level tests.

## Release gates / rollback
- npm run patch29-1:check and npm run patch29:check
- Existing home composition / home discovery invariants, TypeScript, ESLint, full prebuild gates, production build.
- Check production deployment of merge SHA in both Railway services.
- Roll back with revert; no database schema or API migrations.
