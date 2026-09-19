'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import AnimeBoxStar from '@/components/monetization/AnimeBoxStar';
import SponsorBadge from '@/components/monetization/SponsorBadge';
import UserAvatarWithFrame from '@/components/profile/UserAvatarWithFrame';
import UserIdentity from '@/components/identity/UserIdentity';
import type { PublicIdentityRole } from '@/lib/identity';
import type { SponsorStatus, SponsorTier } from '@/lib/sponsor';
import { premiumMediaStyle, type PremiumMediaTransform } from '@/lib/premium-studio';

import styles from './SponsorLeaderboard.module.css';

type Period = 'week' | 'month' | 'all';

type Entry = {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string;
  avatarTransform: PremiumMediaTransform;
  periodStars: number;
  totalStars: number;
  showStarAmount: boolean;
  sponsor: SponsorStatus | null;
  role: PublicIdentityRole;
  isCurrentUser: boolean;
};

type Recent = {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string;
  avatarTransform: PremiumMediaTransform;
  amount: number;
  showStarAmount: boolean;
  createdAt: string;
};

type Me = {
  userId: string;
  visible: boolean;
  rank: number | null;
  periodStars: number;
  totalStars: number;
  tier: SponsorTier | null;
  gapToNext: number | null;
  nextRank: number | null;
};

type Payload = {
  period: Period;
  entries: Entry[];
  me: Me | null;
  recent: Recent[];
  stats: {
    publicStars: number;
    supporters: number;
  };
};

const PERIOD_LABELS: Record<Period, string> = {
  week: '7 дней',
  month: '30 дней',
  all: 'Всё время',
};

const RANK_TITLES: Record<number, string> = {
  1: 'Главный supporter',
  2: 'Серебряный supporter',
  3: 'Бронзовый supporter',
};

