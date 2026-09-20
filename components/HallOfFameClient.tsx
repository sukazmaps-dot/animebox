'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { premiumMediaStyle, type PremiumMediaTransform } from '@/lib/premium-studio';
import type { ProfileProgression } from '@/lib/progression';
import { formatSeasonRange } from '@/lib/seasons';

import styles from './HallOfFame.module.css';

type Period = 'week' | 'month';

type Entry = {
  userId: string;
  place: number;
  activeMs: number;
  episodes: number;
  username: string;
  avatarUrl: string;
  avatarTransform: PremiumMediaTransform;
  progression: ProfileProgression;
};

type Season = {
  id: string;
  periodType: Period;
  periodKey: string;
  startsAt: string;
  endsAt: string;
  finalizedAt: string;
  entries: Entry[];
};

function formatWatchTime(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours <= 0) return `${rest} мин`;
  if (rest === 0) return `${hours} ч`;
  return `${hours} ч ${rest} мин`;
}

export default function HallOfFameClient() {
  const [period, setPeriod] = useState<Period>('week');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    fetch(`/api/community/hall-of-fame?period=${period}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить зал славы.');
        return payload as { seasons?: Season[] };
      })
      .then((payload) => setSeasons(Array.isArray(payload.seasons) ? payload.seasons : []))
      .catch((requestError) => {
        if (requestError?.name !== 'AbortError') {
          setError(requestError instanceof Error ? requestError.message : 'Ошибка загрузки.');
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [period]);

  const totalWinners = useMemo(
    () => new Set(seasons.flatMap((season) => season.entries.slice(0, 3).map((entry) => entry.userId))).size,
    [seasons],
  );

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>ANIMEBOX · HALL OF FAME</span>
          <h1>Зал славы</h1>
          <p>
            Итоги завершённых сезонов сохраняются навсегда. Новая неделя и новый месяц дают каждому шанс войти в историю AnimeBox.
          </p>
        </div>

        <div className={styles.heroStats}>
          <div><strong>{seasons.length}</strong><span>сезонов</span></div>
          <div><strong>{totalWinners}</strong><span>призёров</span></div>
        </div>
      </section>

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <button type="button" className={period === 'week' ? styles.active : ''} onClick={() => setPeriod('week')}>
            Недели
          </button>
          <button type="button" className={period === 'month' ? styles.active : ''} onClick={() => setPeriod('month')}>
            Месяцы
          </button>
        </div>

        <Link href="/leaderboard">Текущий рейтинг →</Link>
      </div>

      {loading ? (
        <section className={styles.state}>Загружаем историю сезонов…</section>
      ) : error ? (
        <section className={styles.state} role="alert">{error}</section>
      ) : seasons.length === 0 ? (
        <section className={styles.state}>
          <strong>Первый сезон ещё формируется</strong>
          <span>
            Когда текущий {period === 'week' ? 'недельный' : 'месячный'} сезон завершится, Top-10 появится здесь автоматически.
          </span>
          <Link href="/leaderboard">Смотреть текущий рейтинг</Link>
        </section>
      ) : (
        <div className={styles.seasons}>
          {seasons.map((season) => {
            const podium = season.entries.slice(0, 3);
            const rest = season.entries.slice(3);

            return (
              <section className={styles.season} key={season.id}>
                <header className={styles.seasonHead}>
                  <div>
                    <span>{season.periodType === 'week' ? 'НЕДЕЛЬНЫЙ СЕЗОН' : 'МЕСЯЧНЫЙ СЕЗОН'}</span>
                    <h2>{formatSeasonRange(season.startsAt, season.endsAt)}</h2>
                  </div>
                  <small>Top {season.entries.length}</small>
                </header>

                <div className={styles.podium}>
                  {podium.map((entry) => (
                    <Link
                      href={`/profile/${entry.userId}`}
                      className={styles.podiumCard}
                      data-place={entry.place}
                      key={entry.userId}
                    >
                      <span className={styles.place}>#{entry.place}</span>
                      <div className={styles.avatar}>
                        <img src={entry.avatarUrl} alt="" style={premiumMediaStyle(entry.avatarTransform)} />
                      </div>
                      <strong>{entry.username}</strong>
                      <small>LV.{entry.progression.level} · {entry.progression.rank}</small>
                      <b>{formatWatchTime(entry.activeMs)}</b>
                      <span>{entry.episodes} эп. в зачёте</span>
                    </Link>
                  ))}
                </div>

                {rest.length > 0 && (
                  <div className={styles.rest}>
                    {rest.map((entry) => (
                      <Link href={`/profile/${entry.userId}`} className={styles.row} key={entry.userId}>
                        <b>#{entry.place}</b>
                        <span>{entry.username}</span>
                        <small>LV.{entry.progression.level}</small>
                        <strong>{formatWatchTime(entry.activeMs)}</strong>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
