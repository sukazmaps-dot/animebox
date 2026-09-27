import fs from 'node:fs';

const core = fs.readFileSync('lib/playback-core.ts', 'utf8');
const direct = fs.readFileSync('components/DirectVideoPlayer.tsx', 'utf8');
const kodik = fs.readFileSync('components/KodikPlayer.tsx', 'utf8');
const player = fs.readFileSync('components/AnimePlayer.tsx', 'utf8');
const eventNames = fs.readFileSync('lib/product-event-names.ts', 'utf8');

for (const phase of [
  "'idle'",
  "'loading'",
  "'ready'",
  "'playing'",
  "'paused'",
  "'buffering'",
  "'recovering'",
  "'ended'",
  "'error'",
]) {
  if (!core.includes(phase)) {
    throw new Error(`Patch 19.2 playback phase missing: ${phase}`);
  }
}

for (const invariant of [
  'HLS_NETWORK_RECOVERY_LIMIT = 3',
  'HLS_MEDIA_RECOVERY_LIMIT = 2',
  'PLAYBACK_RECOVERY_WINDOW_MS = 20_000',
  'reducePlaybackEngineState',
  'clampPlaybackPosition',
  'clampPlaybackVolume',
  'clampPlaybackRate',
]) {
  if (!core.includes(invariant)) {
    throw new Error(`Patch 19.2 playback core invariant missing: ${invariant}`);
  }
}

if (!direct.includes("await import('hls.js')")) {
  throw new Error('Patch 19.2 must keep hls.js dynamically imported.');
}

if (!direct.includes('canAttemptRecovery') ||
    !direct.includes('HLS_NETWORK_RECOVERY_LIMIT') ||
    !direct.includes('HLS_MEDIA_RECOVERY_LIMIT')) {
  throw new Error('Patch 19.2 bounded HLS recovery missing.');
}

if (!direct.includes('PLAYBACK_RECOVERY_WINDOW_MS')) {
  throw new Error('Patch 19.2 rolling HLS recovery window missing.');
}

if (!direct.includes('onEngineStateChange') ||
    !kodik.includes('onEngineStateChange')) {
  throw new Error('Patch 19.2 both engines must expose unified state.');
}

if (!player.includes('const playbackController = useMemo')) {
  throw new Error('Patch 19.2 AnimeBox playback controller missing.');
}

for (const method of [
  'getSnapshot:',
  'getTime:',
  'getDuration:',
  'play:',
  'pause:',
  'seek:',
  'setVolume:',
  'setMuted:',
  'setSpeed:',
  'enterPip:',
  'exitPip:',
]) {
  if (!player.includes(method)) {
    throw new Error(`Patch 19.2 controller method missing: ${method}`);
  }
}

if (!player.includes('playbackController.seek(targetSeconds)')) {
  throw new Error('Patch 19.2 opening skip does not use playback controller.');
}

if (!player.includes('playbackController.getSnapshot()') ||
    !player.includes('playbackController.play()') ||
    !player.includes('playbackController.pause()')) {
  throw new Error('Patch 19.2 Watch Together/start flow does not use controller.');
}

for (const prop of [
  'initialVolume={playbackVolume}',
  'initialMuted={playbackMuted}',
  'initialPlaybackRate={playbackSpeed}',
]) {
  if (!player.includes(prop)) {
    throw new Error(`Patch 19.2 runtime preference transfer missing: ${prop}`);
  }
}

if (!player.includes('data-playback-phase=') ||
    !player.includes('data-playback-engine=')) {
  throw new Error('Patch 19.2 player viewport engine state markers missing.');
}

for (const eventName of [
  "'player_engine_selected'",
  "'player_engine_ready'",
  "'player_engine_fallback'",
  "'player_buffering_start'",
  "'player_buffering_end'",
  "'player_recovery_attempt'",
  "'player_recovery_failed'",
  "'player_startup_ms'",
]) {
  if (!eventNames.includes(eventName)) {
    throw new Error(`Patch 19.2 telemetry event missing: ${eventName}`);
  }
}

if (!kodik.includes('allowFullScreen') ||
    !kodik.includes('autoplay; fullscreen;')) {
  throw new Error('Patch 19.2 Kodik fullscreen fallback regressed.');
}

if (!player.includes('serverWatchSample(sample)') ||
    !player.includes('useWatchSession')) {
  throw new Error('Patch 19.2 trusted watch heartbeat path regressed.');
}

if (!player.includes('EpisodeJourneyTracker')) {
  throw new Error('Patch 19.2 Journey compatibility regressed.');
}

console.log('Patch 19.2 Player 2.0 Playback Core invariants OK');
