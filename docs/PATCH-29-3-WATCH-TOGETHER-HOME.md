# Patch 29.3 — quiet Watch Together homepage surface

## Problem
The homepage social section sits 12px below the hero, uses a purple gradient and saturated CTA, and contains another large dashed panel for an empty lobby. It competes with playback and reserves too much space for an empty state. The right rail already shares the hero's row; leave the homepage grid intact.

## Design specification
| Element | Desktop | Mobile (<=760px) |
|---|---|---|
| Outside spacing | 28px above/below | 20px above, 24px below |
| Padding | 22px vertical, 24px horizontal | 18px vertical, 16px horizontal |
| Radius | 14px | 12px |
| Heading | 22px / 1.3, weight 650 | 20px / 1.3 |
| Description | 14px / 1.6 | 14px / 1.6 |
| Eyebrow | 10px / 1.5, weight 600 | same |
| Actions | 44px minimum height, 13px text, 10x14px padding | 44px minimum, wrapping allowed |

- Reuse `--ab-ui-surface`, `--ab-ui-raised`, `--ab-ui-border`, `--ab-ui-text`, `--ab-ui-muted`, `--ab-ui-accent` in both themes. No purple gradient, glow or saturated CTA.
- Header: copy and actions aligned vertically; stack at <=1000px. Actions form two columns on mobile, one column at <=360px.
- Empty state: icon and copy alongside a single top divider. No dashed enclosing border, secondary background or minimum height. Height follows text.
- Loading state: compact full-width text row. Deferred lobby reserves 80px instead of 142px before mounting.
- Live rooms: retain three/two/one columns, readable 14px titles and 12px metadata, 44px join targets. Long titles and host names cannot stretch the grid.
- Preserve keyboard focus and reduced motion. The section must not clip focus outlines.
- Keep hero/resume/social/discovery order, right rail, room selection, polling, secure join, guest authentication and analytics unchanged.

## Acceptance
- Test dark/light at 320, 360, 390, 768, 1024 and 1226px with empty/loading/three-live-room fixtures.
- No action/card/copy extends outside the viewport; every action is at least 44px tall.
- Empty desktop section stays below 240px with the current copy and a 1226px content column; height remains intrinsic for larger text or translations.
- Run existing Patch 29 and 29.1 checks, TypeScript, targeted ESLint and all prebuild checks. CI runs the production build.
- Fixture tests verify layout, not live room data or Android rendering.

## Rollback
Revert this PR. No database or API changes.
