'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';
import type { CommunityProfile } from '@/lib/community-client';
import {
  ACHIEVEMENT_CATEGORY_LABELS,
  LEVEL_MILESTONES,
  type AchievementCategory,
} from '@/lib/progression';
import {
  getCommunityProfileCached,
  peekCommunityProfile,
} from '@/lib/community-profile-cache';

import styles from './AchievementJourneyClient.module.css';

function metricValue(
  stats: CommunityProfile['stats'] | NonNullable<CommunityProfile['rewardStats']>,
  metric: string,
) {
  const value = Number((stats as Record<string, unknown>)[metric] ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export default function AchievementJourneyClient() {
  const { user, loading: authLoading } = useAuthState();
  const [profile, setProfile] = useState<CommunityProfile | null>(
    () => peekCommunityProfile(user?.id),
  );
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading || !user?.id) return;
    let active = true;

    void getCommunityProfileCached(user.id)
      .then((value) => {
        if (!active) return;
        setProfile(value);
        setError('');
      })
      .catch((loadError) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Не удалось загрузить путь достижений.',
        );
      });

    return () => {
      active = false;
    };
  }, [authLoading, user?.id]);

  const journey = useMemo(() => {
    if (!profile) return null;

    const rewardStats = profile.rewardStats ?? profile.stats;
    const visible = profile.achievements.filter((item) => !item.hidden);
    const unlocked = visible.filter((item) => Boolean(item.earned_at));

    const nearest = visible
      .filter((item) => !item.earned_at)
      .map((item) => {
        const current = Math.min(
          metricValue(rewardStats, item.metric),
          item.threshold,
        );
        return {
          ...item,
          current,
          ratio: current / Math.max(1, item.threshold),
        };
      })
      .sort((a, b) => b.ratio - a.ratio || a.sort_order - b.sort_order)
      .slice(0, 4);

    const categories = (
      ['watch', 'collection', 'time', 'community', 'genres'] as AchievementCategory[]
    ).map((category) => {
      const rows = visible.filter((item) => item.category === category);
      const earned = rows.filter((item) => Boolean(item.earned_at)).length;
      return {
        category,
        earned,
        total: rows.length,
        percent: rows.length ? Math.round((earned / rows.length) * 100) : 0,
      };
    });

    return {
      rewardStats,
      unlocked: unlocked.length,
      total: visible.length,
      nearest,
      categories,
    };
  }, [profile]);

  if (authLoading) {
    return <main className={styles.page}><div className={styles.state}>Загружаем путь…</div></main>;
  }

  if (!user) {
    return (
      <main className={styles.page}>
        <div className={styles.state}>
          <strong>Войди в AnimeBox</strong>
          <span>Journey хранится вместе с прогрессом аккаунта.</span>
          <Link href="/login?next=/achievements/journey">Войти</Link>
        </div>
      </main>
    );
  }

  if (error) {
    return <main className={styles.page}><div className={styles.state}>{error}</div></main>;
  }

  if (!profile || !journey) {
    return <main className={styles.page}><div className={styles.state}>Собираем Journey…</div></main>;
  }

  const progression = profile.progression;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>ANIMEBOX JOURNEY</span>
          <h1>Твой путь</h1>
          <p>
            Уровни, серии, время и достижения в одной линии прогресса.
            Наградные значения берутся только из подтверждённых сервером событий.
          </p>
        </div>
        <div className={styles.heroStats}>
          <strong>LVL {progression.level}</strong>
          <span>{journey.unlocked} / {journey.total} достижений</span>
          <small>{progression.totalXp.toLocaleString('ru-RU')} XP</small>
        </div>
      </section>

      <nav className={styles.nav}>
        <Link href="/achievements">Все достижения</Link>
        <Link href="/challenges">Задания</Link>
        <Link href="/leaderboard">League</Link>
      </nav>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>БЛИЖАЙШИЕ ЦЕЛИ</span>
            <h2>Что открыть следующим</h2>
          </div>
        </div>

        <div className={styles.nearestGrid}>
          {journey.nearest.length ? journey.nearest.map((item) => {
            const percent = Math.min(100, Math.round(item.ratio * 100));
            return (
              <article className={styles.targetCard} key={item.code}>
                <div className={styles.targetTop}>
                  <span>{ACHIEVEMENT_CATEGORY_LABELS[item.category]}</span>
                  <strong>+{item.xp_reward} XP</strong>
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <div className={styles.progress} aria-hidden="true">
                  <span style={{ width: `${percent}%` }} />
                </div>
                <footer>
                  <span>{item.current} / {item.threshold}</span>
                  <span>{percent}%</span>
                </footer>
              </article>
            );
          }) : (
            <div className={styles.completeState}>
              Все доступные достижения уже открыты.
            </div>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>КАТЕГОРИИ</span>
            <h2>Карта прогресса</h2>
          </div>
        </div>

        <div className={styles.categoryGrid}>
          {journey.categories.map((item) => (
            <article className={styles.categoryCard} key={item.category}>
              <span>{ACHIEVEMENT_CATEGORY_LABELS[item.category]}</span>
              <strong>{item.earned} / {item.total}</strong>
              <div className={styles.progress} aria-hidden="true">
                <span style={{ width: `${item.percent}%` }} />
              </div>
              <small>{item.percent}% пути</small>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>LEVEL JOURNEY</span>
            <h2>Большие этапы</h2>
          </div>
          <span className={styles.trustedBadge}>Trusted progression</span>
        </div>

        <div className={styles.timeline}>
          {LEVEL_MILESTONES.map((milestone) => {
            const reached = progression.level >= milestone.level;
            const current =
              !reached &&
              LEVEL_MILESTONES.find((item) => item.level > progression.level)?.level ===
                milestone.level;

            return (
              <article
                className={styles.milestone}
                data-reached={reached ? 'true' : 'false'}
                data-current={current ? 'true' : 'false'}
                key={milestone.level}
              >
                <div className={styles.levelBubble}>{milestone.level}</div>
                <div>
                  <span>{reached ? 'Открыто' : current ? 'Следующая ступень' : 'Впереди'}</span>
                  <h3>{milestone.title}</h3>
                  <p>{milestone.reward}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.integrity}>
        <strong>Как считается Journey</strong>
        <p>
          Обычная статистика профиля остаётся полной историей просмотра.
          XP, ачивки, задания и League используют отдельный trusted-контур:
          подозрительная активность не удаляет прогресс, но не превращается в награду.
        </p>
      </section>
    </main>
  );
}
