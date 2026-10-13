'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styles from './AnimeDetailTabs.module.css';

const tabs = [
  ['info', 'Инфо'],
  ['episodes', 'Серии и части'],
  ['discussion', 'Обсуждение'],
  ['related', 'Похожие'],
] as const;
type Tab = (typeof tabs)[number][0];

export default function AnimeDetailTabs(props: Record<Tab, ReactNode>) {
  const [active, setActive] = useState<Tab>('info');
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    setActive(tabs[next][0]);
    buttons.current[next]?.focus();
  }
  return (
    <div className={styles.shell}>
      <div className={styles.tabs} role="tablist" aria-label="Разделы тайтла">
        {tabs.map(([id, label], index) => (
          <button key={id} ref={(node) => { buttons.current[index] = node; }}
            type="button" role="tab" id={`anime-tab-${id}`}
            aria-controls={`anime-panel-${id}`} aria-selected={active === id}
            tabIndex={active === id ? 0 : -1}
            onClick={() => setActive(id)} onKeyDown={(event) => navigate(event, index)}>
            {label}
          </button>
        ))}
      </div>
      {/* Keep server-rendered content and link discovery, and preserve panel state. */}
      {tabs.map(([id]) => (
        <div key={id} className={styles.panel} id={`anime-panel-${id}`}
          role="tabpanel" aria-labelledby={`anime-tab-${id}`}
          tabIndex={0} hidden={active !== id}>
          {props[id]}
        </div>
      ))}
    </div>
  );
}
