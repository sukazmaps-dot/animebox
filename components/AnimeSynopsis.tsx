'use client';
import { useId, useState } from 'react';
import styles from './AnimeSynopsis.module.css';

export default function AnimeSynopsis({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return (
    <div className={styles.synopsis}>
      <p id={id} className={expanded || text.length <= 180 ? styles.full : styles.preview}>{text}</p>
      {text.length > 180 && (
        <button type="button" aria-expanded={expanded} aria-controls={id}
          onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Свернуть ↑' : 'Читать далее ↓'}
        </button>
      )}
    </div>
  );
}
