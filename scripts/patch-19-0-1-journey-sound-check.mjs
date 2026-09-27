import fs from 'node:fs';

const assets = [
  'public/audio/achievements/common-sparkle.mp3',
  'public/audio/achievements/rare-wand.mp3',
  'public/audio/achievements/epic-whoosh.mp3',
  'public/audio/achievements/legendary-spell.mp3',
  'public/audio/achievements/reveal-chime.mp3',
];

for (const asset of assets) {
  if (!fs.existsSync(asset)) {
    throw new Error(`Patch 19.0.1 missing audio asset: ${asset}`);
  }

  if (fs.statSync(asset).size <= 100) {
    throw new Error(`Patch 19.0.1 invalid audio asset: ${asset}`);
  }
}

const manager = fs.readFileSync('lib/achievement-sound.ts', 'utf8');
const tracker = fs.readFileSync('components/EpisodeJourneyTracker.tsx', 'utf8');
const player = fs.readFileSync('components/AnimePlayer.tsx', 'utf8');
const episodePage = fs.readFileSync('components/AnimeEpisodePage.tsx', 'utf8');
const kodikPlayer = fs.readFileSync('components/KodikPlayer.tsx', 'utf8');

for (const asset of assets) {
  const publicPath = asset.replace(/^public/, '');
  if (!manager.includes(publicPath)) {
    throw new Error(`Patch 19.0.1 manager does not map ${publicPath}`);
  }
}

if (!manager.includes('ACHIEVEMENT_SOUND_STORAGE_KEY')) {
  throw new Error('Patch 19.0.1 mute preference missing.');
}

if (!manager.includes('ACHIEVEMENT_SOUND_COOLDOWN_MS')) {
  throw new Error('Patch 19.0.1 anti-spam cooldown missing.');
}

if (!manager.includes('unlockAchievementSoundsFromGesture')) {
  throw new Error('Patch 19.0.1 explicit parent-page audio unlock missing.');
}

if (!manager.includes('pendingSound')) {
  throw new Error('Patch 19.0.1 blocked-autoplay queue missing.');
}

if (!manager.includes("kind === 'arc_complete'") || !manager.includes("kind === 'finale'")) {
  throw new Error('Patch 19.0.1 special-event legendary mapping missing.');
}

if (!manager.includes('0.32')) {
  throw new Error('Patch 19.0.1 volume cap changed unexpectedly.');
}

if (!tracker.includes('playAchievementUnlockSound')) {
  throw new Error('Patch 19.0.1 Journey tracker sound hook missing.');
}

if (!tracker.includes('unlockAchievementSoundsFromGesture')) {
  throw new Error('Patch 19.0.1 Journey sound unlock control missing.');
}

if (!tracker.includes('if (!response.ok || !payload.unlocked || !payload.event) return;')) {
  throw new Error('Patch 19.0.1 sound must stay behind server-confirmed unlock.');
}

if (tracker.includes('new Audio(')) {
  throw new Error('Patch 19.0.1 audio lifecycle leaked into Journey tracker.');
}

console.log('Patch 19.0.1 Journey sound feedback invariants OK');


if (tracker.includes('Путь серии')) {
  throw new Error('Patch 19.0.2 obsolete Journey progress HUD is still rendered.');
}

if (!player.includes('<EpisodeJourneyTracker animeId={animeId} episode={episodeNumber} />')) {
  throw new Error('Patch 19.0.2 Journey overlay is not mounted inside player viewport.');
}

if (episodePage.includes('<EpisodeJourneyTracker')) {
  throw new Error('Patch 19.0.2 Journey overlay is still mounted outside the player.');
}

if (!kodikPlayer.includes('allowFullScreen') || !kodikPlayer.includes('autoplay; fullscreen;')) {
  throw new Error('Patch 19.0.3 native Kodik fullscreen fallback is missing.');
}

if (!player.includes("{fullscreenActive ? 'Выйти из полного экрана' : 'Полный экран'}")) {
  throw new Error('Patch 19.0.3 AnimeBox toolbar fullscreen control missing.');
}

if (player.includes('absolute bottom-3 right-3 z-[85]')) {
  throw new Error('Patch 19.0.4 obsolete fullscreen overlay still covers provider controls.');
}

if (!player.includes('providerFullscreen') || !player.includes('viewport.contains(activeElement)')) {
  throw new Error('Patch 19.0.3 fullscreen ownership detection missing.');
}

if (!player.includes('suspended={providerFullscreen}')) {
  throw new Error('Patch 19.0.3 Journey is not suspended during provider fullscreen.');
}

if (!tracker.includes('pendingToasts') || !tracker.includes('enqueueByPriority')) {
  throw new Error('Patch 19.0.3 Journey fullscreen queue missing.');
}

if (!tracker.includes('if (!toast || suspended) return null;')) {
  throw new Error('Patch 19.0.3 provider fullscreen popup suppression missing.');
}
