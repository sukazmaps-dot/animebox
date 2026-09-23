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
const catalogCss = read('components/SearchCatalogClient.module.css');
const seasonPicker = read('components/catalog/SeasonYearPicker.tsx');
const filterState = read('lib/catalog-filter-state.ts');
const seasonHelpers = read('lib/catalog-season.ts');
const client = read('lib/anime-client.ts');
const api = read('app/api/anime/route.ts');
const anilist = read('lib/anilist.ts');
const searchPage = read('app/search/page.tsx');

for (const [label, source, needle] of [
  ['single filter state', catalog, 'useState<CatalogFiltersState>'],
  ['demographic controls', catalog, 'CATALOG_DEMOGRAPHICS'],
  ['anime-specific discovery controls', catalog, 'CATALOG_DISCOVERY_FILTERS'],
  ['studio controls', catalog, 'CATALOG_STUDIOS'],
  ['sort controls', catalog, 'CATALOG_SORTS'],
  ['season-year picker', catalog, '<SeasonYearPicker'],
  ['state type', filterState, 'export type CatalogFiltersState'],
  ['URL serialization', filterState, 'writeCatalogFiltersToUrl'],
  ['URL parsing', filterState, 'parseCatalogFilters'],
  ['provider projection', filterState, 'catalogFiltersToProviderOptions'],
  ['month to anime season', seasonHelpers, 'monthToCatalogSeason'],
  ['controlled season picker', seasonPicker, 'onChange: (value: CatalogSeasonValue | null) => void'],
]) {
  if (!source.includes(needle)) failures.push(`Catalog UI/state: missing ${label}.`);
}

for (const legacy of ['selectedYear', 'SEASON_OPTIONS', 'FORMAT_OPTIONS']) {
  if (catalog.includes(legacy)) failures.push(`Catalog UI: legacy filter state remains: ${legacy}.`);
}

for (const [label, source, needle] of [
  ['catalog sort choices', catalogCss, '.sortChoices'],
  ['catalog sort active state', catalogCss, '.sortChoiceActive'],
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

console.log('[AnimeBox Catalog Filters] State-driven anime-native filter invariants passed.');
