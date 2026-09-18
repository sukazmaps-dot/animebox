'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './Leaderboard.module.css';
import UserIdentity from '@/components/identity/UserIdentity';
import type { PublicIdentityRole } from '@/lib/identity';
import type { SponsorStatus } from '@/lib/sponsor';

type Period = 'week' | 'month' | 'all';

type Entry = {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string;
  activeMs: number;
  episodes: number;
  lastWatchedAt: string | null;
  isCurrentUser: boolean;
  sponsor: SponsorStatus | null;
  role: PublicIdentityRole;
};

type Payload = {
  period: Period;
  entries: Entry[];
  me: Entry | null;
};

const periodLabels: Record<Period, string> = {
  week: '7 дней',
  month: '30 дней',
  all: 'Всё время',
};

function formatWatchTime(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (ms > 0 && totalMinutes === 0) return `${Math.max(1, Math.floor(ms / 1000))} сек`;
  if (hours <= 0) return `${minutes} мин`;
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}

function Crown({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 64 56" fill="none" aria-hidden="true"><path d="m8 17 13 10L32 8l11 19 13-10-6 28H14L8 17Z" fill="currentColor" fillOpacity=".16" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="M16 50h32M22 37h20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><circle cx="8" cy="14" r="3" fill="currentColor"/><circle cx="32" cy="5" r="3" fill="currentColor"/><circle cx="56" cy="14" r="3" fill="currentColor"/></svg>;
}

const rankTitles: Record<number, string> = { 1: 'На вершине', 2: 'Серебряный призёр', 3: 'Бронзовый призёр' };

function Avatar({ entry, className = '' }: { entry: Entry; className?: string }) {
  const [failed, setFailed] = useState(false);
  return entry.avatarUrl && !failed
    ? <img className={className} src={entry.avatarUrl} alt="" onError={() => setFailed(true)} />
    : <span aria-hidden="true" className={`${styles.avatarFallback} ${className}`}>{entry.username.slice(0, 1).toUpperCase() || '?'}</span>;
}

export default function LeaderboardClient() {
  const [period, setPeriod] = useState<Period>('week');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    fetch(`/api/community/leaderboard?period=${period}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Не удалось загрузить рейтинг.');
        return body as Payload;
      })
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((requestError) => {
        if (active && requestError?.name !== 'AbortError') {
          setError(requestError instanceof Error ? requestError.message : 'Ошибка рейтинга.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [period]);

  const topThree = useMemo(() => data?.entries.slice(0, 3) ?? [], [data]);
  const rest = useMemo(() => data?.entries.slice(3) ?? [], [data]);
  const thirdPlace = topThree.find((entry) => entry.rank === 3);
  const me = data?.me;
  const gap = me && thirdPlace && me.rank > 3 ? Math.max(0, thirdPlace.activeMs - me.activeMs) : null;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroEmblem}><img src="/ui/animebox-rank-1.webp" alt="" aria-hidden="true" /></div>
        <span className={styles.eyebrow}><span /> ANIMEBOX · HALL OF FAME</span>
        <h1>Твоя история.<br /><em>Твоё место в топе.</em></h1>
        <p>Любимые истории становятся частью твоей. Знакомься с теми, кто смотрит вместе с тобой — и найди своё место среди них.</p>
        <div className={styles.heroMeta}><span>ТОП 100</span><span>По времени просмотра</span></div>

        <div className={styles.modeSwitch} aria-label="Тип рейтинга">
          <span aria-current="page">Просмотры</span>
          <Link href="/supporters">Спонсоры</Link>
        </div>

        <div className={styles.tabs} role="group" aria-label="Период рейтинга">
          {(Object.keys(periodLabels) as Period[]).map((item) => (
            <button
              type="button"
              aria-pressed={period === item}
              className={period === item ? styles.activeTab : ''}
              key={item}
              onClick={() => {
                if (item === period) return;
                setLoading(true);
                setError('');
                setPeriod(item);
              }}
            >
              {periodLabels[item]}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <section className={styles.state} role="alert">
          <strong>Рейтинг временно недоступен</strong>
          <span>{error}</span>
        </section>
      ) : loading ? (
        <section className={styles.state} role="status">Собираем зал славы…</section>
      ) : data && data.entries.length === 0 ? (
        <section className={styles.state}>
          <strong>Пока никто не попал в рейтинг</strong>
          <span>Первое подтверждённое время просмотра появится здесь автоматически.</span>
        </section>
      ) : data ? (
        <>
          <div className={styles.sectionHeading}>
            <div><span className={styles.eyebrow}>ЛУЧШИЕ ИЗ ЛУЧШИХ</span><h2>Пьедестал AnimeBox</h2></div>
            <span className={styles.periodBadge}>{periodLabels[period]}</span>
          </div>
          <section className={styles.podium} aria-label="Топ-3">
            {topThree.map((entry) => (
              <Link
                href={`/profile/${entry.userId}`}
                className={`${styles.podiumCard} ${entry.isCurrentUser ? styles.current : ''}`}
                data-rank={entry.rank}
                key={entry.userId}
                aria-label={`${entry.rank} место: ${entry.username}, ${formatWatchTime(entry.activeMs)}`}
              >
                <span className={styles.cardTexture} aria-hidden="true" />
                <img
                  className={styles.rankArtwork}
                  src={`/ui/animebox-rank-${entry.rank}.webp`}
                  alt=""
                  aria-hidden="true"
                />
                <span className={styles.placeLabel}>{entry.rank === 1 ? 'ЛИДЕР РЕЙТИНГА' : `${String(entry.rank).padStart(2, '0')} / ПРИЗОВОЕ МЕСТО`}</span>
                <div className={styles.avatarStage}>
                  {entry.rank === 1 && <Crown className={styles.crown} />}
                  <div className={styles.avatarRing}><Avatar entry={entry} /></div>
                  <span className={styles.rankSeal}>{entry.rank}</span>
                </div>
                <span className={styles.rankTitle}>{rankTitles[entry.rank]}</span>
                <div className={styles.nameLine}>
                  <UserIdentity
                    username={entry.username}
                    role={entry.role}
                    sponsor={entry.sponsor}
                    compact
                    nameClassName={styles.podiumName}
                  />
                </div>
                {entry.isCurrentUser && <span className={styles.youBadge}>Это ты</span>}
                <span className={styles.time}>{formatWatchTime(entry.activeMs)}</span>
                <span className={styles.timeLabel}>подтверждённого просмотра</span>
                <div className={styles.cardFooter}><span>{entry.episodes} эп. в зачёте</span><span>Профиль ↗</span></div>
              </Link>
            ))}
          </section>

          <section className={styles.personal} aria-label="Твоё место в рейтинге">
            <div className={styles.personalIcon}><Crown /></div>
            <div className={styles.personalText}>
              <span className={styles.eyebrow}>{me ? 'ТВОЯ ПОЗИЦИЯ' : 'ТВОЯ ИСТОРИЯ ВПЕРЕДИ'}</span>
              <h2>{me ? (me.rank <= 3 ? 'Ты уже на пьедестале' : `Твоё место — #${me.rank}`) : 'Здесь может быть твоё имя'}</h2>
              <p>{me ? `${formatWatchTime(me.activeMs)} просмотра за выбранный период` : 'Смотри любимые аниме в AnimeBox — подтверждённое время учитывается в рейтинге автоматически.'}</p>
              {gap !== null && <p className={styles.gap}>Разрыв с третьим местом: {gap === 0 ? 'одинаковое время' : formatWatchTime(gap)}. Рейтинг меняется вместе с активностью участников.</p>}
            </div>
            <Link className={styles.personalAction} href={me ? `/profile/${me.userId}` : '/search'}>{me ? 'Мой профиль' : 'Выбрать аниме'} <span aria-hidden="true">↗</span></Link>
          </section>

          {rest.length > 0 && <div className={styles.sectionHeading}><h2>В одном ряду с лучшими</h2><span className={styles.periodBadge}>#{rest[0].rank} — #{rest[rest.length - 1].rank}</span></div>}
          {rest.length > 0 && (
          <section className={styles.board} aria-label="Топ-100 AnimeBox">
            <div className={styles.boardHeader}>
              <span>Место</span>
              <span>Пользователь</span>
              <span>Серии</span>
              <span>Время</span>
            </div>

            {rest.map((entry) => (
              <Link
                href={`/profile/${entry.userId}`}
                className={`${styles.row} ${entry.isCurrentUser ? styles.current : ''}`}
                key={entry.userId}
              >
                <strong className={styles.rank}>#{entry.rank}</strong>
                <span className={styles.user}>
                  <Avatar entry={entry} />
                  <span>
                    <span className={styles.rowNameLine}>
                      <UserIdentity
                        username={entry.username}
                        role={entry.role}
                        sponsor={entry.sponsor}
                        compact
                      />
                    </span>
                    {entry.isCurrentUser && <small>Это ты</small>}
                  </span>
                </span>
                <span className={styles.episodes}>{entry.episodes}</span>
                <strong className={styles.rowTime}>{formatWatchTime(entry.activeMs)}</strong>
              </Link>
            ))}
          </section>

          )}

          <p className={styles.note}>
            Честный рейтинг: учитывается подтверждённое время просмотра в плеере.
            Ручные отметки не добавляют время. Вклад каждого эпизода за выбранный период
            ограничен его длительностью.
          </p>
        </>
      ) : null}
    </main>
  );
}
