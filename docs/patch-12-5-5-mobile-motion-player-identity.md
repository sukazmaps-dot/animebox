# AnimeBox 12.5.5 — Mobile Motion + Player Identity v2

## Scope
This patch finishes the remaining feedback loop without redoing catalog work
that already shipped in 12.5.2.

## Mobile navigation
The phone action bar now behaves like a stable app control:
- ignores scroll noise below 3px;
- requires 52px sustained down-travel before hiding;
- requires 34px sustained up-travel before returning;
- has a 260ms toggle cooldown so direction changes cannot make it flicker;
- always returns near the top of the page;
- stays visible while typing, using selects, or while an aria-modal /
  data-mobile-nav-lock surface is open;
- animation is transform/opacity only.

## Catalog
No reimplementation: Catalog/Saved tabs, multi-genre filters, year, status and
the separate Mood filter remain the canonical implementation from 12.5.2.

## Player Identity v2
- Player header is denser and media-first.
- Source controls are one compact cluster rather than glowing SaaS buttons.
- Auto source now has proper pressed/active semantics.
- Resume cover loses the ping/glow rings and uses a smaller dark play control.
- Loading, missing-source and failure surfaces use one AnimeBox visual language.
- Bottom previous/current/next rail is lower and calmer.

## Source reliability
The existing runtime already retries failed providers and preserves resume
position while switching. This patch also handles the pre-start edge case:
if Auto mode selects a provider/translation with no playable URL but another
provider has one, AnimeBox automatically switches to the fallback before the
viewer gets stuck on "source not found".

The missing-source state also offers an explicit "Проверить другой источник"
action when alternatives exist.
