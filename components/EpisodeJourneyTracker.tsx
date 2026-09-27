'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  achievementSoundUnlocked,
  achievementSoundsEnabled,
  playAchievementUnlockSound,
  prepareAchievementSounds,
  unlockAchievementSoundsFromGesture,
} from '@/lib/achievement-sound';

import styles from './EpisodeJourneyTracker.module.css';

type JourneyEvent = {
  id: string;
  eventKey: string;
  kind: string;
  atMs: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  unlocked: boolean;
  unlockedAt: string | null;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
};

type UnlockPayload = {
  unlocked?: boolean;
  event?: {
    id: string;
    kind: string;
    title: string;
    description: string;
    rarity: JourneyEvent['rarity'];
    imageUrl?: string | null;
  };
};

const RETRY_AFTER_MS = 4_000;
const POPUP_MS = 5_500;

function kindLabel(kind: string) {
  const labels: Record<string, string> = {
    character_intro: 'Встреча',
    battle: 'Битва',
    tension: 'Напряжение',
    reveal: 'Открытие',
    secret: 'Секрет',
    death: 'Событие',
    finale: 'Финал',
    arc_complete: 'Арка',
    episode_milestone: 'Путь',
  };
  return labels[kind] ?? 'Момент';
}

export default function EpisodeJourneyTracker({
  animeId,
  episode,
}: {
  animeId: number;
  episode: number;
}) {
  const [events, setEvents] = useState<JourneyEvent[]>([]);
  const [toast, setToast] = useState<UnlockPayload['event'] | null>(null);
  const [soundReady, setSoundReady] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const attemptedRef = useRef(new Map<string, number>());
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    prepareAchievementSounds();
    setSoundReady(achievementSoundUnlocked());
    setSoundEnabled(achievementSoundsEnabled());

    const onSoundState = (event: Event) => {
      const detail = (event as CustomEvent<{ unlocked?: boolean; enabled?: boolean }>).detail;
      setSoundReady(Boolean(detail?.unlocked));
      setSoundEnabled(detail?.enabled !== false);
    };

    window.addEventListener('animebox:achievement-sound-state', onSoundState);
    return () => window.removeEventListener('animebox:achievement-sound-state', onSoundState);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    void fetch(
      `/api/community/episode-events?animeId=${encodeURIComponent(String(animeId))}&episode=${encodeURIComponent(String(episode))}`,
      { cache: 'no-store', signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) return { events: [] };
        return response.json() as Promise<{ events?: JourneyEvent[] }>;
      })
      .then((payload) => {
        if (active) setEvents(Array.isArray(payload.events) ? payload.events : []);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      controller.abort();
    };
  }, [animeId, episode]);

  useEffect(() => {
    if (!events.length) return;

    const onSample = (event: Event) => {
      const detail = (event as CustomEvent<{
        animeId?: number;
        episode?: number;
        positionSeconds?: number;
      }>).detail;

      if (
        !detail ||
        detail.animeId !== animeId ||
        detail.episode !== episode ||
        !Number.isFinite(detail.positionSeconds)
      ) {
        return;
      }

      const observedPositionMs = Math.max(0, Math.round(Number(detail.positionSeconds) * 1000));
      const now = Date.now();

      for (const item of events) {
        if (item.unlocked || observedPositionMs < item.atMs + 2_000) continue;

        const lastAttempt = attemptedRef.current.get(item.id) ?? 0;
        if (now - lastAttempt < RETRY_AFTER_MS) continue;
        attemptedRef.current.set(item.id, now);

        void fetch('/api/community/episode-events', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId: item.id,
            observedPositionMs,
          }),
        })
          .then(async (response) => {
            const payload = await response.json() as UnlockPayload;
            if (!response.ok || !payload.unlocked || !payload.event) return;

            setEvents((current) =>
              current.map((candidate) =>
                candidate.id === item.id
                  ? {
                      ...candidate,
                      unlocked: true,
                      unlockedAt: new Date().toISOString(),
                      title: payload.event?.title ?? candidate.title,
                      description: payload.event?.description ?? candidate.description,
                      imageUrl: payload.event?.imageUrl ?? candidate.imageUrl,
                    }
                  : candidate,
              ),
            );

            void playAchievementUnlockSound({
              eventId: payload.event.id,
              rarity: payload.event.rarity,
              kind: payload.event.kind,
            });

            setToast(payload.event);
            if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
            toastTimerRef.current = window.setTimeout(() => setToast(null), POPUP_MS);
          })
          .catch(() => undefined);
      }
    };

    window.addEventListener('animebox:player-time-sample', onSample);
    return () => window.removeEventListener('animebox:player-time-sample', onSample);
  }, [animeId, episode, events]);

  useEffect(() => () => {
    if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
  }, []);

  const unlockedCount = useMemo(
    () => events.filter((item) => item.unlocked).length,
    [events],
  );

  if (!events.length && !toast) return null;

  return (
    <>
      {toast && (
        <aside className={styles.toast} data-rarity={toast.rarity} aria-live="polite">
          <div className={styles.spark}>✦</div>
          <div>
            <span>{kindLabel(toast.kind)} · Путь открыт</span>
            <strong>{toast.title}</strong>
            {toast.description && <p>{toast.description}</p>}
          </div>
        </aside>
      )}

      {events.length > 0 && (
        <div className={styles.counter} aria-label="Прогресс пути серии">
          <span>Путь серии</span>
          <strong>{unlockedCount}/{events.length}</strong>
          {!soundReady && (
            <button
              type="button"
              className={styles.soundButton}
              onClick={() => void unlockAchievementSoundsFromGesture()}
              aria-label="Включить звуки достижений"
              title="Включить звуки достижений"
            >
              {soundEnabled ? '🔊' : '🔇'}
            </button>
          )}
        </div>
      )}
    </>
  );
}
