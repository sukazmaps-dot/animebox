# Patch 16.6 — Responsive Layout Foundation

## Goal

Make AnimeBox adapt to physical viewport shape instead of treating viewport width as the only device signal.

The main regression this solves is a phone rotated to landscape: many phones become wider than 768px in CSS pixels and previously crossed into the desktop/tablet shell even though they still had a short touch viewport.

## Responsive contracts

### Phone portrait

Existing mobile shell remains authoritative.

Short portrait devices now reduce large hero/banner surfaces so navigation and content remain reachable without excessive vertical chrome.

### Compact phone landscape

Contract:

`orientation: landscape + max-height: 600px + max-width: 1100px`

This deliberately uses viewport shape, not user-agent detection.

Behavior:

- sidebar remains disabled;
- compact topbar remains available;
- bottom mobile navigation remains available even above 768px width;
- bottom navigation is icon-first and stays visible in the short viewport;
- account menu becomes a right-side scrollable sheet;
- content uses landscape safe-area insets;
- home catalogue becomes a dense horizontal media rail;
- catalogue/tracker grids use extra horizontal space;
- anime detail becomes a compact poster + content split;
- player header/toolbars become shorter and horizontally scroll controls when needed;
- profile statistics/widgets use multi-column layouts instead of portrait stacking;
- Telegram Mini App uses the same landscape geometry.

### Tablet portrait

769–1024px portrait keeps tablet density but avoids squeezing desktop side-by-side layouts:

- home main/right rail stacks;
- catalogue uses fluid columns;
- anime detail uses a reduced poster column;
- profile content avoids overly narrow desktop columns.

### Tablet landscape

1025–1366px with normal height keeps desktop information hierarchy with fluid sidebar/content widths, catalogue columns and player toolbars.

## Orientation changes

Navbar now observes the compact landscape media query and viewport resize.

When a device rotates into compact landscape:

- mobile navigation is forced visible;
- scroll-direction hysteresis state is reset;
- a nav hidden in portrait cannot remain accidentally hidden after rotation.

When the device rotates back, normal direction-aware hide/show behavior resumes.

## Safe areas

Root viewport now uses:

`viewportFit: 'cover'`

This enables `env(safe-area-inset-*)` to correctly protect content/navigation from display cutouts in landscape-capable browsers and WebViews.

## Quality gate

`mobile-shell-check.mjs` now verifies:

- responsive stylesheet is loaded after the previous profile/UI layers;
- compact-landscape contract exists;
- tablet portrait and tablet landscape contracts exist;
- Navbar owns the same compact-landscape media query;
- viewport resize resets navigation state;
- home rails, anime detail, player and profile have explicit responsive contracts.

## Scope

This is a layout-foundation patch. It does not redesign AnimeBox or copy the referenced competitor UI. The reference is used only to define the desired adaptive behavior when a phone rotates.
