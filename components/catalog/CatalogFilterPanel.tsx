'use client';

import SeasonYearPicker from '@/components/catalog/SeasonYearPicker';
import StudioPicker from '@/components/catalog/StudioPicker';
import {
  CATALOG_DEMOGRAPHICS,
  CATALOG_DISCOVERY_FILTERS,
  CATALOG_FORMATS,
  CATALOG_SORTS,
  CATALOG_STATUSES,
  type CatalogFiltersState,
} from '@/lib/catalog-filter-state';
import styles from './CatalogFilterPanel.module.css';

export default function CatalogFilterPanel({
  filters,
  onChange,
  onClear,
  onFilterChange,
}: {
  filters: CatalogFiltersState;
  onChange: (next: CatalogFiltersState) => void;
  onClear: () => void;
  onFilterChange?: (filter: string, value: string) => void;
}) {
  const toggleList = (
    key: 'demographics' | 'discovery',
    value: string,
  ) => {
    const values = filters[key];
    onChange({
      ...filters,
      [key]: values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value],
    });
    onFilterChange?.(key, value);
  };

  return (
    <div className={styles.desktopPanel}>
      <div className={styles.head}>
        <div>
          <strong>Настроить подборку</strong>
          <span>Собери выдачу по аниме-тегам, сезону и студии.</span>
        </div>
        <button type="button" onClick={onClear}>Сбросить всё</button>
      </div>

      <div className={styles.primary}>
        <section className={styles.group}>
          <span className={styles.label}>Для кого</span>
          <div className={styles.choiceGrid}>
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
                  <span>{option.label}</span>
                  {active ? <span aria-hidden="true">✓</span> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.group}>
          <span className={styles.label}>Темы и сеттинг</span>
          <div className={styles.choiceGrid}>
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
                  <span>{option.label}</span>
                  {active ? <span aria-hidden="true">✓</span> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.group}>
          <span className={styles.label}>Студия</span>
          <StudioPicker
            value={filters.studios}
            onChange={(studios) => {
              onChange({ ...filters, studios });
              onFilterChange?.('studios', studios.join(','));
            }}
          />
        </section>
      </div>

      <div className={styles.secondary}>
        <section className={styles.group}>
          <span className={styles.label}>Формат релиза</span>
          <div className={styles.inlineChoices}>
            {CATALOG_FORMATS.map((option) => {
              const active = filters.format === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  className={active ? styles.compactActive : styles.compact}
                  onClick={() => {
                    const next = active ? null : option.value;
                    onChange({ ...filters, format: next });
                    onFilterChange?.('format', next ?? 'any');
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.group}>
          <span className={styles.label}>Статус</span>
          <div className={styles.inlineChoices}>
            {CATALOG_STATUSES.map((option) => {
              const active = filters.status === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  className={active ? styles.compactActive : styles.compact}
                  onClick={() => {
                    const next = active ? null : option.value;
                    onChange({ ...filters, status: next });
                    onFilterChange?.('status', next ?? 'any');
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.group}>
          <span className={styles.label}>Аниме-сезон</span>
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
        </section>

        <section className={styles.group}>
          <span className={styles.label}>Сортировка</span>
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
        </section>
      </div>
    </div>
  );
}
