# AnimeBox Patch 12.3.2 — Mobile Home rhythm and layout stability

## Problem

A Telegram/Android screenshot after Patch 12.3.1 still showed a large blank transition between the personal schedule area and the Mood Picker.

The cause is CSS cascade debt rather than a missing card:
- older mobile Home styles still apply 30–44 px section margins with !important;
- Mood Picker owns an additional independent top margin;
- personal surfaces were designed across several generations of Home CSS.

## Fix

A final Home-scoped spacing contract is loaded last.

Mobile rhythm:
- tight: 12 px
- related surfaces: 18 px
- normal section: 26 px
- major adjacent sections: 28 px

Specific schedule -> mood transition:
- 16 px at <=720 px
- 14 px at <=390 px

Also:
- personal schedule cannot leave bottom margin/padding residue;
- Mood chips keep a fixed mobile height and truncate long secondary copy;
- Mood -> recommendations uses one 26 px section transition;
- Personal Pulse loading state now renders the same semantic structure as the real pulse instead of an almost invisible blank strip;
- existing safe-area behavior is preserved.

## Scope limits

No changes to:
- player / Kodik;
- watch heartbeat or progress;
- recommendation ranking;
- Premium animated media;
- streak;
- Supabase schema;
- Telegram auth / subscription gate.

No database migration is required.

## QA

Check:
- 360, 390, 412, 430 and 768 px;
- Android Telegram Mini App and regular browser;
- personal schedule present / absent;
- Home pulse cached / loading;
- retention with 1 / 2 / 3 signals;
- mood horizontal scroll;
- bottom nav overlap;
- no horizontal page overflow.

Run TypeScript, targeted lint, retention checks and production build.
