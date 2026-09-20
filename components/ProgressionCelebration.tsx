'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';
import { achievementIcon } from '@/lib/achievement-icons';
import {
  ACHIEVEMENT_RARITY_LABELS,
  type AchievementRarity,
} from '@/lib/progression';

import styles from './ProgressionCelebration.module.css';

type AchievementToast = {
  kind: 'achievement';
  key: string;
  title: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  xpReward: number;
};

type ChallengeToast = {
  kind: 'challenge';
  key: string;
  title: string;
  description: string;
  xpReward: number;
};

type LevelToast = {
  kind: 'level';
  key: string;
  levelBefore: number;
  levelAfter: number;
  rankAfter: string;
};

type Toast = AchievementToast | ChallengeToast | LevelToast;

type InboxEvent = {
  id: number;
  levelBefore: number;
  levelAfter: number;
  rankAfter: string;
  achievements: {
    code: string;
    title: string;
    description: string;
    icon: string;
    rarity: AchievementRarity;
    xpReward: number;
  }[];
  challenges: {
    code: string;
    title: string;
    description: string;
    xpReward: number;
  }[];
};

export default function ProgressionCelebration() {
  const { user } = useAuthState();
  const [queue, setQueue] = useState<Toast[]>([]);
  const [active, setActive] = useState<Toast | null>(null);
  const fetchingRef = useRef(false);

  const fetchEvents = useCallback(async () => {
    if (!user?.id || fetchingRef.current) return;

    fetchingRef.current = true;

    try {
      const response = await fetch('/api/community/progression-events', {
        cache: 'no-store',
      });

      if (!response.ok) return;

      const payload = (await response.json()) as { events?: InboxEvent[] };
      const events = Array.isArray(payload.events) ? payload.events : [];
      if (!events.length) return;

      const next: Toast[] = [];

      for (const event of events) {
        for (const challenge of event.challenges ?? []) {
          next.push({
            kind: 'challenge',
            key: `challenge:${event.id}:${challenge.code}`,
            title: challenge.title,
            description: challenge.description,
            xpReward: challenge.xpReward,
          });
        }

        for (const achievement of event.achievements ?? []) {
          next.push({
            kind: 'achievement',
            key: `achievement:${event.id}:${achievement.code}`,
            title: achievement.title,
            description: achievement.description,
            icon: achievement.icon,
            rarity: achievement.rarity,
            xpReward: achievement.xpReward,
          });
        }

        if (event.levelAfter > event.levelBefore) {
          next.push({
            kind: 'level',
            key: `level:${event.id}`,
            levelBefore: event.levelBefore,
            levelAfter: event.levelAfter,
            rankAfter: event.rankAfter,
          });
        }
      }

      if (next.length) {
        setQueue((current) => [...current, ...next]);
      }

      await fetch('/api/community/progression-events', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: events.map((event) => event.id) }),
      }).catch(() => undefined);
    } finally {
      fetchingRef.current = false;
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setQueue([]);
      setActive(null);
      return;
    }

    void fetchEvents();

    const onProgression = () => {
      window.setTimeout(() => void fetchEvents(), 120);
    };

    window.addEventListener('animebox:progression-updated', onProgression);
    return () => {
      window.removeEventListener('animebox:progression-updated', onProgression);
    };
  }, [fetchEvents, user?.id]);

  useEffect(() => {
    if (active || queue.length === 0) return;
    const [first, ...rest] = queue;
    queueMicrotask(() => {
      setActive(first);
      setQueue(rest);
    });
  }, [active, queue]);

  useEffect(() => {
    if (!active) return;

    const timeout = window.setTimeout(
      () => setActive(null),
      active.kind === 'level' ? 3600 : 4300,
    );

    return () => window.clearTimeout(timeout);
  }, [active]);

  if (!active) return null;

  if (active.kind === 'level') {
    return (
      <aside className={`${styles.toast} ${styles.levelToast}`} role="status" aria-live="polite">
        <span className={styles.glow} aria-hidden="true" />
        <span className={styles.eyebrow}>LEVEL UP</span>
        <div className={styles.levels}>
          <span>{active.levelBefore}</span>
          <b aria-hidden="true">→</b>
          <strong>{active.levelAfter}</strong>
        </div>
        <span className={styles.rank}>{active.rankAfter}</span>
      </aside>
    );
  }

  if (active.kind === 'challenge') {
    return (
      <aside
        className={`${styles.toast} ${styles.challengeToast}`}
        role="status"
        aria-live="polite"
      >
        <span className={styles.glow} aria-hidden="true" />
        <div className={styles.challengeIcon} aria-hidden="true">✓</div>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>ЗАДАНИЕ ВЫПОЛНЕНО</span>
          <strong>{active.title}</strong>
          <p>{active.description}</p>
          <div className={styles.meta}>
            <span>CHALLENGE</span>
            <b>+{active.xpReward} XP</b>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={styles.toast}
      data-rarity={active.rarity}
      role="status"
      aria-live="polite"
    >
      <span className={styles.glow} aria-hidden="true" />
      <div className={styles.icon}>
        <img src={achievementIcon(active.key, active.icon)} alt="" />
      </div>
      <div className={styles.copy}>
        <span className={styles.eyebrow}>НОВОЕ ДОСТИЖЕНИЕ</span>
        <strong>{active.title}</strong>
        <p>{active.description}</p>
        <div className={styles.meta}>
          <span>{ACHIEVEMENT_RARITY_LABELS[active.rarity]}</span>
          <b>+{active.xpReward} XP</b>
        </div>
      </div>
    </aside>
  );
}
