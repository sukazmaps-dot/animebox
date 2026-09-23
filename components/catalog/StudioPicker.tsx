'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CATALOG_STUDIOS } from '@/lib/catalog-filter-state';
import FilterChip from '@/components/catalog/FilterChip';
import styles from './StudioPicker.module.css';

export default function StudioPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const visibleStudios = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU');
    if (!normalized) return CATALOG_STUDIOS;

    return CATALOG_STUDIOS.filter((studio) =>
      studio.label.toLocaleLowerCase('ru-RU').includes(normalized),
    );
  }, [query]);

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
    window.setTimeout(() => inputRef.current?.focus(), 0);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggleStudio = (id: string) => {
    onChange(
      value.includes(id)
        ? value.filter((current) => current !== id)
        : [...value, id],
    );
  };

  return (
    <div ref={rootRef} className={styles.root}>
      {value.length > 0 && (
        <div className={styles.selected} aria-label="Выбранные студии">
          {value.map((id) => {
            const studio = CATALOG_STUDIOS.find((item) => item.id === id);
            if (!studio) return null;
            return (
              <FilterChip
                key={id}
                label={studio.label}
                onRemove={() => onChange(value.filter((current) => current !== id))}
              />
            );
          })}
        </div>
      )}

      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value.length > 0 ? '+ Добавить студию' : 'Выбрать студию'}</span>
        <span aria-hidden="true" className={open ? styles.chevronOpen : styles.chevron}>⌄</span>
      </button>

      {open && (
        <div className={styles.menu}>
          <label className={styles.search}>
            <span className="sr-only">Найти студию</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти студию"
              autoComplete="off"
            />
          </label>

          <div className={styles.options} role="listbox" aria-label="Студии анимации" aria-multiselectable="true">
            {visibleStudios.map((studio) => {
              const active = value.includes(studio.id);
              return (
                <button
                  key={studio.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={active ? styles.optionActive : styles.option}
                  onClick={() => toggleStudio(studio.id)}
                >
                  <span>{studio.label}</span>
                  {active ? <span aria-hidden="true">✓</span> : null}
                </button>
              );
            })}
            {visibleStudios.length === 0 && (
              <span className={styles.empty}>Такой студии нет в быстром списке.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
