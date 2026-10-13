# Compact anime detail page

The mobile detail page previously used a full-height poster hero, a separate metadata passport, tall rating panels and a continuous list of episodes/franchise links. A title such as Gurren Lagann required several screens before reaching useful controls.

## Result

- Mobile poster is 112×168 with its own rounded frame; title sits beside it. Desktop keeps the existing two-column hero.
- Valid AniList cover color supplies a restrained background tint; the existing banner is blurred at low opacity. No canvas extraction or new image request pipeline.
- Release, format, episode count, status and AniList rating appear once as wrapping chips. Watch/resume keeps the existing availability and progress logic and is above the tabs on the first screen for typical titles.
- Info, Episodes and Parts, Discussion, and Related tabs use arrow/Home/End navigation, associated panels and roving focus. Server content remains in the DOM; switching preserves client state.
- Full synopsis remains rendered; the default view clamps to four lines with an accessible expand button. Alternate titles use native details.
- Library and community rating share a compact panel. All ten score buttons and save/error/login states remain available.
- Mobile episode links form a five-column grid with watched/current/progress states and accessible episode labels. Franchise cards use smaller thumbnails.
- Styles stay in CSS modules, with dark/light variants. No schema or API changes.

## Validation

Local full `npm run build` (all existing prebuild gates), `tsc --noEmit`, targeted ESLint and `git diff --check` passed. The pre-existing raw-banner img lint warning remains.

DOM interaction checks passed: one visible panel, arrow and End focus, preserved input/description state, expand/collapse, full synopsis text, and no toggle for short descriptions.

Browser screenshots and real Android/Telegram testing are still required. Local provider requests received AniList 403; Chromium download was blocked/truncated in this environment. These are not reported as successful visual QA.

## Release check

At 360/390/430/768/1440/1920 px, verify no horizontal page overflow, title/poster balance, visible first-screen watch button, long RU names, all ten ratings, episode selection/progress, panel keyboard navigation, light theme and copyright-restricted titles. No migration needed.
