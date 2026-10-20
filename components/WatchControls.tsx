'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
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
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      } else if (event.target instanceof Node &&
        !panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);

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
        <button ref={triggerRef} type="button" className={styles.more}
          aria-label="Ещё настройки просмотра" aria-expanded={open} aria-controls={panelId}
          title="Настройки просмотра" onClick={() => setOpen((value) => !value)}>⋯</button>
          <div ref={panelRef} id={panelId} hidden={!open} className={styles.panel}>
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
                setOpen(false);
                onTheater();
              }}>
              {theater ? 'Обычный режим' : 'Кинотеатр'}
            </button>
            {secondary}
          </div>
      </div>
    </div>
  );
}
