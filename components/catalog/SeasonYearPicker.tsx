'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CATALOG_SEASON_LABELS,
  createCatalogSeasonOptions,
  formatCatalogSeason,
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
  const options = useMemo(
    () => createCatalogSeasonOptions(minYear, maxYear),
    [minYear, maxYear],
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
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Любой сезон
          </button>

          {options.map((option, index) => {
            const active = value?.year === option.year && value.season === option.season;
            const previousYear = index > 0 ? options[index - 1]?.year : null;
            const showYear = index === 0 || previousYear !== option.year;

            return (
              <div key={`${option.season}-${option.year}`}>
                {showYear ? <div className={styles.yearLabel}>{option.year}</div> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={active ? styles.optionActive : styles.option}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                >
                  <span>{CATALOG_SEASON_LABELS[option.season]}</span>
                  {active ? <span aria-hidden="true">✓</span> : null}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
