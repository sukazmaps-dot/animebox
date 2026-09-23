'use client';

import FilterChip from '@/components/catalog/FilterChip';
import {
  CATALOG_DEMOGRAPHICS,
  CATALOG_DISCOVERY_FILTERS,
  CATALOG_FORMATS,
  CATALOG_SORTS,
  CATALOG_STATUSES,
  CATALOG_STUDIOS,
  type CatalogFiltersState,
} from '@/lib/catalog-filter-state';
import { formatCatalogSeason } from '@/lib/catalog-season';
import styles from './ActiveCatalogFilters.module.css';

type FilterKey =
  | { type: 'demographic'; value: string }
  | { type: 'discovery'; value: string }
  | { type: 'studio'; value: string }
  | { type: 'format' }
  | { type: 'status' }
  | { type: 'season' }
  | { type: 'sort' };

export function catalogActiveFilterLabels(filters: CatalogFiltersState): string[] {
  const labels: string[] = [];

  for (const id of filters.demographics) {
    const option = CATALOG_DEMOGRAPHICS.find((item) => item.id === id);
    if (option) labels.push(option.label);
  }
  for (const id of filters.discovery) {
    const option = CATALOG_DISCOVERY_FILTERS.find((item) => item.id === id);
    if (option) labels.push(option.label);
  }
  for (const id of filters.studios) {
    const option = CATALOG_STUDIOS.find((item) => item.id === id);
    if (option) labels.push(option.label);
  }
  if (filters.format) {
    const option = CATALOG_FORMATS.find((item) => item.value === filters.format);
    if (option) labels.push(option.label);
  }
  if (filters.status) {
    const option = CATALOG_STATUSES.find((item) => item.value === filters.status);
    if (option) labels.push(option.label);
  }
  if (filters.season) labels.push(formatCatalogSeason(filters.season));
  if (filters.sort !== 'rating') {
    const option = CATALOG_SORTS.find((item) => item.value === filters.sort);
    if (option) labels.push(option.label);
  }

  return labels;
}

function removeFilter(filters: CatalogFiltersState, key: FilterKey): CatalogFiltersState {
  switch (key.type) {
    case 'demographic':
      return { ...filters, demographics: filters.demographics.filter((value) => value !== key.value) };
    case 'discovery':
      return { ...filters, discovery: filters.discovery.filter((value) => value !== key.value) };
    case 'studio':
      return { ...filters, studios: filters.studios.filter((value) => value !== key.value) };
    case 'format':
      return { ...filters, format: null };
    case 'status':
      return { ...filters, status: null };
    case 'season':
      return { ...filters, season: null };
    case 'sort':
      return { ...filters, sort: 'rating' };
  }
}

export default function ActiveCatalogFilters({
  filters,
  onChange,
  onClear,
  onRemoved,
}: {
  filters: CatalogFiltersState;
  onChange: (next: CatalogFiltersState) => void;
  onClear: () => void;
  onRemoved?: (filter: string, value: string) => void;
}) {
  const chips: Array<{ key: string; label: string; filter: FilterKey; analyticsValue: string }> = [];

  for (const id of filters.demographics) {
    const option = CATALOG_DEMOGRAPHICS.find((item) => item.id === id);
    if (option) chips.push({ key: `demo:${id}`, label: option.label, filter: { type: 'demographic', value: id }, analyticsValue: id });
  }
  for (const id of filters.discovery) {
    const option = CATALOG_DISCOVERY_FILTERS.find((item) => item.id === id);
    if (option) chips.push({ key: `tag:${id}`, label: option.label, filter: { type: 'discovery', value: id }, analyticsValue: id });
  }
  for (const id of filters.studios) {
    const option = CATALOG_STUDIOS.find((item) => item.id === id);
    if (option) chips.push({ key: `studio:${id}`, label: option.label, filter: { type: 'studio', value: id }, analyticsValue: id });
  }

  if (filters.format) {
    const option = CATALOG_FORMATS.find((item) => item.value === filters.format);
    if (option) chips.push({ key: 'format', label: option.label, filter: { type: 'format' }, analyticsValue: filters.format });
  }
  if (filters.status) {
    const option = CATALOG_STATUSES.find((item) => item.value === filters.status);
    if (option) chips.push({ key: 'status', label: option.label, filter: { type: 'status' }, analyticsValue: filters.status });
  }
  if (filters.season) {
    chips.push({
      key: 'season',
      label: formatCatalogSeason(filters.season),
      filter: { type: 'season' },
      analyticsValue: `${filters.season.season.toLowerCase()}-${filters.season.year}`,
    });
  }
  if (filters.sort !== 'rating') {
    const option = CATALOG_SORTS.find((item) => item.value === filters.sort);
    if (option) chips.push({ key: 'sort', label: option.label, filter: { type: 'sort' }, analyticsValue: filters.sort });
  }

  if (chips.length === 0) return null;

  return (
    <div className={styles.bar} aria-label="Активные фильтры">
      <div className={styles.rail}>
        {chips.map((chip) => (
          <FilterChip
            key={chip.key}
            label={chip.label}
            onRemove={() => {
              onRemoved?.(chip.filter.type, chip.analyticsValue);
              onChange(removeFilter(filters, chip.filter));
            }}
          />
        ))}
      </div>
      <button type="button" className={styles.clear} onClick={onClear}>
        Очистить всё
      </button>
    </div>
  );
}
