import type { ReactNode } from 'react';
import styles from './AnimeCardContent.module.css';

/** Shared visual layout; callers keep their own links, ratings and controls.
 * Slots avoid nested links and preserve recommendation analytics handlers. */
export default function AnimeCardContent({
  media,
  children,
  variant = 'poster',
}: {
  media: ReactNode;
  children: ReactNode;
  variant?: 'poster' | 'inline';
}) {
  return (
    <div className={`anime-card-content anime-card-content--${variant} ${styles.content} ${styles[variant]}`}>
      <div className={`anime-card-content__media ${styles.media}`}>{media}</div>
      <div className={`anime-card-content__details ${styles.details}`}>{children}</div>
    </div>
  );
}
