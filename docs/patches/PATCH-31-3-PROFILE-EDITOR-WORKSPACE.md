# Patch 31.3 — AnimeBox Profile Editor Workspace

Base: Patch 31.2 in main. Independent branch, draft PR, no production or SQL changes.

## Scope / decisions
- Full-screen self-contained editor overlay and no global Navbar, desktop sidebar or bottom mobile navigation on /profile/edit.
- Persistent 220–240 px editable draft preview beneath compact header; five editor tabs. Showcase and Rewards live under “Ещё”.
- Original base media upload pipeline and crop modal unchanged; image banner tab gets a dropzone which opens Premium upsell for non-subscribers.
- Save/cancel dock always visible; measured height reserved after scroll content, accommodates safe area and visualViewport keyboard; on exit confirms unsaved changes and Telegram BackButton supported.
- Banner chooser: 6-column circular swatches, single scrollable equal-height fill rail, in-app bottom sheet with HSV square, Hue, validated HEX, supported EyeDropper and recent colors. Underlying draft previews changes instantly.
- Existing free solid and soft fills remain saveable. Locked glow/sunset fills can be previewed but saving takes non-Premium accounts to the Premium subscription page; API validation remains authoritative.
- Premium scene demo: horizontally scrollable 120x72 thumbnails, existing four preview contexts, single shared bottom save/upgrade CTA. Premium tab stays mounted when changing tabs to preserve unsaved selections.
- UI fixes are in original CSS and CSS modules, no new global !important patch files.

## Tests
- npm run patch31-3:check (prebuild).
- GitHub Quality Gate TS / eslint / Next build and real CSS Playwright dock fixture 320, 360, 390, 412, 560, 768 (dark/light, font 14/22, nav variants).
- Manual real-device checklist: Android Chrome and Telegram WebView 360–430, iOS Safari/Telegram, desktop, keyboard open, saved/dirty/error, color cancel and undo, Premium expiry, static/media crop, tab switching and browser back.

## Deliberately not shipped
- User-defined second gradient color/angle and independent glow intensity require a reviewed additive DB schema and server validation. The existing profiles banner_style enum + banner_color HEX cannot persist these parameters. These controls must not misleadingly appear saveable without that migration.
- Frame assignment still uses the existing rewards API and does not use the shared draft transaction.
- Real logged-in production visual check needs a device after PR review. Do NOT merge/deploy without approval.
