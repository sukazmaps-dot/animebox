import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const navbar = read('components/Navbar.tsx');
const suggestions = read('components/SearchSuggestions.tsx');
const catalogCss = read('components/SearchCatalogClient.module.css');
const moodCss = read('components/catalog/MoodFilter.module.css');
const localization = read('lib/anime-localization-server.ts');
const route = read('lib/anime-route.ts');

const failures = [];

const filterZ = Number(
  catalogCss.match(/\.filterBar\s*\{[^}]*z-index:\s*(\d+)/s)?.[1] ?? NaN,
);
const moodZ = Number(
  moodCss.match(/\.root\s*\{[^}]*z-index:\s*(\d+)/s)?.[1] ?? NaN,
);

if (
  !Number.isFinite(filterZ) ||
  !Number.isFinite(moodZ) ||
  filterZ >= 30 ||
  moodZ >= 30
) {
  failures.push('catalog controls can still overlap the global topbar');
}

if (
  !navbar.includes('searchFormRef') ||
  !navbar.includes('onBlurCapture={(event) =>') ||
  !navbar.includes('form.contains(document.activeElement)') ||
  !navbar.includes('setSearchActive(false)') ||
  !navbar.includes("setSearchValue('')") ||
  !navbar.includes('queueMicrotask(() => {') ||
  !navbar.includes('onFocus={() =>') ||
  !navbar.includes('searchActive && searchValue.trim().length >= 2')
) {
  failures.push('global search outside-click / route lifecycle is incomplete');
}

if (
  !suggestions.includes('const controller = new AbortController()') ||
  !suggestions.includes('requestId !== requestRef.current') ||
  !suggestions.includes('controller.abort()')
) {
  failures.push('search suggestion stale-request protection is missing');
}

if (
  !route.includes('getCachedAnimeBase') ||
  !route.includes('getAniListAnimeById') ||
  !route.includes('localizeAnimeDetail(baseAnime)') ||
  route.includes('getAnimeByIdWithShikimori')
) {
  failures.push('anime detail cache can still store provider-localized failures');
}

if (
  !localization.includes("from('anime_search_documents')") ||
  !localization.includes("from('anime_catalog')") ||
  !localization.includes('localRussianTitle') ||
  !localization.includes('localRussianDescription') ||
  !localization.includes("cache: 'no-store'") ||
  !localization.includes('const NEGATIVE_CACHE_MS = 90_000') ||
  !localization.includes('persistRussianLocalization') ||
  !localization.includes('containsCyrillic')
) {
  failures.push('persistent RU localization fallback contract is incomplete');
}

const localTitleIndex = localization.indexOf('const russianTitle = localRussianTitle || providerTitle');
if (localTitleIndex < 0) {
  failures.push('local Russian title is not preferred over provider fallback');
}

if (failures.length) {
  console.error('[AnimeBox Patch 20.1.1] Check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  'PASS: Patch 20.1.1 search lifecycle, catalog layering and RU localization reliability',
);
