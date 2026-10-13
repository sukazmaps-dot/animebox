# Patch 29.2 — mobile title actions overlap & Watch Together readability

## Evidence
- Android Chrome: two cinematic action buttons (Favorite and Add to tracker) visually overlap the first lines of the AnimeSynopsis description.
- Mobile Watch Together hub is visibly compressed: desktop-like layout and micro typography in result cards, lobby tabs, buttons and invite form.

## Root causes found
- The cinematic detail JSX references layout.actions, but the imported detail-layout.module.css had no action layout class, leaving the wrap and spacing to older generic rules.
- The legacy mobile CSS has competing flex/grid declarations around anime-detail-actions. No intrinsic mobile block dimensions were guaranteed at the new integration boundary.
- The Watch Together CSS includes a number of 7–10px type rules and multiple later grid rewrites. A last, hub-scoped mobile contract is safer than broad global changes.

## Fix requirements
1. Keep actions in normal document flow and reserve full wrapped height. Movie playback is full-width; favorite and tracker buttons each have an independent 48px circular touch surface on a second row.
2. The description is a separate block, after actions and before genres. No negative margin, overlay, fixed height, or absolute positioning.
3. The same solution works whether the tracker button is present or disappears after saving, and when progress labels or save errors are shown. Long localized titles and font enlargement must not overlap.
4. Mobile Watch Together: a stacked hero/invite card, 1-column lobby and anime results, native readable fonts (11–16px+), touchable 44px primary buttons, and no horizontal overflow at 320/360/375/390/430/720px.
5. Leave room APIs, video players, authentication, existing tracker behavior, desktop grids, and dynamic imported components untouched. Preserve light/dark theme via existing CSS variables.
6. Reduced-motion media query retains function with no decorative transitions.

## Verification
- npm run patch29-2:check; TypeScript; targeted ESLint; production build and all existing prebuild checks.
- Manual visual testing: mobile widths 320, 360, 375, 390, 430 and 720; long text; no text; action busy / saved / unsaved; guest; live and empty rooms; mobile with browser text scaling 125%; light/dark.
- Success: last circular action bottom is strictly above description top; no horizontal page overflow; buttons respond to touch; Watch Together cards readable without pinch zoom.
- If CI passes merge PR and monitor Railway service deployments for exact merge SHA.

## Rollback
Revert the PR; no SQL migration or data changes.

## Browser geometry regression
- Install Playwright 1.62.1 and run `npx playwright install chromium` once, then `npm run anime-layout:check`.
- Quality Gate installs pinned Playwright in a temporary directory and Chromium and runs this check before TypeScript and production build.
- Covers 160 fixtures: dark/light; 320/360/375/390/430/720/767/768/1024/1920px; 100%/125% text; guest/saved/resume/error states.
- Measures button bounds, wrapper containment, synopsis separation, viewport overflow and mobile touch targets using real source CSS. Global imports follow `app/layout.tsx`; CSS Modules use Next's scoping plugins; Tailwind is compiled.
- Offline DOM fixture, not a React interaction or deployed-page test. Does not verify authentication, playback, remote media, live rooms or Android rendering.
- Local check passed with Chromium 153 via `CHROMIUM_EXECUTABLE_PATH`; CI uses the browser installed by pinned Playwright.
