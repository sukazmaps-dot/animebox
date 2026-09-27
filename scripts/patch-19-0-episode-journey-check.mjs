import fs from 'node:fs';

const required = [
  'app/api/community/episode-events/route.ts',
  'app/api/community/episode-events/journey/route.ts',
  'app/achievements/journey/page.tsx',
  'components/EpisodeJourneyTracker.tsx',
  'components/EpisodeJourneyClient.tsx',
  'supabase/migrations/20260927173000_episode_journey_v1.sql',
];

for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Patch 19.0 missing: ${file}`);
}

const player = fs.readFileSync('components/AnimePlayer.tsx', 'utf8');
const episodePage = fs.readFileSync('components/AnimeEpisodePage.tsx', 'utf8');
const api = fs.readFileSync('app/api/community/episode-events/route.ts', 'utf8');

if (!player.includes('animebox:player-time-sample')) {
  throw new Error('Patch 19.0: player time sample bridge missing.');
}
if (!episodePage.includes('EpisodeJourneyTracker')) {
  throw new Error('Patch 19.0: episode Journey tracker is not mounted.');
}
if (!api.includes('watched_ranges') || !api.includes('MIN_TRUSTED_OVERLAP_MS')) {
  throw new Error('Patch 19.0: anti-seek server verification missing.');
}

console.log('Patch 19.0 Episode Journey invariants OK');
