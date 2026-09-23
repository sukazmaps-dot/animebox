import type { CatalogSeason, CatalogSeasonValue } from '@/lib/catalog-season';

export type CatalogStatus = 'ongoing' | 'finished' | 'upcoming';
export type CatalogFormat = 'TV' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL';
export type CatalogSort = 'rating' | 'updated' | 'popular';

export type CatalogFiltersState = {
  demographics: string[];
  discovery: string[];
  format: CatalogFormat | null;
  status: CatalogStatus | null;
  season: CatalogSeasonValue | null;
  studios: string[];
  sort: CatalogSort;
};

export const CATALOG_DEMOGRAPHICS = [
  { id: 'shounen', label: 'Сёнен', providerTag: 'Shounen' },
  { id: 'shoujo', label: 'Сёдзё', providerTag: 'Shoujo' },
  { id: 'seinen', label: 'Сейнен', providerTag: 'Seinen' },
  { id: 'josei', label: 'Дзёсэй', providerTag: 'Josei' },
] as const;

export const CATALOG_DISCOVERY_FILTERS = [
  { id: 'isekai', label: 'Исекай', provider: 'tag', value: 'Isekai' },
  { id: 'mecha', label: 'Меха', provider: 'genre', value: 'Mecha' },
  { id: 'cyberpunk', label: 'Киберпанк', provider: 'tag', value: 'Cyberpunk' },
  { id: 'slice-of-life', label: 'Повседневность', provider: 'genre', value: 'Slice of Life' },
  { id: 'sports', label: 'Спокон', provider: 'genre', value: 'Sports' },
  { id: 'mahou-shoujo', label: 'Махо-сёдзё', provider: 'genre', value: 'Mahou Shoujo' },
  { id: 'psychological', label: 'Психологическое', provider: 'genre', value: 'Psychological' },
  { id: 'school', label: 'Школа', provider: 'tag', value: 'School' },
] as const;

export const CATALOG_FORMATS: Array<{ value: CatalogFormat; label: string }> = [
  { value: 'TV', label: 'TV-сериал' },
  { value: 'MOVIE', label: 'Полнометражный фильм' },
  { value: 'OVA', label: 'OVA' },
  { value: 'ONA', label: 'ONA' },
  { value: 'SPECIAL', label: 'Спешл' },
];

export const CATALOG_STATUSES: Array<{ value: CatalogStatus; label: string }> = [
  { value: 'ongoing', label: 'Выходит' },
  { value: 'finished', label: 'Завершён' },
  { value: 'upcoming', label: 'Анонс' },
];

export const CATALOG_STUDIOS = [
  { id: 'mappa', label: 'MAPPA', providerName: 'MAPPA' },
  { id: 'studio-ghibli', label: 'Studio Ghibli', providerName: 'Studio Ghibli' },
  { id: 'madhouse', label: 'Madhouse', providerName: 'Madhouse' },
  { id: 'wit-studio', label: 'Wit Studio', providerName: 'Wit Studio' },
  { id: 'bones', label: 'Bones', providerName: 'Bones' },
  { id: 'kyoto-animation', label: 'Kyoto Animation', providerName: 'Kyoto Animation' },
  { id: 'ufotable', label: 'ufotable', providerName: 'ufotable' },
  { id: 'toei-animation', label: 'Toei Animation', providerName: 'Toei Animation' },
  { id: 'cloverworks', label: 'CloverWorks', providerName: 'CloverWorks' },
  { id: 'a-1-pictures', label: 'A-1 Pictures', providerName: 'A-1 Pictures' },
] as const;

export const CATALOG_SORTS: Array<{ value: CatalogSort; label: string; hint: string }> = [
  { value: 'rating', label: 'По рейтингу', hint: 'Сначала выше оценка' },
  { value: 'updated', label: 'По обновлению', hint: 'Недавно обновлённые тайтлы' },
  { value: 'popular', label: 'По популярности', hint: 'Чаще добавляют в списки' },
];

export const DEFAULT_CATALOG_FILTERS: CatalogFiltersState = {
  demographics: [],
  discovery: [],
  format: null,
  status: null,
  season: null,
  studios: [],
  sort: 'rating',
};