function relativeDate(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн назад`;
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function StarsValue({ value, hidden = false, large = false }: { value: number; hidden?: boolean; large?: boolean }) {
  if (hidden) return <span className={styles.hiddenAmount}>Сумма скрыта</span>;
  return (
    <span className={large ? styles.bigStars : styles.starsValue}>
      {value.toLocaleString('ru-RU')} <AnimeBoxStar size={large ? 28 : 18} />
    </span>
  );
}

export default function SponsorLeaderboard() {
  const [period, setPeriod] = useState<Period>('all');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch(`/api/monetization/sponsor/leaderboard?period=${period}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить рейтинг спонсоров.');
        return payload as Payload;
      })
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((requestError) => {
        if (active && requestError?.name !== 'AbortError') {
          setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить рейтинг.');
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

  return (
    <main className={`${styles.page} sponsor-leaderboard-page`}>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <span className={styles.eyebrow}>ANIMEBOX · SUPPORTERS HALL</span>
        <h1>Те, кто помогает<br /><em>AnimeBox расти.</em></h1>
        <p>Рейтинг открытых спонсоров. Здесь видны только пользователи, которые сами включили публикацию на стене поддержки.</p>

        <div className={styles.modeSwitch} aria-label="Тип рейтинга">
          <Link href="/leaderboard">Просмотры</Link>
          <span aria-current="page">Спонсоры</span>
        </div>

        <div className={styles.heroStats}>
          <div>
            <small>Поддержка за период</small>
            <strong><StarsValue value={data?.stats.publicStars ?? 0} large /></strong>
            <span>{PERIOD_LABELS[period].toLowerCase()}</span>
          </div>
          <div>
            <small>Открытых спонсоров</small>
            <strong>{data?.stats.supporters ?? 0}</strong>
            <span>участвуют в стене</span>
          </div>
          <div>
            <small>Приватность стены</small>
            <strong>100%</strong>
            <span>только по желанию пользователя</span>
          </div>
        </div>

        <div className={styles.heroControls}>
          <div className={styles.tabs} role="group" aria-label="Период рейтинга спонсоров">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((item) => (
              <button
                type="button"
                aria-pressed={period === item}
                className={period === item ? styles.activeTab : ''}
                key={item}
                onClick={() => {
                  if (item === period) return;
                  setLoading(true);
                  setError('');
                  setData(null);
                  setPeriod(item);
                }}
              >
                {PERIOD_LABELS[item]}
              </button>
            ))}
          </div>

          <div className={styles.utilityBar}>
            <Link className={styles.primaryAction} href="/support">Поддержать AnimeBox <span aria-hidden="true">✦</span></Link>
            <Link href="/settings/sponsor">Настроить видимость</Link>
          </div>
        </div>
      </section>

      {error ? (
        <section className={styles.state} role="alert"><strong>Рейтинг временно недоступен</strong><span>{error}</span></section>
      ) : loading && !data ? (
        <section className={styles.state} role="status">Собираем стену спонсоров…</section>
      ) : data && data.entries.length === 0 ? (
        <section className={styles.emptyState}>
          <div className={styles.emptyVisual} aria-hidden="true">
            <span className={styles.emptyOrb} />
            <AnimeBoxStar size={42} className={styles.emptyStar} />
          </div>
          <span className={styles.eyebrow}>SUPPORTERS HALL</span>
          <h2>{period === 'all' ? 'Пьедестал пока свободен' : `За ${PERIOD_LABELS[period].toLowerCase()} открытых поддержек пока нет`}</h2>
          <p>Стена заполняется только теми, кто сам включил публичное отображение. Поддержка уже может быть учтена, даже если пользователь предпочёл остаться скрытым.</p>
          <div className={styles.emptyActions}>
            <Link className={styles.primaryAction} href="/support">Поддержать AnimeBox <span aria-hidden="true">✦</span></Link>
            <Link href="/settings/sponsor">Настроить своё отображение</Link>
          </div>
          <small>Никаких автоматических публикаций: участие в рейтинге всегда добровольное.</small>
        </section>
      ) : data ? (
        <>
          <div className={styles.sectionHeading}>
            <div><span className={styles.eyebrow}>TOP SUPPORTERS</span><h2>Пьедестал поддержки</h2></div>
            <span className={styles.periodBadge}>{PERIOD_LABELS[period]}</span>
          </div>

          <section className={styles.podium} aria-label="Топ-3 спонсоров">
            {topThree.map((entry) => (
              <Link
                href={`/profile/${entry.userId}`}
                className={`${styles.podiumCard} ${entry.isCurrentUser ? styles.current : ''}`}
                data-rank={entry.rank}
                key={entry.userId}
              >
                <span className={styles.podiumTexture} aria-hidden="true" />
                <img className={styles.rankArt} src={`/ui/animebox-rank-${entry.rank}.webp`} alt="" aria-hidden="true" />
                <span className={styles.placeLabel}>{entry.rank === 1 ? 'ГЛАВНЫЙ СПОНСОР' : `#${entry.rank} · ПРИЗОВОЕ МЕСТО`}</span>
                <div className={styles.podiumAvatar}>
                  <UserAvatarWithFrame
                    src={entry.avatarUrl}
                    alt={`Аватар ${entry.username}`}
                    role={entry.role}
                    sponsor={entry.sponsor}
                    className={styles.avatarFrame}
                    mediaTransform={entry.avatarTransform}
                  />
                  <span className={styles.rankSeal}>{entry.rank}</span>
                </div>
                <span className={styles.rankTitle}>{RANK_TITLES[entry.rank]}</span>
                <UserIdentity username={entry.username} role={entry.role} sponsor={entry.sponsor} compact className={styles.identity} nameClassName={styles.podiumName} />
                {entry.sponsor?.tier && <SponsorBadge tier={entry.sponsor.tier} compact />}
                {entry.isCurrentUser && <span className={styles.youBadge}>Это ты</span>}
                <StarsValue value={entry.periodStars} hidden={!entry.showStarAmount} large />
                <span className={styles.periodCaption}>за {PERIOD_LABELS[period].toLowerCase()}</span>
                {period !== 'all' && entry.showStarAmount && <small className={styles.allTime}>Всего: {entry.totalStars.toLocaleString('ru-RU')} ★</small>}
              </Link>
            ))}
          </section>

          <section className={styles.personal} aria-label="Твоё место среди спонсоров">
            <div className={styles.personalIcon}><AnimeBoxStar size={32} /></div>
            <div className={styles.personalCopy}>
              <span className={styles.eyebrow}>ТВОЙ ВКЛАД</span>
              {!data.me ? (
                <><h2>Поддержка начинается с первой звезды</h2><p>После достижения уровня спонсора ты сможешь включить отображение на этой стене.</p></>
              ) : !data.me.visible ? (
                <><h2>Ты спонсор, но скрыт со стены</h2><p>Твой вклад учтён. Если захочешь участвовать в рейтинге, включи публикацию в настройках спонсора.</p></>
              ) : data.me.rank ? (
                <>
                  <h2>{data.me.rank === 1 ? 'Ты сейчас на первом месте' : `Твоё место — #${data.me.rank}`}</h2>
                  <p>{data.me.periodStars.toLocaleString('ru-RU')} ★ за выбранный период · {data.me.totalStars.toLocaleString('ru-RU')} ★ за всё время.</p>
                  {data.me.gapToNext !== null && data.me.nextRank !== null && (
                    <p className={styles.gap}>До #{data.me.nextRank}: {data.me.gapToNext === 0 ? 'одинаковая сумма' : `${data.me.gapToNext.toLocaleString('ru-RU')} ★`}.</p>
                  )}
                </>
              ) : (
                <><h2>Ты в рейтинге, но пока без поддержки за этот период</h2><p>Переключи период на «Всё время» или поддержи AnimeBox снова.</p></>
              )}
            </div>
            <Link className={styles.personalAction} href={data.me?.visible ? '/settings/sponsor' : data.me ? '/settings/sponsor' : '/support'}>
              {data.me ? 'Настройки' : 'Поддержать'} <span aria-hidden="true">↗</span>
            </Link>
          </section>

          {rest.length > 0 && (
            <>
              <div className={styles.sectionHeading}><h2>Все открытые спонсоры</h2><span className={styles.periodBadge}>#{rest[0].rank} — #{rest[rest.length - 1].rank}</span></div>
              <section className={styles.board} aria-label="Рейтинг спонсоров AnimeBox">
                <div className={styles.boardHeader}><span>Место</span><span>Спонсор</span><span>Уровень</span><span>Вклад</span></div>
                {rest.map((entry) => (
                  <Link href={`/profile/${entry.userId}`} className={`${styles.row} ${entry.isCurrentUser ? styles.current : ''}`} key={entry.userId}>
                    <strong className={styles.rowRank}>#{entry.rank}</strong>
                    <span className={styles.userCell}>
                      <UserAvatarWithFrame src={entry.avatarUrl} alt="" role={entry.role} sponsor={entry.sponsor} className={styles.rowAvatar} mediaTransform={entry.avatarTransform} />
                      <span>
                        <UserIdentity username={entry.username} role={entry.role} sponsor={entry.sponsor} compact />
                        {entry.isCurrentUser && <small>Это ты</small>}
                      </span>
                    </span>
                    <span>{entry.sponsor?.tier ? <SponsorBadge tier={entry.sponsor.tier} compact /> : '—'}</span>
                    <strong className={styles.rowStars}><StarsValue value={entry.periodStars} hidden={!entry.showStarAmount} /></strong>
                  </Link>
                ))}
              </section>
            </>
          )}

          {data.recent.length > 0 && (
            <section className={styles.recentSection}>
              <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>LIVE SUPPORT</span><h2>Последние поддержки</h2></div></div>
              <div className={styles.recentGrid}>
                {data.recent.map((item) => (
                  <Link href={`/profile/${item.userId}`} className={styles.recentCard} key={item.id}>
                    <img src={item.avatarUrl} alt="" style={premiumMediaStyle(item.avatarTransform)} />
                    <span><strong>{item.username}</strong><small>{relativeDate(item.createdAt)}</small></span>
                    <b>{item.showStarAmount ? <>{item.amount.toLocaleString('ru-RU')} <AnimeBoxStar size={17} /></> : 'Поддержал проект'}</b>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <p className={styles.note}>В рейтинг попадают только спонсоры, которые добровольно включили отображение на стене. Возвращённые платежи не учитываются. Для периодов 7 и 30 дней считаются подтверждённые Stars и активные ручные корректировки за соответствующий срок.</p>
        </>
      ) : null}
    </main>
  );
}
