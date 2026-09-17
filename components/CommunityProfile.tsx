'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { achievementIcon } from '@/lib/achievement-icons';

import {
  communityRequest,
  statusLabels,
  type CommunityProfile as ProfileData,
} from '@/lib/community-client';

function WatchTime({ activeMs }: { activeMs: number }) {
  const totalSeconds = Math.max(0, Math.floor(activeMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return (
      <>
        {hours}<em>ч</em> {minutes}<em>м</em>
      </>
    );
  }

  if (minutes > 0) {
    return (
      <>
        {minutes}<em>м</em> {seconds}<em>с</em>
      </>
    );
  }

  return (
    <>
      {seconds}<em>с</em>
    </>
  );
}

export default function CommunityProfile() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      setError('');
      setData(await communityRequest<ProfileData>('profile'));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Ошибка профиля.');
    }
  }

  useEffect(() => {
    let active = true;

    communityRequest<ProfileData>('profile')
      .then((profile) => {
        if (active) setData(profile);
      })
      .catch((error) => {
        if (active) {
          setError(error instanceof Error ? error.message : 'Ошибка профиля.');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <section className="profile-v2__community-error" role="alert">
        <span>{error}</span>
        <button type="button" onClick={() => void load()}>
          Повторить
        </button>
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

  const { stats } = data;

  return (
    <>
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
          <strong>
            <WatchTime activeMs={stats.active_ms} />
          </strong>
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

            <Link href="/list">
              Открыть трекер <span aria-hidden="true">→</span>
            </Link>
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

                  <span className="profile-v2__library-title" title={item.title}>
                    {item.title}
                  </span>

                  <span
                    className="profile-v2__library-status"
                    data-status={item.status}
                  >
                    {statusLabels[item.status]}
                  </span>

                  <span className="profile-v2__library-arrow" aria-hidden="true">
                    →
                  </span>
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
              <p>
                Найди первое аниме, добавь его в библиотеку и начни собирать
                историю просмотров.
              </p>
              <Link href="/search">Найти аниме</Link>
            </div>
          )}
        </section>

        <section className="profile-v2__achievements">
          <div className="profile-v2__section-head">
            <div>
              <span className="profile-v2__eyebrow">Прогресс</span>
              <h2>Достижения</h2>
              <p>Небольшие отметки твоего пути в AnimeBox.</p>
            </div>
          </div>

          <div className="profile-v2__achievement-list">
            {data.achievements.map((achievement) => {
              const current = Math.min(
                stats[achievement.metric],
                achievement.threshold,
              );
              const progress = Math.round(
                (current / achievement.threshold) * 100,
              );
              const unlocked = Boolean(achievement.earned_at);

              return (
                <article
                  className={`profile-v2__achievement ${
                    unlocked ? 'is-unlocked' : ''
                  }`}
                  key={achievement.code}
                >
                  <img src={achievementIcon(achievement.code, achievement.icon)} alt="" width="52" height="52" />

                  <div className="profile-v2__achievement-copy">
                    <div className="profile-v2__achievement-title">
                      <strong>{achievement.title}</strong>
                      <small>
                        {unlocked
                          ? 'Получено'
                          : `${current} / ${achievement.threshold}`}
                      </small>
                    </div>

                    <p>{achievement.description}</p>

                    <div
                      className="profile-v2__achievement-progress"
                      aria-hidden="true"
                    >
                      <span style={{ width: `${unlocked ? 100 : progress}%` }} />
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
