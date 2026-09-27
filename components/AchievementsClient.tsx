'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { useAuthState } from '@/components/AuthStateProvider';
import AchievementShowcaseEditor from '@/components/AchievementShowcaseEditor';
import ProfileFrameOverlay from '@/components/profile/ProfileFrameOverlay';
import { achievementIcon } from '@/lib/achievement-icons';
import {
  ACHIEVEMENT_CATEGORY_LABELS,
  ACHIEVEMENT_RARITY_LABELS,
  LEVEL_MILESTONES,
  levelFrameAvatarScale,
  xpForLevel,
  type AchievementCategory,
  type AchievementRarity,
  type LevelFrameKey,
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

type FramePayload = {
  selectedFrame?: string | null;
  unlockedLevelFrames?: LevelFrameKey[];
  error?: string;
};

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
  const [frameState, setFrameState] = useState<FramePayload | null>(null);
  const [frameBusy, setFrameBusy] = useState('');
  const [frameError, setFrameError] = useState('');

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

  useEffect(() => {
    if (authLoading || !user?.id) return;

    let active = true;
    void fetch('/api/community/leaderboard-rewards', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as FramePayload;
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить рамки.');
        if (active) setFrameState(payload);
      })
      .catch((loadError) => {
        if (active) {
          setFrameError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить рамки.');
        }
      });

    return () => {
      active = false;
    };
  }, [authLoading, user?.id]);

  async function selectLevelFrame(frameKey: LevelFrameKey | null) {
    if (frameBusy) return;
    setFrameBusy(frameKey ?? 'none');
    setFrameError('');

    try {
      const response = await fetch('/api/community/leaderboard-rewards', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'select_frame', frameKey }),
      });
      const payload = await response.json() as FramePayload;
      if (!response.ok) throw new Error(payload.error || 'Не удалось выбрать рамку.');

      setFrameState((current) => ({
        ...(current ?? {}),
        selectedFrame: payload.selectedFrame ?? null,
      }));
      window.dispatchEvent(new Event('animebox:profile-cosmetic-changed'));
    } catch (selectError) {
      setFrameError(
        selectError instanceof Error ? selectError.message : 'Не удалось выбрать рамку.',
      );
    } finally {
      setFrameBusy('');
    }
  }

  const visible = useMemo(() => {
    if (!data) return [];

    const rarityWeight: Record<AchievementRarity, number> = {
      common: 1,
      uncommon: 2,
      rare: 3,
      epic: 4,
      legendary: 5,
    };

    const rewardStats = data.rewardStats ?? data.stats;
    const rows = data.achievements.filter(
      (achievement) => filter === 'all' || achievement.category === filter,
    );

    return [...rows].sort((a, b) => {
      const aEarned = Boolean(a.earned_at);
      const bEarned = Boolean(b.earned_at);
      const aCurrent = Math.min(metricValue(rewardStats, a.metric), a.threshold);
      const bCurrent = Math.min(metricValue(rewardStats, b.metric), b.threshold);
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
  const unlockedLevelFrames = new Set(frameState?.unlockedLevelFrames ?? []);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>AnimeBox · Прогресс</span>
          <h1>Уровни и достижения</h1>
          <p>
            LVL растёт вместе с реальной активностью: просмотром, завершёнными тайтлами,
            временем, комментариями, заданиями и достижениями.
          </p>
        </div>

        <div className={styles.level}>
          <span>LVL {progression.level}</span>
          <strong>{progression.rank}</strong>
          <small>{progression.totalXp.toLocaleString('ru-RU')} XP</small>
        </div>
      </section>

      <section className={styles.summary}>
        <div>
          <span>Открыто достижений</span>
          <strong>{unlocked} / {data.achievements.length}</strong>
        </div>
        <div>
          <span>До следующего LVL</span>
          <strong>
            {progression.nextLevelXp == null
              ? 'MAX'
              : `${progression.xpToNext.toLocaleString('ru-RU')} XP`}
          </strong>
        </div>
        <div>
          <span>Premium</span>
          <strong>Только визуал</strong>
        </div>
        <div>
          <span>Активная рамка</span>
          <strong>{frameState?.selectedFrame ? 'Выбрана' : 'Нет'}</strong>
        </div>
      </section>

      <div className={styles.levelTrack} aria-hidden="true">
        <span style={{ width: `${progression.progressPct}%` }} />
      </div>

      <section className={styles.levelGuide}>
        <div className={styles.levelGuideHead}>
          <div>
            <span className={styles.eyebrow}>LEVEL SYSTEM</span>
            <h2>Как работает LVL</h2>
            <p>
              Все уровни и статичные уровневые рамки доступны без Premium.
              Premium не пропускает и не ускоряет уровни — XP одинаков для всех.
              Он только оживляет уже открытую уровневую рамку и оформление профиля.
            </p>
          </div>
          {frameState?.selectedFrame && (
            <button
              type="button"
              className={styles.removeFrame}
              disabled={Boolean(frameBusy)}
              onClick={() => void selectLevelFrame(null)}
            >
              Снять текущую рамку
            </button>
          )}
        </div>

        <div className={styles.xpRules}>
          <article><strong>+10 XP</strong><span>подтверждённая серия</span></article>
          <article><strong>+75 XP</strong><span>завершённый тайтл</span></article>
          <article><strong>+15 XP</strong><span>каждые 30 минут активности</span></article>
          <article><strong>+2 XP</strong><span>комментарий · до 50</span></article>
        </div>

        <div className={styles.premiumCompare}>
          <div>
            <span>Обычный аккаунт</span>
            <strong>Статичная рамка уровня</strong>
            <p>Все LVL, ранги и уровневые рамки открываются обычной активностью.</p>
          </div>
          <div data-premium="true">
            <span>Premium</span>
            <strong>Та же рамка, но живая</strong>
            <p>Motion/glow уровневой рамки и Premium-оформление профиля. XP остаётся одинаковым для всех.</p>
          </div>
        </div>

        <div className={styles.milestones}>
          {LEVEL_MILESTONES.map((milestone, milestoneIndex) => {
            const reached = progression.level >= milestone.level;
            const nextMilestone = LEVEL_MILESTONES[milestoneIndex + 1];
            const currentMilestone =
              reached && (!nextMilestone || progression.level < nextMilestone.level);
            const selected = Boolean(
              milestone.frameKey && frameState?.selectedFrame === milestone.frameKey,
            );
            const frameUnlocked = Boolean(
              milestone.frameKey && unlockedLevelFrames.has(milestone.frameKey),
            );

            return (
              <article
                className={styles.milestone}
                data-reached={reached ? 'true' : 'false'}
                data-current={currentMilestone ? 'true' : 'false'}
                key={milestone.level}
              >
                <div className={styles.milestoneLevel}>
                  <span>LVL</span>
                  <strong>{milestone.level}</strong>
                </div>

                {milestone.frameKey ? (
                  <div className={styles.framePreview} aria-hidden="true">
                    <img
                      src="/default-avatar.webp"
                      alt=""
                      style={
                        milestone.frameKey
                          ? {
                              width: `${(levelFrameAvatarScale(milestone.frameKey) ?? 0.54) * 100}%`,
                              height: `${(levelFrameAvatarScale(milestone.frameKey) ?? 0.54) * 100}%`,
                            }
                          : undefined
                      }
                    />
                    <ProfileFrameOverlay
                      frameKey={milestone.frameKey}
                      premium={progression.premiumBoostActive}
                    />
                  </div>
                ) : (
                  <div className={styles.framePreviewEmpty} aria-hidden="true">✦</div>
                )}

                <div className={styles.milestoneCopy}>
                  <span>{xpForLevel(milestone.level).toLocaleString('ru-RU')} XP</span>
                  <h3>
                    {milestone.stageLabel
                      ? `${milestone.stageLabel} · ${milestone.title}`
                      : milestone.title}
                  </h3>
                  <p>{milestone.reward}</p>
                  <small>Premium · {milestone.premiumReward}</small>
                </div>

                <div className={styles.milestoneAction}>
                  {!milestone.frameKey ? (
                    <span>{reached ? 'Открыто' : 'Старт'}</span>
                  ) : frameUnlocked ? (
                    <button
                      type="button"
                      disabled={Boolean(frameBusy)}
                      data-selected={selected ? 'true' : 'false'}
                      onClick={() => void selectLevelFrame(selected ? null : milestone.frameKey)}
                    >
                      {selected ? 'Используется ✓' : 'Надеть'}
                    </button>
                  ) : (
                    <span>Нужно LVL {milestone.level}</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <p className={styles.frameRule}>
          На аватаре всегда только одна косметическая рамка. Если надеть уровневую рамку,
          активная League-рамка снимается; если выбрать League-рамку — снимается уровневая.
        </p>
        {frameError && <p className={styles.frameError} role="alert">{frameError}</p>}
      </section>

      <div className={styles.controls}>
        <Link href="/achievements/journey" className={styles.journeyLink}>
          Открыть Journey
        </Link>
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
            metricValue(data.rewardStats ?? data.stats, achievement.metric),
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
        Наградный прогресс считается отдельно от обычной статистики профиля и растёт только
        из подтверждённых сервером событий. Premium не меняет скорость прокачки: XP,
        достижения и требования LVL одинаковы для всех.
      </p>
    </main>
  );
}
