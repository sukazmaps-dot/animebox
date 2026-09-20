'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { useAuthState } from '@/components/AuthStateProvider';
import AchievementShowcaseEditor from '@/components/AchievementShowcaseEditor';
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
  invalidateCommunityProfile,
  peekCommunityProfile,
} from '@/lib/community-profile-cache';

import styles from './Achievements.module.css';

type Filter = 'all' | AchievementCategory;
type SortMode = 'smart' | 'earned' | 'near' | 'rarity';

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

function formatEarnedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Получено';

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export default function AchievementsClient() {
  const { user, loading: authLoading } = useAuthState();
  const [data, setData] = useState<CommunityProfile | null>(
    () => peekCommunityProfile(user?.id),
  );
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortMode>('smart');
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

    const rarityWeight: Record<AchievementRarity, number> = {
      common: 1,
      uncommon: 2,
      rare: 3,
      epic: 4,
      legendary: 5,
    };

    const rows = data.achievements.filter(
      (achievement) => filter === 'all' || achievement.category === filter,
    );

    return [...rows].sort((a, b) => {
      const aEarned = Boolean(a.earned_at);
      const bEarned = Boolean(b.earned_at);
      const aCurrent = Math.min(metricValue(data.stats, a.metric), a.threshold);
      const bCurrent = Math.min(metricValue(data.stats, b.metric), b.threshold);
      const aProgress = aEarned ? 1 : aCurrent / Math.max(1, a.threshold);
      const bProgress = bEarned ? 1 : bCurrent / Math.max(1, b.threshold);

      if (sort === 'earned') {
        if (aEarned !== bEarned) return aEarned ? -1 : 1;
        return Date.parse(b.earned_at || '') - Date.parse(a.earned_at || '');
      }

      if (sort === 'near') {
        if (aEarned !== bEarned) return aEarned ? 1 : -1;
        return bProgress - aProgress || a.threshold - b.threshold;
      }

      if (sort === 'rarity') {
        return rarityWeight[b.rarity] - rarityWeight[a.rarity] || a.sort_order - b.sort_order;
      }

      if (aEarned !== bEarned) return aEarned ? -1 : 1;
      if (!aEarned && !bEarned) return bProgress - aProgress || a.sort_order - b.sort_order;
      return Date.parse(b.earned_at || '') - Date.parse(a.earned_at || '');
    });
  }, [data, filter, sort]);

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
          <span className={styles.eyebrow}>AnimeBox · Прогресс</span>
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
        <div>
          <span>Витрина профиля</span>
          <strong>{data.featuredAchievements.length} / 3</strong>
        </div>
      </section>

      <div className={styles.levelTrack} aria-hidden="true">
        <span style={{ width: `${progression.progressPct}%` }} />
      </div>

      <div className={styles.controls}>
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

        <div className={styles.sorts} aria-label="Сортировка достижений">
          {([
            ['smart', 'Умно'],
            ['near', 'Ближайшие'],
            ['earned', 'Полученные'],
            ['rarity', 'Редкость'],
          ] as const).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={sort === value ? styles.activeSort : ''}
              onClick={() => setSort(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <AchievementShowcaseEditor
          achievements={data.achievements}
          featuredCodes={data.featuredAchievements}
          onSaved={(codes) => {
            setData((current) =>
              current ? { ...current, featuredAchievements: codes } : current,
            );
            if (user?.id) invalidateCommunityProfile(user.id);
          }}
        />
      </div>

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
                  <span>
                    {earned && achievement.earned_at
                      ? formatEarnedAt(achievement.earned_at)
                      : `${current} / ${achievement.threshold}`}
                  </span>
                  <span>
                    {data.featuredAchievements.includes(achievement.code)
                      ? '★ В витрине'
                      : ACHIEVEMENT_CATEGORY_LABELS[achievement.category]}
                  </span>
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
