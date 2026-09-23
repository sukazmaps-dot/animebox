# Patch 14.2 — Mobile Shell & Navigation

## Goal

Make the phone shell feel stable, deliberate and recognisably AnimeBox.

This patch focuses on navigation/chrome behavior. It does not redesign Home content, Catalog, Anime pages or the player itself.

## Bottom navigation

The old floating rounded capsule is replaced by a docked rail.

Active state is communicated through:

- brighter icon/text;
- a narrow Iris marker;
- profile-avatar ring when Profile is active.

The nav no longer creates a purple pill behind every active destination.

## Scroll behavior

The hide/reveal controller now uses stronger hysteresis:

- tiny browser/inertial deltas are ignored;
- a direction must remain stable before a toggle;
- downward hide requires more travel than before;
- upward reveal also requires sustained intent;
- a longer toggle cooldown prevents rapid down/up flicker;
- typing and modal/account states keep navigation visible.

This targets the unpleasant oscillation reported when a user scrolls down and then slightly reverses direction.

## Safe areas

One shell model now combines:

- browser safe areas;
- iOS safe areas;
- Telegram Mini App safe-area variables.

The topbar, bottom nav, app shell and account sheet use the same variables.

Legacy stacked bottom spacing is collapsed so the document does not accumulate nav padding on body + page + footer simultaneously.

## Profile/account menu

The account sheet remains portalled directly to document.body.

The final shell layer gives it a dedicated stacking level above both page content and bottom navigation.

It is opaque rather than glassy, scroll-contained, safe-area aware, and uses row separators instead of a stack of rounded mini-cards.

## Telegram promo image regression

The Telegram community banner previously exposed a browser broken-image glyph when its Next image request failed.

The component now:

1. loads the local WebP directly without the image optimizer;
2. retries with the existing local Telegram background WebP;
3. if both assets fail, renders a designed Telegram-icon fallback instead of a broken image.

No remote image dependency is introduced.

## Next

14.3 will redesign Home/Discovery composition on top of this stable shell.
