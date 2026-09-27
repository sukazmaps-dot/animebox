import fs from 'node:fs';

const player = fs.readFileSync('components/AnimePlayer.tsx', 'utf8');

if (!player.includes('data-player-overlay-layer')) {
  throw new Error('Patch 19.1.2 shared player overlay layer missing.');
}

if (!player.includes("providerSkipKind === 'opening'")) {
  throw new Error('Patch 19.1.2 provider opening skip suppression missing.');
}

if (!player.includes('providerSkipKindRef')) {
  throw new Error('Patch 19.1.2 provider skip arbitration ref missing.');
}

if (!player.includes('openingWindowEnteredAtRef')) {
  throw new Error('Patch 19.1.2 provider skip grace window missing.');
}

if (!player.includes('Date.now() - openingWindowEnteredAtRef.current >= 4_000')) {
  throw new Error('Patch 19.1.2 provider skip grace duration regressed.');
}

if (!player.includes('onProviderSkip={handleProviderSkip}')) {
  throw new Error('Patch 19.1.2 Kodik provider skip handler not wired.');
}

if (!player.includes("bottom: 'max(72px, calc(env(safe-area-inset-bottom) + 62px))'")) {
  throw new Error('Patch 19.1.2 next-episode safe bottom inset missing.');
}

if (!player.includes("absolute left-1/2") || !player.includes('-translate-x-1/2')) {
  throw new Error('Patch 19.1.2 next-episode bottom-center layout missing.');
}

if (player.includes('absolute bottom-4 right-4 z-[62]')) {
  throw new Error('Patch 19.1.2 old opening overlay collision layout returned.');
}

if (player.includes('absolute bottom-4 right-4 z-[63]')) {
  throw new Error('Patch 19.1.2 old next-episode collision layout returned.');
}

if (!player.includes('openingSkipTargetRef.current = null;')) {
  throw new Error('Patch 19.1.2 failed-seek fallback reset missing.');
}

console.log('Patch 19.1.2 Player overlay arbitration invariants OK');
