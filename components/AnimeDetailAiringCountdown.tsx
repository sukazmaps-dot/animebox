'use client';

import { useEffect, useState } from 'react';
import { getAiringCountdown } from '@/lib/airing-countdown';
import styles from './AnimeDetailAiringCountdown.module.css';

type AnimeDetailAiringCountdownProps = {
  episode?: number | null;
  /** Unix timestamp in seconds from AniList. */
  airingAt?: number | null;
};

export default function AnimeDetailAiringCountdown({ episode, airingAt }: AnimeDetailAiringCountdownProps) {
  const [now, setNow] = useState<number | null>(null);
  const hasSchedule =
    Number.isSafeInteger(episode) &&
    Number.isSafeInteger(airingAt) &&
    Boolean(episode && episode > 0 && airingAt && airingAt > 0);

  useEffect(() => {
    if (!hasSchedule) return;

    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [hasSchedule]);

  if (!hasSchedule || !episode || !airingAt) return null;

  const snapshot = now === null ? null : getAiringCountdown(airingAt, now);
  const expired = snapshot?.state === 'elapsed';

  return (
    <div className={styles.root} data-state={snapshot?.state ?? 'loading'}
      aria-label={expired ? 'Расчётное время выхода серии ' + episode + ' прошло' : 'До выхода серии ' + episode + ': ' + (snapshot?.label ?? 'загрузка')}>
      <span className={styles.label}>Следующая серия · {episode}</span>
      <strong className={styles.value} role="timer" aria-live="off">{snapshot?.label ?? '—'}</strong>
    </div>
  );
}
