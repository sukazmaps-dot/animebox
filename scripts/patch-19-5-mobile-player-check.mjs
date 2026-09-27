import fs from 'node:fs';

const direct = fs.readFileSync('components/DirectVideoPlayer.tsx', 'utf8');
const player = fs.readFileSync('components/AnimePlayer.tsx', 'utf8');
const events = fs.readFileSync('lib/product-event-names.ts', 'utf8');
const globals = fs.readFileSync('app/globals.css', 'utf8');

for (const needle of [
  'MOBILE_CONTROL_HIDE_DELAY_MS = 3000',
  'TOUCH_SINGLE_TAP_DELAY_MS = 280',
  'TOUCH_DOUBLE_TAP_WINDOW_MS = 320',
  "data-mobile-player={mobileUi ? 'true' : 'false'}",
  'data-player-timeline-touch-target',
  'data-player-timeline-preview',
  "event.currentTarget.setPointerCapture?.(event.pointerId)",
  "event.pointerType === 'touch' ? 'touch' : 'timeline'",
  "setControlsVisibility(false, 'single_tap')",
  "revealControls('single_tap')",
  "'mobile_double_tap_seek'",
  "'mobile_settings_open'",
  "'mobile_recovery_visible'",
]) {
  if (!direct.includes(needle)) {
    throw new Error('Patch 19.5 mobile interaction invariant missing: ' + needle);
  }
}

for (const needle of [
  'h-11 w-11',
  'min-h-11',
  'grid-cols-5',
  "env(safe-area-inset-bottom)",
  "env(safe-area-inset-left)",
  "env(safe-area-inset-right)",
  "max-h-[min(62dvh,420px)]",
]) {
  if (!direct.includes(needle)) {
    throw new Error('Patch 19.5 mobile geometry invariant missing: ' + needle);
  }
}

for (const needle of [
  "type LockableScreenOrientation",
  "lockMobilePlayerLandscape",
  "unlockMobilePlayerOrientation",
  "orientation.lock('landscape')",
  "data-mobile-fullscreen={fullscreenActive ? 'true' : 'false'}",
  "h-[100dvh]",
]) {
  if (!player.includes(needle)) {
    throw new Error('Patch 19.5 fullscreen invariant missing: ' + needle);
  }
}

if (player.includes("'relative h-screen w-screen overflow-hidden rounded-none border-0 bg-black'")) {
  throw new Error('Patch 19.5 fullscreen regressed to 100vh/h-screen.');
}

for (const eventName of [
  "'player_mobile_controls_shown'",
  "'player_mobile_controls_hidden'",
  "'player_mobile_double_tap_seek'",
  "'player_mobile_fullscreen_enter'",
  "'player_mobile_fullscreen_exit'",
  "'player_mobile_orientation_change'",
  "'player_mobile_settings_open'",
  "'player_mobile_recovery_visible'",
]) {
  if (!events.includes(eventName)) {
    throw new Error('Patch 19.5 telemetry event missing: ' + eventName);
  }
}

for (const needle of [
  "@media (pointer: coarse)",
  "orientation: landscape",
  "max-height: 520px",
  "min-height: 44px",
  "100dvh",
  "prefers-reduced-motion: reduce",
]) {
  if (!globals.includes(needle)) {
    throw new Error('Patch 19.5 mobile CSS invariant missing: ' + needle);
  }
}

if (player.includes('key={expectedSourceIdentity}') ||
    player.includes('key={`${expectedSourceIdentity}:theater`}')) {
  throw new Error('Patch 19.5 must preserve the 19.4 persistent player shell.');
}

console.log('Patch 19.5 Mobile Player 2.0 invariants OK');
