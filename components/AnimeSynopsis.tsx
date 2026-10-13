'use client';
import { useId, useState } from 'react';
import styles from './AnimeSynopsis.module.css';

export default function AnimeSynopsis({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const collapsible = text.length > 1100 || text.split(/\n\s*\n/).filter(Boolean).length > 3;
  return (
    <div className={styles.synopsis}>
      <p id={id} className={expanded || !collapsible ? styles.full : styles.preview}>{text}</p>
      {collapsible && (
        <button type="button" aria-expanded={expanded} aria-controls={id}
          onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Свернуть ↑' : 'Читать далее ↓'}
        </button>
      )}
    </div>
  );
}
