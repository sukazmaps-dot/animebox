'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import styles from './Leaderboard.module.css';
import UserIdentity from '@/components/identity/UserIdentity';
import ProfilePreview from '@/components/profile/ProfilePreview';
import type { PublicIdentityRole } from '@/lib/identity';
import type { SponsorStatus } from '@/lib/sponsor';
import { premiumMediaStyle, type PremiumMediaTransform } from '@/lib/premium-studio';
import Icon from '@/components/Icon';
import type { ProfileProgression } from '@/lib/progression';

type Period = 'week' | 'month' | 'all';

type Entry = {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string;
  avatarTransform: PremiumMediaTransform;
  activeMs: number;
  completedEpisodes: number;
  lastWatchedAt: string | null;
  isCurrentUser: boolean;
  sponsor: SponsorStatus | null;
  role: PublicIdentityRole;
  progression: ProfileProgression;
};

type Payload = {
  period: Period;
  entries: Entry[];
  me: Entry | null;
};

const periodLabels: Record<Period, string> = {
  week: 'Неделя',
  month: 'Месяц',
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

function Avatar({ entry, className = '' }: { entry: Entry; className?: string }) {
  const [failed, setFailed] = useState(false);
  return entry.avatarUrl && !failed
    ? <img className={className} src={entry.avatarUrl} alt="" style={premiumMediaStyle(entry.avatarTransform)} onError={() => setFailed(true)} />
    : <span aria-hidden="true" className={`${styles.avatarFallback} ${className}`}>{entry.username.slice(0, 1).toUpperCase() || '?'}</span>;
}

export default function LeaderboardClient() {
  const reduceMotion = useReducedMotion();
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
        <div className={styles.heroAura} aria-hidden="true" />
        <div className={styles.heroEmblem} aria-hidden="true"><Icon name="trophy" size={90} weight="regular" /></div>

        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><span /> AnimeBox · Рейтинг</span>
          <h1>Твоё место в топе.</h1>
          <p>Сравни время просмотра с другими зрителями AnimeBox.</p>
          <div className={styles.heroMeta}><span>Топ-100</span><span>По подтверждённому времени просмотра</span></div>
        </div>

        <div className={styles.heroStatus} aria-label="Твоя статистика рейтинга">
          {me ? (
            <>
              <div><span>ТВОЯ ПОЗИЦИЯ</span><strong>#{me.rank}</strong></div>
              <div><span>ПРОСМОТР</span><strong>{formatWatchTime(me.activeMs)}</strong></div>
              <div><span>ЗАВЕРШЕНО</span><strong>{me.completedEpisodes} эп.</strong></div>
            </>
          ) : (
            <div className={styles.heroStatusEmpty}>
              <span>ТВОЯ ПОЗИЦИЯ</span>
              <strong>—</strong>
              <small>Начни смотреть — место появится здесь</small>
            </div>
          )}
        </div>

        <div className={styles.heroControls}>
          <div className={styles.modeSwitch} aria-label="Тип рейтинга">
            <span aria-current="page"><i aria-hidden="true" />Просмотры</span>
            <Link href="/supporters">Спонсоры</Link>
            <Link href="/hall-of-fame">Зал славы</Link>
          </div>

          <div className={styles.tabs} role="group" aria-label="Период рейтинга">
            {(Object.keys(periodLabels) as Period[]).map((item) => {
              const selected = period === item;
              return (
                <button
                  type="button"
                  aria-pressed={selected}
                  className={selected ? styles.activeTab : ''}
                  key={item}
                  onClick={() => {
                    if (item === period) return;
                    setLoading(true);
                    setError('');
                    setPeriod(item);
                  }}
                >
                  {selected && (
                    <motion.span
                      layoutId="leaderboard-period-active"
                      className={styles.tabIndicator}
                      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                      aria-hidden="true"
                    />
                  )}
                  <span className={styles.tabLabel}>{periodLabels[item]}</span>
                </button>
              );
            })}
          </div>
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
            <div><span className={styles.eyebrow}>Пьедестал</span><h2>Пьедестал AnimeBox</h2></div>
            <span className={styles.periodBadge}>{periodLabels[period]}</span>
          </div>
          <section className={styles.podium} aria-label="Топ-3">
            {topThree.map((entry) => (
              <article
                className={`${styles.podiumCard} ${entry.isCurrentUser ? styles.current : ''}`}
                data-rank={entry.rank}
                key={entry.userId}
                aria-label={`${entry.rank} место: ${entry.username}, ${formatWatchTime(entry.activeMs)}`}
              >
                <span className={styles.cardTexture} aria-hidden="true" />
                <span className={styles.placeLabel}>{entry.rank === 1 ? 'ЛИДЕР РЕЙТИНГА' : `${entry.rank} / ПРИЗОВОЕ МЕСТО`}</span>
                <ProfilePreview
                  userId={entry.userId}
                  username={entry.username}
                  className={styles.profilePreviewTrigger}
                >
                  <span className={styles.avatarStage}>
                    {entry.rank === 1 && (
                      <motion.span
                        className={styles.crownFloat}
                        animate={reduceMotion ? undefined : { y: [0, -3, 0], rotate: [-2, 2, -2] }}
                        transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                        aria-hidden="true"
                      >
                        <Icon name="crown" className={styles.crown} size={38} weight="fill" />
                      </motion.span>
                    )}
                    <span className={styles.avatarRing}>
                      <span className={styles.avatarClip}>
                        <Avatar entry={entry} />
                      </span>
                    </span>
                    <span className={styles.rankSeal}>{entry.rank}</span>
                  </span>
                </ProfilePreview>
                <ProfilePreview
                  userId={entry.userId}
                  username={entry.username}
                  className={`${styles.nameLine} ${styles.profilePreviewName}`}
                >
                  <UserIdentity
                    username={entry.username}
                    role={entry.role}
                    sponsor={entry.sponsor}
                    compact
                    nameClassName={styles.podiumName}
                  />
                </ProfilePreview>
                <span className={styles.levelBadge}>LV.{entry.progression.level} · {entry.progression.rank}</span>
                {entry.isCurrentUser && <span className={styles.youBadge}>Это ты</span>}
                <span className={styles.time}>{formatWatchTime(entry.activeMs)}</span>
                <span className={styles.timeLabel}>подтверждённого просмотра</span>
                <div className={styles.cardFooter}>
                  <span>{entry.completedEpisodes} эп. завершено</span>
                  <Link className={styles.cardProfileAction} href={`/profile/${entry.userId}`}>Профиль <span aria-hidden="true">↗</span></Link>
                </div>
              </article>
            ))}
          </section>

          <section className={styles.personal} aria-label="Твоё место в рейтинге">
            <div className={styles.personalIcon}>
              {me ? <strong>#{me.rank}</strong> : <Icon name="crown" size={26} weight="regular" />}
            </div>
            <div className={styles.personalText}>
              <span className={styles.eyebrow}>{me ? 'Твоя позиция' : 'Твоё место в рейтинге'}</span>
              <h2>{me ? (me.rank <= 3 ? 'Ты уже на пьедестале' : 'Держишь место в рейтинге') : 'Здесь может быть твоё имя'}</h2>
              {gap !== null && <p className={styles.gap}>До третьего места: {gap === 0 ? 'одинаковое время' : formatWatchTime(gap)}</p>}
            </div>
            {me && (
              <div className={styles.personalStats} aria-label="Твоя статистика">
                <span><small>Время</small><strong>{formatWatchTime(me.activeMs)}</strong></span>
                <span><small>Серии</small><strong>{me.completedEpisodes}</strong></span>
                <span><small>Уровень</small><strong>LV.{me.progression.level}</strong></span>
              </div>
            )}
            <Link className={styles.personalAction} href={me ? `/profile/${me.userId}` : '/search'}>{me ? 'Профиль' : 'Выбрать аниме'} <span aria-hidden="true">↗</span></Link>
          </section>

          {rest.length > 0 && <div className={styles.sectionHeading}><h2>В одном ряду с лучшими</h2><span className={styles.periodBadge}>#{rest[0].rank} — #{rest[rest.length - 1].rank}</span></div>}
          {rest.length > 0 && (
          <section className={styles.board} aria-label="Топ-100 AnimeBox">
            <div className={styles.boardHeader}>
              <span>Место</span>
              <span>Пользователь</span>
              <span>Завершено</span>
              <span>Время</span>
              <span aria-hidden="true" />
            </div>

            {rest.map((entry) => (
              <div
                className={`${styles.row} ${entry.isCurrentUser ? styles.current : ''}`}
                key={entry.userId}
              >
                <strong className={styles.rank}>#{entry.rank}</strong>
                <ProfilePreview
                  userId={entry.userId}
                  username={entry.username}
                  className={`${styles.user} ${styles.profilePreviewRow}`}
                >
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
                    <small>
                      {entry.isCurrentUser ? 'Это ты · ' : ''}
                      LV.{entry.progression.level} · {entry.progression.rank}
                    </small>
                  </span>
                </ProfilePreview>
                <span className={styles.episodes}>{entry.completedEpisodes}</span>
                <strong className={styles.rowTime}>{formatWatchTime(entry.activeMs)}</strong>
                <Link className={styles.rowOpen} href={`/profile/${entry.userId}`} aria-label={`Открыть профиль ${entry.username}`}>↗</Link>
              </div>
            ))}
          </section>

          )}

          <p className={styles.note}>
            Честный рейтинг: учитывается подтверждённое время просмотра в плеере, а завершённой серия считается после ≥90% доступного просмотра.
            Недельный и месячный сезоны начинаются заново в календарных границах UTC.
            Ручные отметки не добавляют время, а завершённые сезоны сохраняются в Зале славы.
          </p>
        </>
      ) : null}
    </main>
  );
}
