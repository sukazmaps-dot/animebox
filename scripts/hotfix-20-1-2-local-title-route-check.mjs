import fs from 'node:fs';

const route = fs.readFileSync('lib/anime-route.ts', 'utf8');
const localization = fs.readFileSync('lib/anime-localization-server.ts', 'utf8');

const failures = [];

if (
  !route.includes('getLocalAnimeDetailFallback') ||
  !route.includes('try {') ||
  !route.includes('if (!baseAnime) {') ||
  !route.includes('baseAnime = await getLocalAnimeDetailFallback(id)') ||
  !route.includes('if (!baseAnime) return null')
) {
  failures.push('anime detail route does not fall back to the local catalogue');
}

if (
  !localization.includes('export async function getLocalAnimeDetailFallback') ||
  !localization.includes("from('anime_catalog')") ||
  !localization.includes("from('anime_search_documents')") ||
  !localization.includes('catalogEligible: true') ||
  !localization.includes('poster_url') ||
  !localization.includes('total_episodes')
) {
  failures.push('local anime detail fallback is incomplete');
}

if (failures.length) {
  console.error('[AnimeBox Hotfix 20.1.2] Check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  'PASS: Hotfix 20.1.2 keeps local catalogue titles routable without AniList',
);
