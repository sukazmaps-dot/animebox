'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { useAuthState } from '@/components/AuthStateProvider';
import AchievementShowcaseEditor from '@/components/AchievementShowcaseEditor';
import { achievementIcon } from '@/lib/achievement-icons';
import {
  ACHIEVEMENT_RARITY_LABELS,
  type AchievementRarity,
} from '@/lib/progression';
import {
  statusLabels,
  type CommunityProfile as ProfileData,
} from '@/lib/community-client';
import {
  getCommunityProfileCached,
  invalidateCommunityProfile,
  peekCommunityProfile,
} from '@/lib/community-profile-cache';
import { seedTrackerSnapshot } from '@/lib/tracker-client';

function WatchTime({ activeMs }: { activeMs: number }) {
  const totalSeconds = Math.max(0, Math.floor(activeMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return <>{hours}<em>ч</em> {minutes}<em>м</em></>;
  }

  if (minutes > 0) {
    return <>{minutes}<em>м</em> {seconds}<em>с</em></>;
  }

  return <>{seconds}<em>с</em></>;
}

function metricValue(stats: ProfileData['stats'], metric: string) {
  const value = (stats as Record<string, unknown>)[metric];
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function achievementPercent(
  stats: ProfileData['stats'],
  achievement: ProfileData['achievements'][number],
) {
  const current = Math.min(metricValue(stats, achievement.metric), achievement.threshold);
  return {
    current,
    percent: achievement.earned_at
      ? 100
      : Math.min(100, Math.round((current / Math.max(1, achievement.threshold)) * 100)),
  };
}

export default function CommunityProfile() {
  const { user } = useAuthState();
  const [data, setData] = useState<ProfileData | null>(() => peekCommunityProfile(user?.id));
  const [error, setError] = useState('');

  const load = useCallback(async (force = false) => {
    try {
      setError('');
      if (!user?.id) return;
      const profile = await getCommunityProfileCached(user.id, force);
      setData(profile);
      seedTrackerSnapshot(user.id, {
        stats: {
          watching: profile.stats.watching,
          planned: profile.stats.planned,
          completed: profile.stats.completed,
          dropped: profile.stats.dropped,
        },
        library: profile.library,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Ошибка профиля.');
    }
  }, [user]);

  useEffect(() => {
    let active = true;

    if (!user?.id) return;

    const cached = peekCommunityProfile(user.id);
    queueMicrotask(() => {
      if (!active) return;
      setData(cached);
      setError('');
    });

    void getCommunityProfileCached(user.id)
      .then((profile) => {
        if (!active) return;
        setData(profile);
        seedTrackerSnapshot(user.id, {
          stats: {
            watching: profile.stats.watching,
            planned: profile.stats.planned,
            completed: profile.stats.completed,
            dropped: profile.stats.dropped,
          },
          library: profile.library,
        });
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Ошибка профиля.');
        }
      });

    const handleProgressUpdated = () => {
      invalidateCommunityProfile(user.id);
      if (active) void load(true);
    };

    window.addEventListener('library-updated', handleProgressUpdated);
    window.addEventListener('animebox:progression-updated', handleProgressUpdated);

    return () => {
      active = false;
      window.removeEventListener('library-updated', handleProgressUpdated);
      window.removeEventListener('animebox:progression-updated', handleProgressUpdated);
    };
  }, [user?.id, load]);

  if (error) {
    return (
      <section className="profile-v2__community-error" role="alert">
        <span>{error}</span>
        <button type="button" onClick={() => void load(true)}>Повторить</button>
      </section>
    );
  }

  if (!data) {
    return (
      <div className="profile-v2__community-loading" role="status">
        Загружаем статистику…
      </div>
    );
  }

  const { stats, progression } = data;
  const unlockedCount = data.achievements.filter((item) => Boolean(item.earned_at)).length;
  const featuredAchievements = data.featuredAchievements
    .map((code) => data.achievements.find((item) => item.code === code))
    .filter((item): item is ProfileData['achievements'][number] => Boolean(item));
  const achievementPreview = [...data.achievements]
    .sort((a, b) => {
      const aUnlocked = Boolean(a.earned_at);
      const bUnlocked = Boolean(b.earned_at);

      if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;

      if (aUnlocked && bUnlocked) {
        return Date.parse(b.earned_at || '') - Date.parse(a.earned_at || '');
      }

      return (
        achievementPercent(stats, b).percent -
        achievementPercent(stats, a).percent
      );
    })
    .slice(0, 6);

  return (
    <>
      <section
        className="profile-v3__progression profile-v6__progression"
        data-rank={progression.rankKey}
        aria-label="Уровень AnimeBox"
      >
        <Link
          href="/achievements"
          className="profile-v6__progression-core"
          aria-label={`Уровень ${progression.level}: ${progression.rank}. Открыть прогресс и достижения`}
        >
          <div className="profile-v3__level-orb profile-v6__level-orb" aria-hidden="true">
            <span>LVL</span>
            <strong>{progression.level}</strong>
            <small>из {progression.maxLevel}</small>
          </div>

          <div className="profile-v3__progression-main">
            <div className="profile-v3__progression-title">
              <div>
                <span className="profile-v2__eyebrow">Прогресс аккаунта</span>
                <h2>{progression.rank}</h2>
              </div>
              <strong>{progression.totalXp.toLocaleString('ru-RU')} XP</strong>
            </div>

            <div
              className="profile-v3__xp-track"
              role="progressbar"
              aria-label="Прогресс до следующего уровня"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progression.progressPct)}
            >
              <span style={{ width: `${progression.progressPct}%` }} />
            </div>

            <div className="profile-v3__xp-meta">
              {progression.nextLevelXp == null ? (
                <span>Максимальный уровень достигнут</span>
              ) : (
                <>
                  <span>
                    {progression.levelProgressXp.toLocaleString('ru-RU')} / {progression.levelSpanXp.toLocaleString('ru-RU')} XP
                  </span>
                  <span>До LV.{progression.level + 1}: {progression.xpToNext.toLocaleString('ru-RU')} XP</span>
                </>
              )}
            </div>

            <div className="profile-v6__xp-sources" aria-hidden="true">
              <span>Серии</span>
              <span>Активность</span>
              <span>Комментарии</span>
              <span>Достижения</span>
            </div>
          </div>

          <span className="profile-v6__progression-arrow" aria-hidden="true">→</span>
        </Link>

        <aside className="profile-v3__progression-side">
          <span className={`profile-v3__xp-boost ${progression.premiumBoostActive ? 'is-active' : ''}`}>
            {progression.premiumBoostActive ? '+20% XP · Premium' : 'Premium · +20% XP'}
          </span>
          <small>
            {progression.premiumBoostActive
              ? 'Бонус действует на новый XP за активность.'
              : 'Открой достижения и посмотри, как быстрее повышать уровень.'}
          </small>
          <Link href="/achievements">Все достижения →</Link>
        </aside>
      </section>

      <Link
        className="profile-v5__challenges profile-v6__challenges-link"
        href="/challenges"
        aria-label="Открыть задания и серию активности"
      >
        <div className="profile-v5__challenge-streak">
          <span className="profile-v2__eyebrow">Серия активности</span>
          <strong className="profile-v6__streak-value">
            <img
              className="profile-v6__streak-fire"
              src="/brand/profile/streak-fire.webp"
              alt=""
              width="34"
              height="34"
              aria-hidden="true"
            />
            <span className="profile-v6__streak-copy">
              <b>{data.challenges.streak.current}</b>
              <span>{data.challenges.streak.current === 1 ? 'день' : 'дн.'}</span>
            </span>
          </strong>
          <small>Личный рекорд · {data.challenges.streak.longest}</small>
          <div className="profile-v6__streak-rail" aria-hidden="true">
            {Array.from({ length: 7 }, (_, index) => (
              <i
                key={index}
                className={index < Math.min(7, data.challenges.streak.current) ? 'is-active' : ''}
              />
            ))}
          </div>
        </div>

        <div className="profile-v5__challenge-progress">
          <div>
            <span>Сегодня</span>
            <strong>
              {data.challenges.daily.filter((item) => Boolean(item.completedAt)).length}
              {' / '}
              {data.challenges.daily.length}
            </strong>
            <small>заданий</small>
          </div>
          <div>
            <span>Неделя</span>
            <strong>
              {data.challenges.weekly.filter((item) => Boolean(item.completedAt)).length}
              {' / '}
              {data.challenges.weekly.length}
            </strong>
            <small>заданий</small>
          </div>
        </div>

        <span className="profile-v5__challenge-link">
          Открыть задания <b aria-hidden="true">→</b>
        </span>
      </Link>

      <section className="profile-v2__stats" aria-label="Статистика просмотра">
        <article className="profile-v2__stat">
          <span className="profile-v2__stat-label">Завершено тайтлов</span>
          <strong>{stats.titles}</strong>
          <small>Полностью просмотрены</small>
        </article>

        <article className="profile-v2__stat">
          <span className="profile-v2__stat-label">Просмотрено серий</span>
          <strong>{stats.episodes}</strong>
          <small>Засчитано после подтверждённого просмотра</small>
        </article>

        <article className="profile-v2__stat">
          <span className="profile-v2__stat-label">Время просмотра</span>
          <strong><WatchTime activeMs={stats.active_ms} /></strong>
          <small>По данным плеера</small>
        </article>

        <article className="profile-v2__stat">
          <span className="profile-v2__stat-label">Комментарии</span>
          <strong>{stats.comments}</strong>
          <small>В обсуждениях серий</small>
        </article>
      </section>

      <section className="profile-v2__status-strip" aria-label="Статусы библиотеки">
        {Object.entries(statusLabels).map(([status, label]) => (
          <div className="profile-v2__status-chip" data-status={status} key={status}>
            <span>{label}</span>
            <strong>{stats[status as keyof typeof statusLabels]}</strong>
          </div>
        ))}
      </section>

      <div className="profile-v2__content">
        <section className="profile-v2__library">
          <div className="profile-v2__section-head">
            <div>
              <span className="profile-v2__eyebrow">Личная коллекция</span>
              <h2>Мои аниме</h2>
              <p>Тайтлы, которые сейчас находятся в твоей библиотеке.</p>
            </div>
            <Link href="/list">Открыть трекер <span aria-hidden="true">→</span></Link>
          </div>

          {data.library.length ? (
            <div className="profile-v2__library-list">
              {data.library.slice(0, 8).map((item) => (
                <Link
                  className="profile-v2__library-row"
                  href={`/anime/${item.anime_id}`}
                  key={item.anime_id}
                >
                  <span className="profile-v2__library-mark" aria-hidden="true">
                    <img src="/brand/brand-mark.png" alt="" />
                  </span>
                  <span className="profile-v2__library-title" title={item.title}>{item.title}</span>
                  <span className="profile-v2__library-status" data-status={item.status}>
                    {statusLabels[item.status]}
                  </span>
                  <span className="profile-v2__library-arrow" aria-hidden="true">→</span>
                </Link>
              ))}

              {data.library.length > 8 && (
                <Link className="profile-v2__library-more" href="/list">
                  Ещё {data.library.length - 8} в трекере
                </Link>
              )}
            </div>
          ) : (
            <div className="profile-v2__library-empty">
              <img
                className="profile-v2__library-empty-art"
                src="/brand/empty-library.png"
                alt=""
                aria-hidden="true"
              />
              <strong>Твоя коллекция пока пуста</strong>
              <p>Найди первое аниме, добавь его в библиотеку и начни собирать историю просмотров.</p>
              <Link href="/search">Найти аниме</Link>
            </div>
          )}
        </section>

        <section className="profile-v2__achievements profile-v3__achievements">
          <div className="profile-v2__section-head">
            <div>
              <span className="profile-v2__eyebrow">Прогресс</span>
              <h2>Достижения</h2>
              <p>{unlockedCount} / {data.achievements.length} открыто</p>
            </div>
            <div className="profile-v3__achievement-actions">
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
              <Link href="/achievements">Все →</Link>
            </div>
          </div>

          {featuredAchievements.length > 0 && (
            <div className="profile-v3__showcase">
              <span className="profile-v2__eyebrow">Витрина профиля</span>
              <div className="profile-v3__showcase-grid">
                {featuredAchievements.map((achievement) => (
                  <article
                    key={achievement.code}
                    data-rarity={achievement.rarity}
                    className="profile-v3__showcase-card"
                  >
                    <img
                      src={achievementIcon(achievement.code, achievement.icon)}
                      alt=""
                      width="44"
                      height="44"
                    />
                    <div>
                      <strong>{achievement.title}</strong>
                      <small>{ACHIEVEMENT_RARITY_LABELS[achievement.rarity]}</small>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          <div className="profile-v2__achievement-list">
            {achievementPreview.map((achievement) => {
              const progress = achievementPercent(stats, achievement);
              const unlocked = Boolean(achievement.earned_at);
              const rarity = achievement.rarity as AchievementRarity;

              return (
                <article
                  className={`profile-v2__achievement ${unlocked ? 'is-unlocked' : ''}`}
                  data-rarity={rarity}
                  key={achievement.code}
                >
                  <img
                    src={achievementIcon(achievement.code, achievement.icon)}
                    alt=""
                    width="52"
                    height="52"
                  />

                  <div className="profile-v2__achievement-copy">
                    <div className="profile-v2__achievement-title">
                      <strong>{achievement.title}</strong>
                      <small>
                        {unlocked
                          ? 'Получено'
                          : `${progress.current} / ${achievement.threshold}`}
                      </small>
                    </div>

                    <p>{achievement.description}</p>

                    <div className="profile-v3__achievement-meta">
                      <span data-rarity={rarity}>{ACHIEVEMENT_RARITY_LABELS[rarity]}</span>
                      <span>+{achievement.xp_reward} XP</span>
                    </div>

                    <div className="profile-v2__achievement-progress" aria-hidden="true">
                      <span style={{ width: `${progress.percent}%` }} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
