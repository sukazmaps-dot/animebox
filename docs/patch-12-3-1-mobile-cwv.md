# AnimeBox Patch 12.3.1 — Mobile UX + Tone of Voice + Core Web Vitals

## Baseline
- FCP: 1.5 s
- LCP: 3.2 s
- TBT: 90 ms
- CLS: 0.124

## Targets
- Keep FCP around 1.5 s or better.
- Bring LCP toward <= 2.5 s.
- Keep TBT around 90 ms and below 150 ms.
- Bring CLS below 0.10, preferably below 0.07.

Targets require a fresh Lighthouse / field measurement after deployment.

## Mobile visual QA
- Single Home Retention signal uses the full available width.
- Two signals use a compact horizontal rail without a fake empty slot.
- Three signals remain a horizontal rail.
- Keep 360 / 390 / 412 / 430 px safe.
- Do not change Telegram Mini App scrolling logic.

## Tone of Voice
Voice: direct, useful, familiar with anime culture, no corporate or AI-like wording.

Updated:
- quick navigation;
- mood picker;
- Home chat teaser;
- tracker/collection card;
- Home support card and support intro;
- Hero recommendation labels;
- metadata / social copy.

Do not claim AnimeBox has no ads.

## Core Web Vitals
- Hero is the stable first large Home geometry.
- Continue Watching is immediately after Hero, preventing local-history hydration from pushing the LCP candidate.
- Continue Watching posters are lazy and no longer compete with the priority Hero image.
- Hero image remains priority/high fetch priority; quality changes 60 -> 55.
- Mobile no-banner Hero uses gradients instead of the decorative fallback bitmap.
- Mobile Hero removes decorative filter/overscale work.
- Personal Pulse reserves its final height while its delayed profile request is in flight.
- Retention rail reserves its row height while room discovery runs.
- Numeric UI uses tabular numerals to avoid tiny width jumps.

## Non-goals
- No player / heartbeat / progress changes.
- No database migration.
- No Premium or streak changes.
- No recommendation model rewrite.
- No new runtime dependency.

## Acceptance
- No large dead area for one retention card.
- No horizontal page overflow at 360–430 px.
- Hero stays visually stable through hydration.
- Continue Watching remains functional.
- Personal Pulse does not pop from zero height after its profile request.
- Tone is consistent across the listed Home surfaces.
- TypeScript, targeted ESLint, retention tests and production build pass.
