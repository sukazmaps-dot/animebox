'use client';

import { useMemo, useState } from 'react';
import SeasonYearPicker from '@/components/catalog/SeasonYearPicker';
import StudioPicker from '@/components/catalog/StudioPicker';
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
import styles from './CatalogMobileFilters.module.css';

type SectionId =
  | 'demographics'
  | 'discovery'
  | 'format'
  | 'status'
  | 'season'
  | 'studio'
  | 'sort';

function joinedLabels(ids: string[], options: readonly { id: string; label: string }[]) {
  const labels = ids
    .map((id) => options.find((option) => option.id === id)?.label)
    .filter((label): label is string => Boolean(label));
  if (labels.length === 0) return 'Не выбрано';
  if (labels.length === 1) return labels[0];
  return `${labels.length} выбрано`;
}

export default function CatalogMobileFilters({
  filters,
  onChange,
  onClear,
  onDone,
  onFilterChange,
}: {
  filters: CatalogFiltersState;
  onChange: (next: CatalogFiltersState) => void;
  onClear: () => void;
  onDone: () => void;
  onFilterChange?: (filter: string, value: string) => void;
}) {
  const [openSection, setOpenSection] = useState<SectionId | null>(null);

  const summaries = useMemo(() => ({
    demographics: joinedLabels(filters.demographics, CATALOG_DEMOGRAPHICS),
    discovery: joinedLabels(filters.discovery, CATALOG_DISCOVERY_FILTERS),
    studio: joinedLabels(filters.studios, CATALOG_STUDIOS),
    format: CATALOG_FORMATS.find((item) => item.value === filters.format)?.label ?? 'Любой',
    status: CATALOG_STATUSES.find((item) => item.value === filters.status)?.label ?? 'Любой',
    season: filters.season ? formatCatalogSeason(filters.season) : 'Любой сезон',
    sort: CATALOG_SORTS.find((item) => item.value === filters.sort)?.label ?? 'По рейтингу',
  }), [filters]);

  const toggleList = (key: 'demographics' | 'discovery', value: string) => {
    const values = filters[key];
    onChange({
      ...filters,
      [key]: values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value],
    });
    onFilterChange?.(key, value);
  };

  const sectionHeader = (id: SectionId, label: string, summary: string) => (
    <button
      type="button"
      className={styles.sectionHeader}
      aria-expanded={openSection === id}
      onClick={() => setOpenSection((current) => current === id ? null : id)}
    >
      <span>{label}</span>
      <span className={styles.summary}>{summary}</span>
      <span aria-hidden="true" className={openSection === id ? styles.arrowOpen : styles.arrow}>›</span>
    </button>
  );

  return (
    <div className={styles.mobilePanel}>
      <div className={styles.head}>
        <strong>Фильтры</strong>
        <button type="button" onClick={onClear}>Сбросить</button>
      </div>

      <section className={styles.section}>
        {sectionHeader('demographics', 'Для кого', summaries.demographics)}
        {openSection === 'demographics' && (
          <div className={styles.sectionBody}>
            <div className={styles.grid}>
              {CATALOG_DEMOGRAPHICS.map((option) => {
                const active = filters.demographics.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    className={active ? styles.choiceActive : styles.choice}
                    onClick={() => toggleList('demographics', option.id)}
                  >
                    {option.label}{active ? <span aria-hidden="true">✓</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className={styles.section}>
        {sectionHeader('discovery', 'Темы и сеттинг', summaries.discovery)}
        {openSection === 'discovery' && (
          <div className={styles.sectionBody}>
            <div className={styles.grid}>
              {CATALOG_DISCOVERY_FILTERS.map((option) => {
                const active = filters.discovery.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    className={active ? styles.choiceActive : styles.choice}
                    onClick={() => toggleList('discovery', option.id)}
                  >
                    {option.label}{active ? <span aria-hidden="true">✓</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className={styles.section}>
        {sectionHeader('format', 'Формат', summaries.format)}
        {openSection === 'format' && (
          <div className={styles.sectionBody}>
            <div className={styles.grid}>
              {CATALOG_FORMATS.map((option) => {
                const active = filters.format === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    className={active ? styles.choiceActive : styles.choice}
                    onClick={() => {
                      const next = active ? null : option.value;
                      onChange({ ...filters, format: next });
                      onFilterChange?.('format', next ?? 'any');
                    }}
                  >
                    {option.label}{active ? <span aria-hidden="true">✓</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className={styles.section}>
        {sectionHeader('status', 'Статус', summaries.status)}
        {openSection === 'status' && (
          <div className={styles.sectionBody}>
            <div className={styles.grid}>
              {CATALOG_STATUSES.map((option) => {
                const active = filters.status === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    className={active ? styles.choiceActive : styles.choice}
                    onClick={() => {
                      const next = active ? null : option.value;
                      onChange({ ...filters, status: next });
                      onFilterChange?.('status', next ?? 'any');
                    }}
                  >
                    {option.label}{active ? <span aria-hidden="true">✓</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className={styles.section}>
        {sectionHeader('season', 'Аниме-сезон', summaries.season)}
        {openSection === 'season' && (
          <div className={styles.sectionBody}>
            <SeasonYearPicker
              value={filters.season}
              onChange={(season) => {
                onChange({ ...filters, season });
                onFilterChange?.(
                  'season',
                  season ? `${season.season.toLowerCase()}-${season.year}` : 'any',
                );
              }}
            />
          </div>
        )}
      </section>

      <section className={styles.section}>
        {sectionHeader('studio', 'Студия', summaries.studio)}
        {openSection === 'studio' && (
          <div className={styles.sectionBody}>
            <StudioPicker
              value={filters.studios}
              onChange={(studios) => {
                onChange({ ...filters, studios });
                onFilterChange?.('studios', studios.join(','));
              }}
            />
          </div>
        )}
      </section>

      <section className={styles.section}>
        {sectionHeader('sort', 'Сортировка', summaries.sort)}
        {openSection === 'sort' && (
          <div className={styles.sectionBody}>
            <div className={styles.sortList}>
              {CATALOG_SORTS.map((option) => {
                const active = filters.sort === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    className={active ? styles.sortActive : styles.sort}
                    onClick={() => {
                      onChange({ ...filters, sort: option.value });
                      onFilterChange?.('sort', option.value);
                    }}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <button type="button" className={styles.done} onClick={onDone}>
        Показать результаты
      </button>
    </div>
  );
}
