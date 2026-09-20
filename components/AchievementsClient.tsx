'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { useAuthState } from '@/components/AuthStateProvider';
import { achievementIcon } from '@/lib/achievement-icons';
import {
  ACHIEVEMENT_CATEGORY_LABELS,
  ACHIEVEMENT_RARITY_LABELS,
  type AchievementCategory,
  type AchievementRarity,
} from '@/lib/progression';
import type { CommunityProfile } from '@/lib/community-client';
import {
  getCommunityProfileCached,
  peekCommunityProfile,
} from '@/lib/community-profile-cache';

import styles from './Achievements.module.css';

type Filter = 'all' | AchievementCategory;

const FILTERS: Filter[] = [
  'all',
  'watch',
  'collection',
  'time',
  'community',
  'genres',
];

function metricValue(stats: CommunityProfile['stats'], metric: string) {
  const value = Number((stats as Record<string, unknown>)[metric] ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export default function AchievementsClient() {
  const { user, loading: authLoading } = useAuthState();
  const [data, setData] = useState<CommunityProfile | null>(
    () => peekCommunityProfile(user?.id),
  );
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading || !user?.id) return;

    let active = true;
    void getCommunityProfileCached(user.id)
      .then((profile) => {
        if (!active) return;
        setData(profile);
        setError('');
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить достижения.');
      });

    return () => {
      active = false;
    };
  }, [authLoading, user?.id]);

  const visible = useMemo(() => {
    if (!data) return [];
    return data.achievements.filter(
      (achievement) => filter === 'all' || achievement.category === filter,
    );
  }, [data, filter]);

  if (authLoading) {
    return <main className={styles.page}><div className={styles.state}>Загружаем достижения…</div></main>;
  }

  if (!user) {
    return (
      <main className={styles.page}>
        <div className={styles.state}>
          <strong>Войди в AnimeBox</strong>
          <span>Уровни и достижения привязаны к аккаунту.</span>
          <Link href="/login?next=/achievements">Войти</Link>
        </div>
      </main>
    );
  }

  if (error) {
    return <main className={styles.page}><div className={styles.state}>{error}</div></main>;
  }

  if (!data) {
    return <main className={styles.page}><div className={styles.state}>Собираем прогресс…</div></main>;
  }

  const unlocked = data.achievements.filter((item) => Boolean(item.earned_at)).length;
  const progression = data.progression;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>ANIMEBOX PROGRESSION</span>
          <h1>Достижения</h1>
          <p>
            Просмотр, коллекция, время и активность превращаются в постоянный прогресс профиля.
          </p>
        </div>

        <div className={styles.level}>
          <span>LV.{progression.level}</span>
          <strong>{progression.rank}</strong>
          <small>{progression.totalXp.toLocaleString('ru-RU')} XP</small>
        </div>
      </section>

      <section className={styles.summary}>
        <div>
          <span>Открыто</span>
          <strong>{unlocked} / {data.achievements.length}</strong>
        </div>
        <div>
          <span>Следующий уровень</span>
          <strong>
            {progression.nextLevelXp == null
              ? 'MAX'
              : `${progression.xpToNext.toLocaleString('ru-RU')} XP`}
          </strong>
        </div>
        <div>
          <span>Premium boost</span>
          <strong>{progression.premiumBoostActive ? '+20% активен' : '+20% XP'}</strong>
        </div>
      </section>

      <div className={styles.levelTrack} aria-hidden="true">
        <span style={{ width: `${progression.progressPct}%` }} />
      </div>

      <nav className={styles.filters} aria-label="Категории достижений">
        {FILTERS.map((item) => (
          <button
            type="button"
            key={item}
            className={filter === item ? styles.active : ''}
            onClick={() => setFilter(item)}
          >
            {item === 'all' ? 'Все' : ACHIEVEMENT_CATEGORY_LABELS[item]}
          </button>
        ))}
      </nav>

      <section className={styles.grid}>
        {visible.map((achievement) => {
          const current = Math.min(
            metricValue(data.stats, achievement.metric),
            achievement.threshold,
          );
          const earned = Boolean(achievement.earned_at);
          const percent = earned
            ? 100
            : Math.min(100, Math.round((current / Math.max(1, achievement.threshold)) * 100));
          const rarity = achievement.rarity as AchievementRarity;

          return (
            <article
              className={`${styles.card} ${earned ? styles.earned : ''}`}
              data-rarity={rarity}
              key={achievement.code}
            >
              <div className={styles.icon}>
                <img src={achievementIcon(achievement.code, achievement.icon)} alt="" />
              </div>

              <div className={styles.copy}>
                <div className={styles.cardTop}>
                  <span data-rarity={rarity}>{ACHIEVEMENT_RARITY_LABELS[rarity]}</span>
                  <strong>+{achievement.xp_reward} XP</strong>
                </div>

                <h2>{achievement.title}</h2>
                <p>{achievement.description}</p>

                <div className={styles.progress}>
                  <span style={{ width: `${percent}%` }} />
                </div>

                <div className={styles.cardBottom}>
                  <span>{earned ? 'Получено' : `${current} / ${achievement.threshold}`}</span>
                  <span>{ACHIEVEMENT_CATEGORY_LABELS[achievement.category]}</span>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <p className={styles.note}>
        XP за просмотр начисляется только по подтверждённым данным плеера. Premium даёт +20% к новому XP за активность, но награды за достижения одинаковы для всех.
      </p>
    </main>
  );
}
