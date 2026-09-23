'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CATALOG_SEASON_LABELS,
  createCatalogSeasonOptions,
  formatCatalogSeason,
  getCurrentAnimeSeason,
  type CatalogSeasonValue,
} from '@/lib/catalog-season';
import styles from './SeasonYearPicker.module.css';

export default function SeasonYearPicker({
  value,
  onChange,
  minYear = 1980,
  maxYear = new Date().getFullYear() + 1,
}: {
  value: CatalogSeasonValue | null;
  onChange: (value: CatalogSeasonValue | null) => void;
  minYear?: number;
  maxYear?: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentSeason = useMemo(() => getCurrentAnimeSeason(), []);
  const options = useMemo(
    () => createCatalogSeasonOptions(minYear, maxYear),
    [minYear, maxYear],
  );

  const years = useMemo(() => {
    const grouped = new Map<number, CatalogSeasonValue[]>();
    for (const option of options) {
      const list = grouped.get(option.year) ?? [];
      list.push(option);
      grouped.set(option.year, list);
    }
    return [...grouped.entries()];
  }, [options]);

  const quickOptions = useMemo(
    () => options.filter((option) => option.year === currentSeason.year),
    [currentSeason.year, options],
  );

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (next: CatalogSeasonValue | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value ? formatCatalogSeason(value) : 'Любой сезон'}</span>
        <span className={open ? styles.chevronOpen : styles.chevron} aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div className={styles.menu} role="listbox" aria-label="Выбрать аниме-сезон">
          <button
            type="button"
            role="option"
            aria-selected={value === null}
            className={value === null ? styles.optionActive : styles.option}
            onClick={() => choose(null)}
          >
            Любой сезон
          </button>

          <div className={styles.currentBlock}>
            <span>Текущий сезон</span>
            <button
              type="button"
              role="option"
              aria-selected={
                value?.year === currentSeason.year &&
                value.season === currentSeason.season
              }
              className={
                value?.year === currentSeason.year &&
                value.season === currentSeason.season
                  ? styles.currentActive
                  : styles.current
              }
              onClick={() => choose(currentSeason)}
            >
              {formatCatalogSeason(currentSeason)}
            </button>
          </div>

          <div className={styles.quickGrid} aria-label="Сезоны текущего года">
            {quickOptions.map((option) => {
              const active = value?.year === option.year && value.season === option.season;
              return (
                <button
                  key={`quick-${option.season}-${option.year}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={active ? styles.quickActive : styles.quick}
                  onClick={() => choose(option)}
                >
                  {CATALOG_SEASON_LABELS[option.season]}
                </button>
              );
            })}
          </div>

          <div className={styles.archive}>
            {years
              .filter(([year]) => year !== currentSeason.year)
              .map(([year, yearOptions]) => (
                <div key={year} className={styles.yearGroup}>
                  <div className={styles.yearLabel}>{year}</div>
                  <div className={styles.yearGrid}>
                    {yearOptions.map((option) => {
                      const active = value?.year === option.year && value.season === option.season;
                      return (
                        <button
                          key={`${option.season}-${option.year}`}
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={active ? styles.optionActive : styles.option}
                          onClick={() => choose(option)}
                        >
                          {CATALOG_SEASON_LABELS[option.season]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
