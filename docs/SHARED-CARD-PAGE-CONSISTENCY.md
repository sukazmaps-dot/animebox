# AnimeBox: card and page consistency

## Problem and scope
The shared shell used warm charcoal/lavender tokens while route CSS retained blue-black surfaces, low-opacity labels and oversized spacing. Catalog columns could stretch a 2:3 poster to almost 300px wide. Recommendation and tracker markup had separate visual contracts.

## Implementation contract
- `AnimeCardContent` is the shared visual component used by `AnimeCard`, `SmartRecommendationCard` and tracker identity. It accepts media/details slots and `poster` or `inline` layout; links and controls remain owned by callers. This preserves recommendation impressions, feedback, saves and tracker status menus without nesting interactive controls inside links.
- Vertical posters reserve 2:3 space and use the same 14px radius, 14px/1.4 two-line title and 12px metadata. Catalog grid uses auto-fill columns at a 170px minimum, then two columns below 600px. Recommendation controls/reasons remain available.
- Tracker retains its useful horizontal variant. Snapshot data contains no poster URL: the existing brand fallback remains; no per-card metadata fetches or guessed image URLs are introduced.
- Weekly headers shrink from 62 to 44px, event padding from 10 to 7px, event gaps from 8 to 6px. Mobile rows remain at least 64px. All seven days and all releases remain accessible; 79 weekly events still require scrolling. No fixed viewport-height clipping.
- Tracker, schedule, leaderboard and Watch Together hub surfaces/text use `--ab-ui-*` theme tokens. Dark secondary text is opaque `#aca6b6`, accent `#a798cf`; light equivalents use existing theme tokens. Primary text is never reduced with alpha.
- Leaderboard uses a wider 1320px content maximum, shorter sections/podiums and a two-column season panel on wide screens. First-place distinction, medal colors and links remain.
- Watch Together hero/empty lobby are shorter; room grids adapt by available width. Active-room theater/player CSS remains independent.
- Empty page space is not filled with fake users/rooms. Content uses natural height and smaller bottom gutters.

## Acceptance checks
Production build and all repository prebuild gates; targeted TSX lint. Browser verification covers dark/light 390/1440/1920px, all seven schedule columns and dense fixture events, card aspect ratio/title typography, tracker label contrast, and empty/loaded hub layouts. Public user interactions require real account/session and are not asserted by unauthenticated layout fixtures.

## Release
Separate patch from PR #192. No environment variables, database migration, DNS or media Worker changes required. Merge/deployment can be reviewed from the final PR diff.
