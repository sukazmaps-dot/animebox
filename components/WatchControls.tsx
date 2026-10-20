'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';
import FloatingMenu from './ui/FloatingMenu';
import ChoiceSelect from './ui/ChoiceSelect';
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
  const panelId = useId();


  return (
    <div className={styles.controls} data-watch-controls>
      {identity}
      <div className={styles.toolbar}>
        {episodes}
        {translations.length > 0 ? (
          <ChoiceSelect label={translationLabel} value={translation} options={translations} onChange={onTranslation} />
        ) : <span />}
        <button ref={triggerRef} type="button" className={styles.more}
          aria-label="Ещё настройки просмотра" aria-expanded={open} aria-controls={open ? panelId : undefined}
          title="Настройки просмотра" onClick={() => setOpen((value) => !value)}><Icon name="settings" size={20} aria-hidden="true" /></button>
            <button type="button" data-player-action="theater" aria-pressed={theater} aria-label={theater ? 'Обычный режим' : 'Кинотеатр'} title={theater ? 'Обычный режим' : 'Кинотеатр'}
              className={styles.theater} onClick={() => {
                setOpen(false);
                onTheater();
              }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.6" /></svg>
            </button>
          {open && <FloatingMenu anchor={triggerRef} label="Источник и качество" onClose={() => setOpen(false)}>
          <div id={panelId} className={styles.panel}>
            <ChoiceSelect label="Источник видео" value={source}
              options={[{ id: 'auto', label: 'Авто' }, ...sources]} onChange={onSource} />
            <p className={styles.quality}>{quality}</p>
            {secondary}
          </div>
          </FloatingMenu>}
      </div>
    </div>
  );
}
