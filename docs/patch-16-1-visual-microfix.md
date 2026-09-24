# Patch 16.1 — Visual Microfix Pack

## Goal

Finish the remaining small visual regressions without adding another broad CSS layer.

## Scope

- Keep the existing disabled-ad ghost fix from `0e7b99a`: when ads are paused, `AdSlot` renders no placeholder DOM, eliminating the stray 1px line/pixel on tightly spaced title pages.
- Keep the recent Telegram notification, discussion-card, and home collection-card microfixes already present on `main`.
- Replace the reused list/menu glyph on Settings navigation with a dedicated Phosphor gear icon.
- Use the same Settings glyph in both the desktop sidebar and the mobile account sheet.
- Preserve existing active-state weight behavior on desktop.

## Acceptance criteria

- “Настройки” is represented by a gear rather than a list/menu glyph.
- Desktop and mobile navigation use the same icon source.
- No new global CSS override is introduced for this fix.
- Existing `menu` icon semantics remain available for actual menus.
- TypeScript should reject any missing icon mapping through `Record<IconName, PhosphorIcon>`.
