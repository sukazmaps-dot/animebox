# AnimeBox 12.5.4.1 — Home Layout Regression Hotfix

## Root causes
1. Home rendered only 8 Popular/Ongoing cards while the desktop grid uses 5, 6 or 7 columns depending on viewport. That guaranteed visibly incomplete second rows.
2. The Mood tool inherited a full-width editorial divider layout, while later density patches shrank its actual controls. On wide screens this produced a large empty band.
3. Mood had its own bottom divider while the following Smart Feed section also had a top divider/margin, creating a double separator and visual valley.
4. performance-v2 still applied a generic 480/360px contain-intrinsic-size placeholder to every non-first Home section. Ordinary Popular/Ongoing blocks no longer need that legacy reservation.

## Fix
- Render up to 14 Popular/Ongoing cards.
- CSS shows exactly two complete rows:
  - 5 columns -> 10 cards
  - 6 columns -> 12 cards
  - 7 columns -> 14 cards
  - mobile retains 8-card density.
- Mood becomes a compact max-width control strip on desktop, with slightly larger readable text.
- Remove Mood bottom divider and reduce Mood -> Smart Feed gap.
- Remove blanket Home-section content-visibility placeholder; explicit expensive sections keep their targeted performance hints.
- No API, personalization, tracking, card content or mobile navigation logic changed.
