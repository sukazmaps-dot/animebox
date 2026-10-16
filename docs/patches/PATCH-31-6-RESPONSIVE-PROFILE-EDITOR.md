# Patch 31.6 — Responsive Profile Editor and Premium workflow

## Confirmed causes

The 31.3 shell still inherited the 18.8 desktop two-column grid and explicit row placement, while the new live preview had no assigned grid area. It was auto-placed below the form. The old menu retained a viewport-sized minimum height and its new flex buttons grew into that height. The shell was capped at 960px; embedded Premium split its already narrow settings area into two columns again. An old style-tab-only `overflow:clip` disabled the main editor scroll, while its inner preview used `overflow:auto` and `overscroll-behavior:contain`. The fixed editor also retained the original document min-height, which could override visualViewport height during keyboard display.

## Layout specification and result

- One component tree. Explicit header/navigation/settings/preview grid areas in the existing owning stylesheet, no extra global patch stylesheet.
- Below 900px: 176px profile card in a 192px sticky preview area; four main sections plus More in fixed five-cell bottom navigation. Frame, Showcase and Rewards are accessible in More. No horizontal section list. Save dock sits above navigation and safe area; content reserves measured dock height plus navigation. Short landscape uses the existing smaller preview; keyboard display temporarily removes the preview so the focused field remains usable.
- 900–1179px: horizontal navigation above form and 300–360px sticky right preview.
- From 1180px: compact 180px menu, flexible form, 320–380px sticky right preview. Shell uses available width up to 1600px instead of 960px. Buttons remain 44–56px, not stretched to viewport height.
- Premium replaces the base preview with its own context-aware preview and uses the full content area. Only the editor owns vertical scrolling; the desktop preview has no independent wheel trap. On mobile/tablet, the existing preview action opens a native top-layer dialog with Profile/Mini/Comment/Room contexts, focus containment and Escape support.
- Premium section navigation precedes the palette. The palette is only shown in Appearance, so Atmosphere/Effects/Media open directly on their own controls instead of forcing a scroll past unrelated colors.
- Switching editor sections returns the editor scroll to the top without remounting Premium or discarding its draft.

## Editing actions

- Container-query color fields: label above, native color input, flexible HEX field accepting 3/6 digits with or without #, desktop EyeDropper and six 44px preset swatches. Invalid HEX does not update the draft. Text color shows a contrast badge; existing readable-text protection remains authoritative.
- Adaptive palette action precedes manual colors, uses existing avatar/banner including base fallback, offers four choices rather than immediately replacing colors, and can reshuffle choices. Existing theme presets, random scene and shareable appearance link are available. Shared links contain only validated appearance settings, excluding image paths, positions, zoom, username and bio; opening never saves to server.
- One save status in the header; section dirty markers and a five-section completion count. Bottom dock contains actions and errors rather than a second dirty/saved announcement.
- Undo/redo for staged base fields, confirmed crop files, frame draft and Premium settings. Bounded 40-entry history; editing after undo drops the redo branch. Ctrl/Cmd+Z and Shift+Z/Y work outside text fields; text fields keep native undo. Ctrl/Cmd+S uses the existing guarded save path. Reset can be undone, with a visible restore action for eight seconds. Holding Compare shows saved base/Premium appearance.
- Versioned IndexedDB browser draft includes structured-cloneable staged base File objects and appearance fields, keyed by account with seven-day expiry. Recovery is offered instead of silently applying or overwriting a server-loaded profile. A pending recovery cannot be deleted by the initial clean render. Save/reset remove the stored draft; storage failures are surfaced without blocking normal save. No new network calls on typing.
- Existing crop editor gains two-pointer pinch, bounded wheel zoom, keyboard +/- and switchable banner/avatar overlap guides. Existing visible Replace/Remove actions and crop rendering/export algorithm are retained.

## Boundaries

No DB migration, RLS, Supabase bucket, media Worker or environment change. Existing server validation, entitlement rules and shared base/frame/Premium save guards remain in use. Existing Premium media uploads that commit immediately continue to establish a new saved baseline; history must not resurrect deleted private media. An unconfirmed source still open in the crop modal is not a staged File draft. Guides are visual composition aids; actual Premium contexts remain available in the preview. Showcase and rewards keep their existing independent save semantics.

## Verification

- TypeScript and targeted ESLint; full existing prebuild regression suite plus editor-workspace checks.
- 60 Chromium CSS/DOM layout cases with real profile preview/color-field markup and all route styles: dark/light, 320/360/390/412/466/768/899/900/1040/1180/1440/1920/2560/3840px and 844×390 landscape. Assert right-column geometry, compact 44px menu targets, contained HEX controls, sticky preview, one scroll owner and last control above dock.
- Simulated visualViewport shrink checks root height and keyboard-specific preview collapse. Real browser IndexedDB verifies File bytes/name, account isolation, expiry and deletion.
- Interaction tests exercise real color-field handlers, crop pinch/wheel handlers, draft hook recovery, undo/redo branching and shared-theme filtering. Existing 48-case dock matrix remains passing.
- Browser fixture is controlled, not a signed-in Opera GX or physical Telegram device session. Final PR CI/build results recorded in PR.
