# AnimeBox 12.5.0 — Resume Core + Player Identity

## Goal
Make returning to an episode reliable across refreshes, abrupt WebView closes and devices, while moving the player away from the generic AI/SaaS visual grammar.

## Resume Core
- Signed-in viewers now receive a scoped local crash journal in addition to server progress.
- Guest progress remains local-only and cannot award watch time, achievements or leaderboard credit.
- The freshest usable local/server position wins by timestamp for resume only.
- Old guest entries can be migrated into the current signed-in viewer scope when they are the freshest local resume.
- Resume thresholds scale for short episodes while normal/long episodes keep the familiar ~10s start and ~20s ending guard.
- Startup samples before a forced resume seek lands are ignored by both local persistence and server watch tracking.
  This prevents a 0s -> resume jump from being mistaken for watched time or an opening skip.
- Source/translation retry and fallback now hand off the latest observed position instead of reusing the original page-load resume point.
- Hidden-page heartbeat uses fetch keepalive so Telegram/mobile backgrounding is less likely to lose the final sample.

## Anti-cheat contract
No local value is used as trusted watch coverage.
Server heartbeat sequencing, plausible-advance checks, coverage ranges and 90% completion remain authoritative.

## Player Identity
- removed ambient violet halo around the whole shell;
- flattened utility controls and source switcher;
- standard controls use 5–7px geometry while the feature shell stays softer;
- warm editorial signal is used as a small marker, not another CTA color;
- provider/quality surfaces are separated by tone instead of neon borders;
- play CTA is media-first and dark rather than a glowing gradient orb;
- Next Episode remains the primary accent action;
- no new images, fonts or JS animation libraries.

## Next
12.5.1 can build Next Episode Flow on top of this resume handoff:
auto-next policy, completion transition, season boundary navigation and immediate Continue Watching refresh.
