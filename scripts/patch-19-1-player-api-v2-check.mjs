import fs from 'node:fs';

const kodikPath = 'components/KodikPlayer.tsx';
const playerPath = 'components/AnimePlayer.tsx';

const kodik = fs.readFileSync(kodikPath, 'utf8');
const player = fs.readFileSync(playerPath, 'utf8');

const requiredHandleMethods = [
  'setVolume:',
  'mute:',
  'unmute:',
  'setSpeed:',
  'enterPip:',
  'exitPip:',
  'getTime:',
  'changeEpisode:',
];

for (const method of requiredHandleMethods) {
  if (!kodik.includes(method)) {
    throw new Error(`Patch 19.1 missing Kodik handle method: ${method}`);
  }
}

const requiredCommands = [
  "postApiCommand('play')",
  "postApiCommand('pause')",
  "postApiCommand('seek'",
  "postApiCommand('volume'",
  "postApiCommand('mute')",
  "postApiCommand('unmute')",
  "postApiCommand('speed'",
  "postApiCommand('enter_pip')",
  "postApiCommand('exit_pip')",
  "postApiCommand('get_time')",
  "postApiCommand('change_episode'",
];

for (const command of requiredCommands) {
  if (!kodik.includes(command)) {
    throw new Error(`Patch 19.1 missing official Kodik command: ${command}`);
  }
}

if (!kodik.includes("key === 'kodik_player_time'")) {
  throw new Error('Patch 19.1 exact get_time response handling missing.');
}

if (!kodik.includes('pendingTimeRequestRef') || !kodik.includes('1_200')) {
  throw new Error('Patch 19.1 exact-time single-flight/timeout protection missing.');
}

if (!kodik.includes('without_reload: input.withoutReload !== false')) {
  throw new Error('Patch 19.1 change_episode must default to without_reload=true.');
}

if (!kodik.includes("expectedOrigin || '*'")) {
  throw new Error('Patch 19.1 expected-origin Kodik command boundary missing.');
}

if (!kodik.includes('Math.min(1, Math.max(0, volume))')) {
  throw new Error('Patch 19.1 volume clamp missing.');
}

if (!kodik.includes('Math.min(2, Math.max(0.25, speed))')) {
  throw new Error('Patch 19.1 playback speed clamp missing.');
}

if (!player.includes('getPrecisePlaybackPosition')) {
  throw new Error('Patch 19.1 AnimeBox precise-time adapter missing.');
}

if (!player.includes('applyPlaybackSpeed')) {
  throw new Error('Patch 19.1 AnimeBox speed adapter missing.');
}

if (!player.includes('togglePictureInPicture')) {
  throw new Error('Patch 19.1 AnimeBox PiP adapter missing.');
}

if (!player.includes('label="Скорость"')) {
  throw new Error('Patch 19.1 AnimeBox speed control missing.');
}

if (!player.includes('title="Картинка в картинке"')) {
  throw new Error('Patch 19.1 AnimeBox PiP control missing.');
}

if (!player.includes('playerViewportRef.current') || !player.includes('requestFullscreen')) {
  throw new Error('Patch 19.1 AnimeBox wrapper fullscreen regressed.');
}

if (!kodik.includes('allowFullScreen') || !kodik.includes('autoplay; fullscreen;')) {
  throw new Error('Patch 19.1 native Kodik fullscreen fallback regressed.');
}

if (!player.includes('EpisodeJourneyTracker')) {
  throw new Error('Patch 19.1 Journey player overlay regressed.');
}

console.log('Patch 19.1 AnimeBox Player API v2 invariants OK');
