# Patch 12 — Retention foundation

## Changes

- Continue watching appears before the discovery hero. The latest title has a larger card, accessible progress and keyboard focus.
- Local continuation uses the latest saved episode (including rewatches), excludes positions within 20 seconds of the end, and compares timestamps against server continuation.
- A newer server completion prevents stale local continuation from reappearing.
- Returning to the tab refreshes local and server history; concurrent recent-history requests are deduplicated.
- Onboarding's add-to-list action opens discovery rather than an empty library.
- Personal schedule explicitly describes Japanese broadcast times, not translated episode availability.
- Activation reports count ordered steps within the same session. Watching and modal authentication have separate funnels; automatic sign-in does not inflate modal conversion.
- Reports show warnings when their event sample hits its limit. These reports remain sampled, not unlimited database aggregations.
- Added retention regression checks to GitHub Actions.

## Verification

- TypeScript, targeted ESLint, production build, retention tests and played-coverage tests passed locally.
- Environment used Node 24; existing CI remains on the project's Node 22.
- External AniList returned HTTP 403 in this environment. Build used existing graceful fallbacks.
- Browser verification blocked: agent-browser daemon could not start and Chromium installation failed certificate validation.
- Live authenticated database reporting and cross-device player playback were not tested; no database migration required.

## Manual release checks

1. Mobile and desktop: start an episode, leave after a minute, return home. Confirm the first card opens the correct episode and player resumes.
2. Rewatch an earlier episode; confirm that latest activity wins over the higher episode number.
3. Continue on another device; refocus the original tab and confirm updated server continuation.
4. Finish a title and confirm an older local position does not resurrect it.
5. New guest: home still shows discovery, registration opens normally.
6. Admin activation: verify separate watch/auth funnels and sample warnings against real events.

## Remaining work

Cross-device preferences/voice selection, playback-start latency reporting, audience segmentation and browser end-to-end CI require a subsequent verified change. Existing D1/D7/D30 database metrics are unchanged.
