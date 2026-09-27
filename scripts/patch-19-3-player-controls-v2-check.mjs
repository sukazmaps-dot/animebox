import fs from 'node:fs';

const direct = fs.readFileSync('components/DirectVideoPlayer.tsx', 'utf8');
const player = fs.readFileSync('components/AnimePlayer.tsx', 'utf8');
const eventNames = fs.readFileSync('lib/product-event-names.ts', 'utf8');

for (const needle of [
  'data-animebox-player-controls-root',
  'data-player-control-layer',
  'data-player-timeline',
  'data-player-status-layer',
  'CONTROL_HIDE_DELAY_MS = 2600',
  'hoverTime',
  'hoverPercent',
  'timelineInteractingRef',
  'commitTimelineSeek',
  'bufferedProgress',
  'timelineMarkers.map',
]) {
  if (!direct.includes(needle)) {
    throw new Error(`Patch 19.3 controls invariant missing: ${needle}`);
  }
}

for (const key of [
  "case ' ':",
  "case 'k':",
  "case 'j':",
  "case 'l':",
  "case 'm':",
  "case 'f':",
  "case 'p':",
  "case '>':",
  "case '<':",
  "case 'arrowleft':",
  "case 'arrowright':",
  "case 'arrowup':",
  "case 'arrowdown':",
]) {
  if (!direct.includes(key)) {
    throw new Error(`Patch 19.3 keyboard shortcut missing: ${key}`);
  }
}

if (!direct.includes("target.closest('input, textarea, select, [contenteditable=\"true\"]')")) {
  throw new Error('Patch 19.3 editable-target keyboard guard missing.');
}

for (const needle of [
  "TOUCH_DOUBLE_TAP_WINDOW_MS = 320",
  "now - previous.at <= TOUCH_DOUBLE_TAP_WINDOW_MS",
  "zone !== 'center'",
  "const delta = zone === 'left' ? -10 : 10",
  "commitTimelineSeek(target, 'touch')",
]) {
  if (!direct.includes(needle)) {
    throw new Error(`Patch 19.3 mobile double-tap invariant missing: ${needle}`);
  }
}

if (!direct.includes("enginePhase === 'recovering'") ||
    !direct.includes('Восстанавливаем поток…')) {
  throw new Error('Patch 19.3 recovery UI missing.');
}

if (!direct.includes('motion-reduce:transition-none') ||
    !direct.includes('motion-reduce:animate-none')) {
  throw new Error('Patch 19.3 reduced-motion handling missing.');
}

if (!player.includes('directTimelineMarkers') ||
    !player.includes('timelineMarkers={directTimelineMarkers}')) {
  throw new Error('Patch 19.3 episode timeline markers are not connected.');
}

if (!player.includes('handleDirectControlAction') ||
    !player.includes('onControlAction={handleDirectControlAction}')) {
  throw new Error('Patch 19.3 control telemetry adapter missing.');
}

for (const eventName of [
  "'player_control_play'",
  "'player_control_pause'",
  "'player_control_seek'",
  "'player_control_volume'",
  "'player_control_mute'",
  "'player_control_speed'",
  "'player_control_pip'",
  "'player_control_fullscreen'",
  "'player_control_quality'",
]) {
  if (!eventNames.includes(eventName)) {
    throw new Error(`Patch 19.3 telemetry event missing: ${eventName}`);
  }
}

if (player.includes('{isKodik || trackableNativeVideo ? (\n            <PlayerDropdown')) {
  throw new Error('Patch 19.3 external speed control still duplicates Direct/HLS HUD.');
}

if (!player.includes('{isKodik ? (\n            <PlayerDropdown')) {
  throw new Error('Patch 19.3 Kodik fallback speed control was lost.');
}

if (!player.includes('{(isKodik || isIframe) && (')) {
  throw new Error('Patch 19.3 provider fallback fullscreen toolbar contract missing.');
}

if (!direct.includes("onControlAction?.('seek'") ||
    !direct.includes("onControlAction?.('volume'") ||
    !direct.includes("onControlAction?.('speed'")) {
  throw new Error('Patch 19.3 controls are not reporting their actions.');
}

console.log('Patch 19.3 AnimeBox Player Controls v2 invariants OK');
