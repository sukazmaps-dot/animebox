import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  const full = join(root, path);
  if (!existsSync(full)) {
    failures.push(`${path}: required file is missing.`);
    return '';
  }
  return readFileSync(full, 'utf8');
}

const catalog = read('components/SearchCatalogClient.tsx');
const filterPanel = read('components/catalog/CatalogFilterPanel.tsx');
const mobileFilters = read('components/catalog/CatalogMobileFilters.tsx');
const activeFilters = read('components/catalog/ActiveCatalogFilters.tsx');
const studioPicker = read('components/catalog/StudioPicker.tsx');
const seasonPicker = read('components/catalog/SeasonYearPicker.tsx');
const filterState = read('lib/catalog-filter-state.ts');
const seasonHelpers = read('lib/catalog-season.ts');
const client = read('lib/anime-client.ts');
const api = read('app/api/anime/route.ts');
const anilist = read('lib/anilist.ts');
const searchPage = read('app/search/page.tsx');

for (const [label, source, needle] of [
  ['single filter state', catalog, 'useState<CatalogFiltersState>'],
  ['modular desktop filters', catalog, '<CatalogFilterPanel'],
  ['mobile accordion filters', catalog, '<CatalogMobileFilters'],
  ['active filter chips', catalog, '<ActiveCatalogFilters'],
  ['browser history push', catalog, 'window.history.pushState'],
  ['browser history restore', catalog, "window.addEventListener('popstate'"],
  ['request cancellation', catalog, 'new AbortController()'],
  ['request sequence guard', catalog, 'requestSequenceRef'],
  ['stale refresh state', catalog, 'resultsRefreshing'],
  ['useful empty state', catalog, 'relaxationActions'],
  ['demographic controls', filterPanel, 'CATALOG_DEMOGRAPHICS'],
  ['anime-specific discovery controls', filterPanel, 'CATALOG_DISCOVERY_FILTERS'],
  ['studio picker', filterPanel, '<StudioPicker'],
  ['sort controls', filterPanel, 'CATALOG_SORTS'],
  ['mobile one-section accordion', mobileFilters, 'openSection'],
  ['mobile results button', mobileFilters, 'Показать результаты'],
  ['active chip removal', activeFilters, '<FilterChip'],
  ['searchable studio list', studioPicker, 'visibleStudios'],
  ['state type', filterState, 'export type CatalogFiltersState'],
  ['URL serialization', filterState, 'writeCatalogFiltersToUrl'],
  ['URL parsing', filterState, 'parseCatalogFilters'],
  ['browser URL parser', filterState, 'parseCatalogFiltersFromSearchParams'],
  ['filter equality guard', filterState, 'catalogFiltersEqual'],
  ['provider projection', filterState, 'catalogFiltersToProviderOptions'],
  ['month to anime season', seasonHelpers, 'monthToCatalogSeason'],
  ['current anime season', seasonHelpers, 'getCurrentAnimeSeason'],
  ['controlled season picker', seasonPicker, 'onChange: (value: CatalogSeasonValue | null) => void'],
  ['grouped season archive', seasonPicker, 'yearGroup'],
]) {
  if (!source.includes(needle)) failures.push(`Catalog UI/state: missing ${label}.`);
}

for (const legacy of ['selectedYear', 'SEASON_OPTIONS', 'FORMAT_OPTIONS']) {
  if (catalog.includes(legacy)) failures.push(`Catalog UI: legacy filter state remains: ${legacy}.`);
}

for (const [label, source, needle] of [
  ['client studio serialization', client, "params.set('studios'"],
  ['API studio parsing', api, "params.get('studios')"],
  ['API updated sort', api, "orderRaw === 'updated'"],
  ['AniList studio metadata', anilist, 'studios {'],
  ['AniList studio post-filter', anilist, 'requestedStudios'],
  ['AniList updated sort', anilist, 'UPDATED_AT_DESC'],
  ['SSR filter parsing', searchPage, 'parseCatalogFilters(params)'],
  ['SSR filter pass-through', searchPage, 'initialFilters={initialFilters}'],
]) {
  if (!source.includes(needle)) failures.push(`Catalog filters: missing ${label}.`);
}

if (anilist.includes('studio_in:')) {
  failures.push('Catalog filters: unsupported AniList media studio_in filter must not be used.');
}

if (failures.length) {
  console.error('\n[AnimeBox Catalog Filters] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Catalog Filters] UX + reliability invariants passed.');
