'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './WatchControls.module.css';

type Choice = { id: string; label: string };

export default function WatchControls({
  identity, episodes, secondary, translationLabel, translation, translations,
  onTranslation, source, sources, onSource, quality, theater, onTheater,
}: {
  identity: ReactNode;
  episodes: ReactNode;
  secondary: ReactNode;
  translationLabel: string;
  translation: string;
  translations: Choice[];
  onTranslation: (id: string) => void;
  source: string;
  sources: Choice[];
  onSource: (id: string) => void;
  quality: string;
  theater: boolean;
  onTheater: () => void;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (event: KeyboardEvent | PointerEvent) => {
      const menu = menuRef.current;
      if (!menu?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
        menu.open = false;
        menu.querySelector('summary')?.focus({ preventScroll: true });
      } else if (event.target instanceof Node && !menu.contains(event.target)) {
        menu.open = false;
      }
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, []);

  return (
    <div className={styles.controls} data-watch-controls>
      {identity}
      <div className={styles.toolbar}>
        {episodes}
        {translations.length > 0 ? (
          <label className={styles.translation}>
            <span>{translationLabel}</span>
            <select aria-label={translationLabel} value={translation}
              onChange={(event) => onTranslation(event.target.value)}>
              {translations.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        ) : <span />}
        <details ref={menuRef} className={styles.menu}>
          <summary aria-label="Ещё настройки просмотра" title="Настройки просмотра">⋯</summary>
          <div className={styles.panel}>
            <label className={styles.source}>
              <span>Источник видео</span>
              <select aria-label="Источник видео" value={source}
                onChange={(event) => onSource(event.target.value)}>
                <option value="auto">Авто</option>
                {sources.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <p className={styles.quality}>{quality}</p>
            <button type="button" data-player-action="theater" aria-pressed={theater}
              className={styles.theater} onClick={() => {
                if (menuRef.current) menuRef.current.open = false;
                onTheater();
              }}>
              {theater ? 'Обычный режим' : 'Кинотеатр'}
            </button>
            {secondary}
          </div>
        </details>
      </div>
    </div>
  );
}
