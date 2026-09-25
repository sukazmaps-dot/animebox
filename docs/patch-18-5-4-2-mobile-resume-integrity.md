# Patch 18.5.4.2 — Mobile + Resume Integrity

## Goal

Finish the user-side playback state machine after Source Orchestrator v2.

18.5.4.1 decides which providers may be used. 18.5.4.2 guarantees that changing source, changing translation, switching episode, backgrounding a mobile browser/Mini App, resuming on another device, or replaying a completed episode cannot corrupt playback position or leave the mobile player in a broken control state.

The server remains the authority for authenticated completion/watch credit. Local storage is only a crash journal.

---

## 1. Canonical resume rules

Resume state has three inputs:

- authenticated server progress;
- viewer-scoped local crash journal;
- current live player position during a source switch.

Rules:

- completed server state is terminal for resume: start from 0;
- a near-end position is not resumable;
- an old/unusable server marker must not erase a valid recent crash journal;
- between two valid authenticated candidates, server wins unless the local journal is plausibly newer than the server state;
- an implausibly future-skewed local timestamp must never defeat server state;
- a local timestamp that appears many minutes ahead of the last server write is treated as clock skew rather than proof that local is newer;
- guest crash progress may be migrated into the authenticated viewer scope only when it actually wins the merge;
- selecting a resume position grants zero watch credit by itself.

## 2. Canonical server resume position

The server must normalize the saved resume marker on every heartbeat/end:

- completed episode => resume position 0;
- position inside the near-end guard => resume position 0;
- ordinary playback => bounded current position.

This prevents completed or almost-completed episodes from reappearing as resumable due to a later pagehide/end request.

Completion remains sticky once reached.

## 3. Session generation ownership

Every mounted playback identity gets a generation:

`user + anime + episode + source`.

Async start/heartbeat responses from an old generation must not mutate the new episode/source UI.

Requirements:

- old source heartbeat cannot update progress after fallback;
- old episode heartbeat cannot update the next episode;
- stale 401/409/410 responses cannot put the new player into recovery/superseded state;
- cleanup only clears start/send locks owned by its own generation;
- server-side supersession remains the final multi-device guard.

## 4. Source-switch position continuity

Automatic fallback, manual provider switch, translation switch and retry must preserve the latest real playback position.

Native video resume must be re-armed after a source/translation remount even if the numeric resume target did not change.

Kodik continues to receive `resumeSeconds` and remounts by source/attempt key.

A provider startup sample before the resume seek lands must not overwrite local/server progress.

## 5. Mobile episode and translation controls

The visual AnimeBox dropdown remains on desktop.

On touch/mobile widths, episode and translation selectors get a native `select` interaction layer:

- uses OS/WebView picker;
- works in Telegram Android/iOS WebViews;
- does not depend on hover/outside-mousedown behavior;
- preserves AnimeBox visual button;
- keeps accessible label/value semantics;
- closes the custom desktop menu after change.

This directly targets the historic mobile episode/audio selector failures.

## 6. Mobile fullscreen lifecycle

Telegram pseudo-fullscreen must survive viewport changes and app background/foreground transitions without remounting media.

While pseudo-fullscreen is active:

- recompute visual viewport height on resize/orientation/visibility;
- re-expand Telegram when returning visible;
- listen to Telegram viewport/safe-area/fullscreen changes where available;
- preserve/restore body overflow and vertical swipe ownership;
- respect safe-area top/bottom in player controls.

## 7. Foreground progress recovery

When the document returns to `visible`:

- immediately flush/sync the latest position instead of waiting for the next 20s interval;
- expired sessions may recover through the existing 404/410 restart path;
- superseded sessions remain local-only and never steal ownership back automatically.

## 8. Completion and replay invariants

- `completed_at` is monotonic/sticky;
- replaying a completed episode may accumulate ordinary watch telemetry but may not make it resumable;
- an end request from an older/superseded session cannot overwrite newer progress;
- source switch does not create completion;
- local crash journal is removed after confirmed completion.

## 9. Regression gate

Add `patch18-5-4-2:check` covering:

- near-end resume guard;
- completed resume = 0;
- plausible local-newer merge;
- future-skew local timestamp rejected;
- server-newer merge;
- source switch re-arms native resume;
- generation checks around start/heartbeat;
- foreground sync;
- mobile native selectors;
- Telegram viewport lifecycle;
- existing cross-device 409 behavior;
- existing stale-session end protection.

## Release gates

- dedicated 18.5.4.2 runtime/static matrix passes;
- existing Watch Service regression passes;
- Source Orchestrator regression passes;
- opening-skip safety remains green;
- TypeScript passes;
- targeted lint passes;
- retention tests pass;
- production build passes.
