import fs from 'node:fs';

const failures = [];
const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const catalog = read('components/SearchCatalogClient.tsx');
const suggestions = read('components/SearchSuggestions.tsx');
const suggestionApi = read('app/api/search/suggestions/route.ts');
const instantApi = read('app/api/search/instant/route.ts');
const instantClient = read('lib/instant-search-client.ts');
const searchIndex = read('lib/search-index-server.ts');
const animeApi = read('app/api/anime/route.ts');

const must = (source, needle, label) => {
  if (!source.includes(needle)) failures.push(`${label}: missing ${needle}`);
};

must(catalog, 'const SEARCH_DEBOUNCE_MS = 90', 'catalog debounce');
must(catalog, 'getInstantAnimeSearch(', 'catalog instant lane');
must(catalog, 'instantPreviewQuery === query', 'instant preview query guard');
must(catalog, 'authoritativeSettled', 'authoritative race guard');
must(catalog, 'requestId !== requestSequenceRef.current', 'catalog generation guard');
must(catalog, 'найдено · уточняем…', 'instant enrichment status');
must(catalog, 'setInstantPreviewQuery(null)', 'authoritative preview reset');

must(suggestions, '}, 80);', 'suggestion debounce');
must(suggestionApi, 'after(async () => {', 'background suggestion bootstrap');
must(
  suggestionApi,
  '[Search suggestions background bootstrap]',
  'non-blocking provider bootstrap marker',
);

must(instantApi, "observeApiRoute('/api/search/instant'", 'instant endpoint');
must(instantApi, 'searchLocalAnimeIndex(query, limit)', 'instant local lookup');
must(instantApi, 'filterAnimeIdsByAvailability', 'instant availability filter');
must(
  instantApi,
  "X-AnimeBox-Search-Path': 'instant-local-v1'",
  'instant response marker',
);
if (instantApi.includes('getAnimesWithShikimori')) {
  failures.push('instant endpoint must not call external anime providers');
}

must(instantClient, 'CACHE_TTL_MS', 'instant client cache');
must(instantClient, 'AbortSignal', 'instant abort support');

must(
  searchIndex,
  'export function localAnimeSearchHitToAnime',
  'local Anime shell mapper',
);
must(searchIndex, 'const primary = await runLexicalSearch', 'primary local query');
must(searchIndex, 'const strongPrimary =', 'healthy-primary short circuit');
must(searchIndex, 'await Promise.all(', 'parallel local fallbacks');

must(animeApi, 'const localHitsPromise:', 'parallel local lookup promise');
must(animeApi, 'const [primary, localHits] = await Promise.all([', 'provider/local parallel lookup');
must(animeApi, 'const missingLocalHits = localHits.filter(', 'deduplicated hydration');

if (failures.length) {
  console.error('[AnimeBox Patch 24.2 Instant Search] check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 24.2 Instant Search] local-first preview, non-blocking suggestions and parallel authoritative lookup passed.',
);
