# Schedule tooltips and dense interaction layout

## Scope / acceptance

1. Calendar event tooltips render through a React Portal into `document.body`, outside every clipped day column. They measure the anchor/panel, prefer the space above, flip below when needed and clamp to a 12px viewport inset. Long names wrap. Resize, ancestor scrolling and panel resizing trigger bounded animation-frame updates. Only an open tooltip observes/listens. Pointer hover and keyboard focus reveal it, Escape dismisses it, the pointer can enter the tooltip without dismissing it, and the link references it through `aria-describedby`. Native `title` is removed to avoid two overlapping descriptions. Clicking follows the original link.
2. Calendar time, poster and text share a centered grid row. Explicit column/row placement overrides legacy mobile ordering. Every week event remains present; phone week scrolling is retained. Metadata stays readable and rows remain within the existing 85px density ceiling.
3. Friends lists are bounded by an 1180px page and 560px person-card ceiling. Conditional request/friend sections form two columns from 1200px; a sole list spans the available columns. Discovery/activity panels keep their own two-column layout. Actions and friend mutations are unchanged.
4. When a ranking list exists, leaderboard podium/personal position sit beside the list from 1200px. Without lower-ranked entries the original single section remains. DOM reading order and all ranking calculations remain unchanged.
5. Anime library/notifications and the actual rating component share a two-column grid from 1000px. Rating is bounded at 680px; discussion is bounded at 1040px. Mobile stays one column. Episode cards, catalog cards and calendar events consume the common radius and use an accent border/background hover without vertical jumping.
6. Rating labels, episode metadata, genre labels, discussion labels and social text use semantic shared palette colors. Selected rendered labels must reach 4.5:1 in both themes. Profile customization and Kodik iframe rendering remain provider/user owned.

## Verification

- Full npm prebuild gates and production Next build; ESLint on changed components (existing image warning only).
- `scripts/schedule-tooltip-smoke.mjs`: real built calendar; portal parent, z-index, viewport edges, complete text, described-by association, keyboard/Escape, hover persistence at 390/1440/1920.
- `scripts/dense-interaction-smoke.mjs`: actual SSR-rendered rating/discussion components with auth/network mocked, series/friends CSS fixtures, both themes at 390/1440/1920. Bounded panels, two-column placement and selected label contrast.
- `scripts/page-consistency-smoke.mjs`: existing 30-route/theme/viewport regression suite; preserves the event-height ceiling and poster aspect ratio.

Authenticated friend actions, live rating submission and provider playback are not replayed in the visual fixtures. Check those normally after release. No database, secrets or DNS updates are required.
