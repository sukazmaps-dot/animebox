import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const smart = read('lib/smart-search.ts');
const searchServer = read('lib/search-index-server.ts');
const animeApi = read('app/api/anime/route.ts');
const migration = read(
  'supabase/migrations/20260925030000_search_intelligence_foundation_v1.sql',
);

const failures = [];

for (const needle of [
  'normalizeSearchText',
  'buildSearchQueryVariants',
  'reverseTransliterateSearchQuery',
  'diceSimilarity',
]) {
  if (!smart.includes(needle)) {
    failures.push(`smart-search missing ${needle}`);
  }
}

for (const needle of [
  'searchLocalAnimeIndex',
  'hydrateLocalAnimeHits',
  'indexAnimeSearchDocuments',
]) {
  if (!searchServer.includes(needle)) {
    failures.push(`search index server missing ${needle}`);
  }
}

if (
  !animeApi.includes('searchLocalAnimeIndex(rawSearch') ||
  !animeApi.includes('mergeAnimeCandidates(localAnime, candidates)') ||
  !animeApi.includes('localIndexUsed')
) {
  failures.push('anime API does not merge local fuzzy candidates');
}

for (const needle of [
  'create extension if not exists pg_trgm',
  'create extension if not exists unaccent',
  'create extension if not exists vector',
  'anime_search_documents',
  'search_anime_lexical',
  'match_anime_semantic',
  'anime_catalog_search_document_sync',
]) {
  if (!migration.includes(needle)) {
    failures.push(`search migration missing ${needle}`);
  }
}

if (failures.length) {
  console.error('[AnimeBox Search Intelligence] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox Search Intelligence] core search invariants passed.');