const DEMOGRAPHIC_IDS = new Set<string>(CATALOG_DEMOGRAPHICS.map((item) => item.id));
const DISCOVERY_IDS = new Set<string>(CATALOG_DISCOVERY_FILTERS.map((item) => item.id));
const STUDIO_IDS = new Set<string>(CATALOG_STUDIOS.map((item) => item.id));
const FORMAT_VALUES = new Set<string>(CATALOG_FORMATS.map((item) => item.value));
const STATUS_VALUES = new Set<string>(CATALOG_STATUSES.map((item) => item.value));
const SORT_VALUES = new Set<string>(CATALOG_SORTS.map((item) => item.value));
const SEASON_VALUES = new Set<CatalogSeason>(['WINTER', 'SPRING', 'SUMMER', 'FALL']);

function firstParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? '' : '';
}

function listParam(value: string | string[] | undefined): string[] {
  return firstParam(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseCatalogFilters(
  params: Record<string, string | string[] | undefined>,
): CatalogFiltersState {
  const demographics = listParam(params.demo).filter((value) => DEMOGRAPHIC_IDS.has(value));
  const discovery = listParam(params.tags).filter((value) => DISCOVERY_IDS.has(value));
  const studios = listParam(params.studio).filter((value) => STUDIO_IDS.has(value));

  const formatRaw = firstParam(params.format).toUpperCase();
  const statusRaw = firstParam(params.status).toLowerCase();
  const sortRaw = firstParam(params.sort).toLowerCase();

  const seasonRaw = firstParam(params.season);
  const seasonMatch = /^([a-z]+)-(\d{4})$/i.exec(seasonRaw);
  let season: CatalogSeasonValue | null = null;

  if (seasonMatch) {
    const seasonName = seasonMatch[1].toUpperCase() as CatalogSeason;
    const year = Number(seasonMatch[2]);
    if (
      SEASON_VALUES.has(seasonName) &&
      Number.isSafeInteger(year) &&
      year >= 1940 &&
      year <= new Date().getFullYear() + 2
    ) {
      season = { season: seasonName, year };
    }
  }

  return {
    demographics,
    discovery,
    format: FORMAT_VALUES.has(formatRaw as CatalogFormat) ? formatRaw as CatalogFormat : null,
    status: STATUS_VALUES.has(statusRaw as CatalogStatus) ? statusRaw as CatalogStatus : null,
    season,
    studios,
    sort: SORT_VALUES.has(sortRaw as CatalogSort) ? sortRaw as CatalogSort : 'rating',
  };
}

export function writeCatalogFiltersToUrl(
  url: URL,
  filters: CatalogFiltersState,
): URL {
  const params = url.searchParams;
  const writeList = (key: string, values: string[]) => {
    if (values.length) params.set(key, values.join(','));
    else params.delete(key);
  };

  writeList('demo', filters.demographics);
  writeList('tags', filters.discovery);
  writeList('studio', filters.studios);

  if (filters.format) params.set('format', filters.format);
  else params.delete('format');

  if (filters.status) params.set('status', filters.status);
  else params.delete('status');

  if (filters.season) {
    params.set('season', `${filters.season.season.toLowerCase()}-${filters.season.year}`);
  } else {
    params.delete('season');
  }

  if (filters.sort !== 'rating') params.set('sort', filters.sort);
  else params.delete('sort');

  return url;
}

export function catalogFiltersToProviderOptions(filters: CatalogFiltersState) {
  const genres: string[] = [];
  const tags = filters.demographics
    .map((id) => CATALOG_DEMOGRAPHICS.find((item) => item.id === id)?.providerTag)
    .filter((value): value is string => Boolean(value));

  for (const id of filters.discovery) {
    const option = CATALOG_DISCOVERY_FILTERS.find((item) => item.id === id);
    if (!option) continue;
    if (option.provider === 'genre') genres.push(option.value);
    else tags.push(option.value);
  }

  const studioNames = filters.studios
    .map((id) => CATALOG_STUDIOS.find((item) => item.id === id)?.providerName)
    .filter((value): value is string => Boolean(value));

  return {
    genres,
    tags,
    format: filters.format ?? undefined,
    status: filters.status ?? undefined,
    season: filters.season?.season,
    year: filters.season?.year,
    studioNames,
    order:
      filters.sort === 'popular'
        ? 'popularity'
        : filters.sort === 'updated'
          ? 'updated'
          : 'ranked',
  } as const;
}

export function catalogFilterCount(filters: CatalogFiltersState): number {
  return (
    filters.demographics.length +
    filters.discovery.length +
    filters.studios.length +
    (filters.format ? 1 : 0) +
    (filters.status ? 1 : 0) +
    (filters.season ? 1 : 0) +
    (filters.sort === 'rating' ? 0 : 1)
  );
}

export function catalogFiltersAreDefault(filters: CatalogFiltersState): boolean {
  return catalogFilterCount(filters) === 0;
}
