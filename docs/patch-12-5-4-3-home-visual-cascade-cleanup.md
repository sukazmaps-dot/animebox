# AnimeBox 12.5.4.3 — Home Visual Cascade Cleanup

## Root cause

The broken purple marker was not a component bug. Three CSS generations were
composing the same heading:

1. globals.css created an absolutely positioned .section-title::before marker
   and reserved space with padding-left.
2. design-v2-content-first.css hid the old section icon assets.
3. patch12-4-5-identity-foundation.css later removed the title padding.

That left the absolute marker alive with no reserved space, so it could touch or
overlap the first glyph. Its em-based positioning also made it look different
between "Что смотреть дальше", "Популярные аниме" and "Продолжить просмотр".

The Mood divider regression came from 12.5.4.2 setting width: fit-content on the
<section class="mood-picker"> itself. Because the border belongs to that section,
the divider became only as wide as its controls.

## Fix

- Home section marker is now a static flex item: 2px x 14px.
- One Home heading contract controls gap, line-height and marker alignment.
- Legacy Home section icons stay hidden so there is one visual grammar.
- Continue Watching uses the same marker without attaching it to the eyebrow.
- Mood section is full-width again.
- Mood content remains compact and left-aligned through the existing two-column grid.

No Home data, recommendation, tracking, player or navigation logic changed.
