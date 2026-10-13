'use client';
import { useId, useState } from 'react';
import styles from './AnimeSynopsis.module.css';

function heroExcerpt(text: string) {
  if (text.length <= 240) return text;
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [];
  let excerpt = '';
  for (const sentence of sentences) {
    if ((excerpt + sentence).length > 240) break;
    excerpt += sentence;
  }
  if (excerpt.trim().length >= 120) return excerpt.trim();
  const boundary = text.lastIndexOf(' ', 220);
  return `${text.slice(0, boundary > 0 ? boundary : 220).trim()}…`;
}

export default function AnimeSynopsis({ text, variant = 'default' }: { text: string; variant?: 'default' | 'hero' }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const excerpt = variant === 'hero' ? heroExcerpt(text) : text;
  const collapsible = variant === 'hero' ? excerpt !== text : text.length > 1100 || text.split(/\n\s*\n/).filter(Boolean).length > 3;
  return (
    <div className={`${styles.synopsis} ${variant === 'hero' ? styles.hero : ''}`}>
      <p id={id} className={expanded || !collapsible || variant === 'hero' ? styles.full : styles.preview}>{expanded ? text : excerpt}</p>
      {collapsible && (
        <button type="button" aria-expanded={expanded} aria-controls={id}
          onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Свернуть ↑' : variant === 'hero' ? 'Полное описание ↓' : 'Читать далее ↓'}
        </button>
      )}
    </div>
  );
}
