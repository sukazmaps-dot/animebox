'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { useAuthState } from '@/components/AuthStateProvider';
import styles from './EpisodeJourneyClient.module.css';

type JourneyRow = {
  id: string;
  animeId: number;
  episode: number;
  eventKey: string;
  kind: string;
  title: string;
  description: string;
  rarity: string;
  imageUrl: string | null;
  unlockedAt: string;
};

function label(kind: string) {
  const map: Record<string, string> = {
    character_intro: 'Встреча',
    battle: 'Битва',
    tension: 'Напряжение',
    reveal: 'Открытие',
    secret: 'Секрет',
    death: 'Событие',
    finale: 'Финал',
    arc_complete: 'Арка завершена',
    episode_milestone: 'Путь',
  };
  return map[kind] ?? 'Момент';
}

export default function EpisodeJourneyClient() {
  const { user, loading } = useAuthState();
  const [rows, setRows] = useState<JourneyRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading || !user) return;
    let active = true;

    void fetch('/api/community/episode-events/journey', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as { events?: JourneyRow[]; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить путь.');
        if (active) setRows(Array.isArray(payload.events) ? payload.events : []);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Ошибка загрузки.');
      });

    return () => { active = false; };
  }, [loading, user]);

  const groups = useMemo(() => {
    const result = new Map<number, JourneyRow[]>();
    for (const row of rows) {
      const list = result.get(row.animeId) ?? [];
      list.push(row);
      result.set(row.animeId, list);
    }
    return [...result.entries()];
  }, [rows]);

  if (loading) return <main className={styles.page}><div className={styles.state}>Загружаем путь…</div></main>;
  if (!user) {
    return (
      <main className={styles.page}>
        <div className={styles.state}>
          <strong>Войди в AnimeBox</strong>
          <span>Сюжетные открытия сохраняются в аккаунте.</span>
          <Link href="/login?next=/achievements/journey">Войти</Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span>ANIMEBOX · JOURNEY</span>
          <h1>Твой путь по аниме</h1>
          <p>Моменты открываются только когда ты реально доходишь до них в серии. Перемотка не считается.</p>
        </div>
        <Link href="/achievements">← К достижениям</Link>
      </header>

      {error && <div className={styles.state}>{error}</div>}

      {!error && rows.length === 0 && (
        <div className={styles.state}>
          <strong>Путь пока пуст</strong>
          <span>Смотри серии с доступными Journey-событиями — открытия появятся здесь автоматически.</span>
        </div>
      )}

      <div className={styles.groups}>
        {groups.map(([animeId, events]) => (
          <section className={styles.group} key={animeId}>
            <div className={styles.groupHead}>
              <span>Тайтл #{animeId}</span>
              <strong>{events.length} открытий</strong>
            </div>

            <div className={styles.grid}>
              {events.map((event) => (
                <article className={styles.card} data-rarity={event.rarity} key={event.id}>
                  <div className={styles.meta}>
                    <span>{label(event.kind)}</span>
                    <small>{event.episode} серия</small>
                  </div>
                  <h2>{event.title}</h2>
                  <p>{event.description}</p>
                  <time dateTime={event.unlockedAt}>
                    {new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(event.unlockedAt))}
                  </time>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
