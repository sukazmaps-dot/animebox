'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WatchProgressEventDetail } from '@/components/useWatchSession';

type WatchStateResponse = {
  state?: {
    episode: number;
    positionMs: number;
    durationMs: number | null;
    coverageMs: number;
    activeMs: number;
    completed: boolean;
    watchedAt: string | null;
  } | null;
};

function calculatePercent(coverageMs: number, durationMs: number | null) {
  if (!durationMs || durationMs <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((coverageMs / durationMs) * 100)));
}

export default function EpisodeCompletion({
  animeId,
  episode,
}: {
  animeId: number;
  episode: number;
}) {
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
          ? calculatePercent(state.coverageMs, state.durationMs)
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
    <section className="community-panel community-completion" aria-live="polite">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong>
            Серия {episode}: {completed ? 'просмотрена' : 'прогресс просмотра'}
          </strong>
          <span className="text-sm font-bold text-violet-200">
            {shownPercent}%
          </span>
        </div>

        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"
          aria-hidden="true"
        >
          <span
            className="block h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400 transition-[width] duration-500"
            style={{ width: `${shownPercent}%` }}
          />
        </div>

        <p className="mt-2">
          {completed
            ? 'AnimeBox подтвердил просмотр автоматически.'
            : 'Серия засчитывается автоматически после 90% подтверждённого просмотра. Перемотка вперёд не считается.'}
        </p>
      </div>
    </section>
  );
}
