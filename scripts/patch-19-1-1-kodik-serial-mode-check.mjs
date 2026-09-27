import fs from 'node:fs';

const kodik = fs.readFileSync('components/KodikPlayer.tsx', 'utf8');
const player = fs.readFileSync('components/AnimePlayer.tsx', 'utf8');

if (kodik.includes("searchParams.set('only_episode'")) {
  throw new Error('Patch 19.1.1 only_episode must not be forced in serial-player mode.');
}

for (const required of [
  "searchParams.set('hide_selectors', 'true')",
  "searchParams.set('translations', 'false')",
  "searchParams.set('hide_resume_button', 'true')",
]) {
  if (!kodik.includes(required)) {
    throw new Error(`Patch 19.1.1 missing iframe parameter: ${required}`);
  }
}

for (const removed of [
  "searchParams.delete('only_episode')",
  "searchParams.delete('start_from')",
  "searchParams.delete('skip_button')",
]) {
  if (!kodik.includes(removed)) {
    throw new Error(`Patch 19.1.1 defensive parameter cleanup missing: ${removed}`);
  }
}

if (!kodik.includes("method: 'change_episode'") || !kodik.includes('without_reload: true')) {
  throw new Error('Patch 19.1.1 defensive change_episode sync regressed.');
}

if (!kodik.includes('lastForcedEpisodeRef.current === episodeNumber')) {
  throw new Error('Patch 19.1.1 duplicate episode-force protection missing.');
}

if (!kodik.includes('allowFullScreen') || !kodik.includes('autoplay; fullscreen;')) {
  throw new Error('Patch 19.1.1 native fullscreen fallback regressed.');
}

if (player.includes(':${episodeNumber}:${playerAttempt}')) {
  throw new Error('Patch 19.1.1 Kodik still remounts locally on episode prop changes.');
}

if (!player.includes(':${playerAttempt}')) {
  throw new Error('Patch 19.1.1 stable Kodik instance key missing.');
}

console.log('Patch 19.1.1 Kodik serial mode invariants OK');
