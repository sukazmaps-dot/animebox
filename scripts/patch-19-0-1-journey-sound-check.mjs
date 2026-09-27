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
