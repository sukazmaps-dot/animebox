'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { useAuthState } from '@/components/AuthStateProvider';
import StreakDisplay from '@/components/profile/StreakDisplay';
import {
  challengeMetricLabel,
  challengePercent,
  normalizeChallengeSnapshot,
  type ChallengeItem,
  type ChallengeSnapshot,
} from '@/lib/challenges';

import styles from './Challenges.module.css';

function ChallengeCard({ item }: { item: ChallengeItem }) {
  const completed = Boolean(item.completedAt);
  const percent = challengePercent(item);

  return (
    <article className={styles.card} data-complete={completed ? 'true' : 'false'}>
      <div className={styles.cardTop}>
        <span>{completed ? 'ГОТОВО' : 'В ПРОЦЕССЕ'}</span>
        <strong>+{item.xpReward} XP</strong>
      </div>

      <h2>{item.title}</h2>
      <p>{item.description}</p>

      <div className={styles.progress}>
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className={styles.progressMeta}>
        <span>
          {Math.min(item.progress, item.goal)} / {item.goal} {challengeMetricLabel(item.metric)}
        </span>
        <b>{percent}%</b>
      </div>
    </article>
  );
}

export default function ChallengesClient() {
  const { user, loading: authLoading } = useAuthState();
  const [data, setData] = useState<ChallengeSnapshot | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading || !user?.id) return;

    const controller = new AbortController();

    fetch('/api/community/challenges', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.message || payload?.error || 'Не удалось загрузить задания.');
        }
        return normalizeChallengeSnapshot(payload);
      })
      .then((snapshot) => {
        setData(snapshot);
        setError('');
      })
      .catch((loadError) => {
        if ((loadError as Error).name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'Ошибка загрузки.');
      });

    return () => controller.abort();
  }, [authLoading, user?.id]);

  const completedToday = useMemo(
    () => data?.daily.filter((item) => Boolean(item.completedAt)).length ?? 0,
    [data],
  );
  const completedWeek = useMemo(
    () => data?.weekly.filter((item) => Boolean(item.completedAt)).length ?? 0,
    [data],
  );

  if (authLoading) {
    return <main className={styles.page}><div className={styles.state}>Загружаем задания…</div></main>;
  }

  if (!user) {
    return (
      <main className={styles.page}>
        <div className={styles.state}>
          <strong>Войди в AnimeBox</strong>
          <span>Задания и серия активности сохраняются в аккаунте.</span>
          <Link href="/login?next=/challenges">Войти</Link>
        </div>
      </main>
    );
  }

  if (error) {
    return <main className={styles.page}><div className={styles.state} role="alert">{error}</div></main>;
  }

  if (!data) {
    return <main className={styles.page}><div className={styles.state}>Собираем прогресс…</div></main>;
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>AnimeBox · Задания</span>
          <h1>Задания</h1>
          <p>
            Небольшие цели за реальный просмотр. Никаких кликов ради XP — прогресс считается только по подтверждённой активности.
          </p>
        </div>

        <StreakDisplay
          current={data.streak.current}
          longest={data.streak.longest}
          lastActiveDate={data.streak.lastActiveDate}
          todayKey={data.todayKey}
          variant="hero"
          className={styles.streakV2}
        />
      </section>

      <section className={styles.infoStrip}>
        <div><span>Сегодня</span><strong>{completedToday} / {data.daily.length}</strong></div>
        <div><span>Эта неделя</span><strong>{completedWeek} / {data.weekly.length}</strong></div>
        <div><span>Активный день</span><strong>10 мин</strong></div>
      </section>

      <section className={styles.section}>
        <header>
          <div><span>Ежедневные</span><h2>Сегодня</h2></div>
          <small>Сброс в 00:00 UTC</small>
        </header>
        <div className={styles.grid}>
          {data.daily.map((item) => <ChallengeCard item={item} key={item.code} />)}
        </div>
      </section>

      <section className={styles.section}>
        <header>
          <div><span>Недельные</span><h2>Эта неделя</h2></div>
          <small>Новый цикл каждый понедельник</small>
        </header>
        <div className={styles.grid}>
          {data.weekly.map((item) => <ChallengeCard item={item} key={item.code} />)}
        </div>
      </section>

      <section className={styles.footerCard}>
        <div>
          <strong>Как работает серия?</strong>
          <p>
            День засчитывается после 10 минут подтверждённого просмотра. Если пропустить целый день, текущая серия начнётся заново при следующей активности.
          </p>
        </div>
        <div>
          <strong>Premium и задания</strong>
          <p>
            Premium +20% действует на обычный XP за активность. Награды заданий одинаковы для всех.
          </p>
        </div>
        <Link href="/profile">Открыть профиль →</Link>
      </section>
    </main>
  );
}
