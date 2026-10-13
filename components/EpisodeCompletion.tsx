'use client';

import { useCallback, useEffect, useState, useId } from 'react';
import styles from './EpisodeCompletion.module.css';
import type { WatchProgressEventDetail } from '@/components/useWatchSession';

type WatchStateResponse = {
  state?: {
    episode: number;
    positionMs: number;
    durationMs: number | null;
    coverageMs: number;
    activeMs: number;
    excludedMs?: number;
    eligibleDurationMs?: number | null;
    completed: boolean;
    watchedAt: string | null;
  } | null;
};

function calculatePercent(coverageMs: number, eligibleDurationMs: number | null) {
  if (!eligibleDurationMs || eligibleDurationMs <= 0) return null;
  return Math.min(
    100,
    Math.max(0, Math.round((coverageMs / eligibleDurationMs) * 100)),
  );
}

export default function EpisodeCompletion({
  animeId,
  episode,
}: {
  animeId: number;
  episode: number;
}) {
  const progressId = useId();
  const [percent, setPercent] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const [available, setAvailable] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/watch?animeId=${encodeURIComponent(String(animeId))}&episode=${encodeURIComponent(String(episode))}`,
        { cache: 'no-store' },
      );

      if (response.status === 401) {
        setAvailable(false);
        return;
      }

      if (!response.ok) return;

      const payload = (await response.json()) as WatchStateResponse;
      const state = payload.state;

      setAvailable(true);
      setCompleted(Boolean(state?.completed));
      setPercent(
        state
          ? calculatePercent(
              state.coverageMs,
              state.eligibleDurationMs ?? state.durationMs,
            )
          : 0,
      );
    } catch {
      // Progress UI is optional; playback must keep working if telemetry is down.
    }
  }, [animeId, episode]);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });

    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<WatchProgressEventDetail>).detail;
      if (!detail || detail.animeId !== animeId || detail.episode !== episode) {
        return;
      }

      setAvailable(true);
      setCompleted(detail.completed);
      setPercent(detail.percent);
    };

    const onCompleted = () => {
      void refresh();
    };

    window.addEventListener('watch-progress', onProgress as EventListener);
    window.addEventListener('episode-completed', onCompleted);

    return () => {
      window.removeEventListener('watch-progress', onProgress as EventListener);
      window.removeEventListener('episode-completed', onCompleted);
    };
  }, [animeId, episode, refresh]);

  if (!available) return null;

  const shownPercent = completed ? 100 : Math.max(0, percent ?? 0);

  return (
    <section className={styles.completion} aria-label={`Прогресс просмотра серии ${episode}`}>
      <div className={styles.heading}>
        <span>Серия {episode} · {completed ? 'просмотрена' : 'прогресс'}</span>
        <span>{shownPercent}%</span>
        <details className={styles.help}>
          <summary aria-label="Как засчитывается просмотр" title="Как засчитывается просмотр">?</summary>
          <p>Серия засчитывается автоматически после 90% подтверждённой обязательной части. Кнопки пропуска опенинга/эндинга учитываются, обычная перемотка — нет.</p>
        </details>
      </div>
      <div id={progressId} className={styles.track} role="progressbar"
        aria-label={`Серия ${episode}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={shownPercent}>
        <span style={{ width: `${shownPercent}%` }} />
      </div>
    </section>
  );
}
