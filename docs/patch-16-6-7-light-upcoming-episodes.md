# Patch 16.6.7 — Light theme, upcoming episodes and episode labels

Base: 1667366a2f7693d72c76579c10eede3dba9beeb0 (main).

## Changes

- Desktop upcoming releases: fixed 48×72 posters, two-line titles with full native tooltips, wrapping release metadata, countdown below title without seconds.
- Countdown first render is deterministic to avoid server/client time mismatches.
- Light home surfaces: neutral cool background, readable titles/metadata, violet controls, corrected membership and account menu colors. Hero and poster overlays retain their media palette.
- Remove the dark recommendation rail curtain in light mode.
- Episode rows use one label (Серия N), optional state on a separate line, and explicit spacing at all widths.
- Image fallback advancement is idempotent when cached-image checks and error callbacks report the same failed candidate. Existing CDN/proxy fallback order is preserved.

## Already in base, retained

Unified profile/appearance editor, showcase link and embedded editor, mobile mini-profile auto height, Telegram gate direct brand asset with inline fallback.

## Validation

All project prebuild checks and production build (including TypeScript) passed.
No new dependencies, schema changes, SQL or environment variables required.
Browser visual verification could not run: browser daemon failed and Chromium download was unavailable. Telegram membership and authenticated profile persistence were not exercised with a real account in this environment.
Image network outages remain possible; this patch addresses duplicate failure handling, not third-party CDN availability.

## Overlay installation

Start from an up-to-date main, back up uncommitted work, then copy the archive files over the repository. Existing base fixes are not duplicated in this incremental archive.

If this patch is already on main, only pull it; do not apply or commit it again.
