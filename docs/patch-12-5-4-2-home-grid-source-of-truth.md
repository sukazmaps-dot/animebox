# AnimeBox 12.5.4.2 — Home grid source-of-truth fix

## Root cause
12.5.4.1 rendered 14 cards and hid different counts at desktop breakpoints,
assuming the grid became 5/6/7 columns. A legacy rule in design-v2-content-first
kept Home at 5 columns even on very wide screens, so the card-count logic and
the actual grid disagreed. DevTools width changes made the mismatch especially visible.

## Fix
- Popular and Ongoing render 10 cards on Home.
- Desktop Home has one explicit contract: 5 columns x 2 rows.
- No desktop nth-child hiding is used.
- Tablet remains 4 columns and hides after 8 so both rows stay complete.
- Mobile keeps the established 8-card density.

## Mood
Removed space-between composition. The intro and five mood controls now form one
compact left-aligned group instead of two islands across the page.

## Smart Feed rail
Added a semantic rail class, right-edge fade and extra track inset.
On desktop the right scroll arrow remains softly visible when more content exists,
so a partially clipped card reads as horizontal continuation rather than broken layout.

No recommendation, tracking, API or card-data logic changed.
