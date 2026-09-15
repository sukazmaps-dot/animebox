'use client';

import { animeHref } from '@/lib/anime-url';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AnimeListItem } from '@/types/anime';
import {
  getWatchingStateFromProgress,
  readAnimeList,
  readAnimeProgressMap,
  writeAnimeList,
} from '@/lib/anime-storage';
import Icon from '@/components/Icon';
import AnimeImage from '@/components/AnimeImage';
import { getAnimeTitle } from '@/lib/anime-display';

const filters = [
  ['all', 'Все'],
  ['watching', 'Смотрю'],
  ['watched', 'Просмотрено'],
] as const;

function getEpisodeCount(anime: AnimeListItem): number | null {
  return anime.episodes && anime.episodes > 0
    ? anime.episodes
    : anime.episodesAired && anime.episodesAired > 0
      ? anime.episodesAired
      : null;
}

export default function MyListPage() {
  const [list, setList] = useState<AnimeListItem[]>([]);
  const [progressMap, setProgressMap] = useState<Readonly<Record<string, number>>>({});
  const [filter, setFilter] = useState<(typeof filters)[number][0]>('all');

  useEffect(() => {
    const sync = () => {
      setList(readAnimeList());
      setProgressMap(readAnimeProgressMap());
    };

    const onStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === 'anime_list' ||
        event.key === 'anime_progress'
      ) {
        sync();
      }
    };

    sync();

    window.addEventListener('storage', onStorage);
    window.addEventListener('anime-list-changed', sync);
    window.addEventListener('anime-progress-changed', sync);
    window.addEventListener('pageshow', sync);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('anime-list-changed', sync);
      window.removeEventListener('anime-progress-changed', sync);
      window.removeEventListener('pageshow', sync);
    };
  }, []);

  const rows = useMemo(
    () =>
      list.map((anime) => {
        const progress = progressMap[String(anime.id)] ?? 0;
        const state = getWatchingStateFromProgress(anime, progress);
        const count = getEpisodeCount(anime);
        const progressPercent = count
          ? Math.min(100, Math.round((progress / count) * 100))
          : 0;

        return {
          anime,
          progress,
          state,
          count,
          progressPercent,
        };
      }),
    [list, progressMap],
  );

  const counts = useMemo(() => {
    let watching = 0;
    let watched = 0;

    for (const row of rows) {
      if (
        row.state === 'watching' ||
        (row.anime.status === 'ongoing' && row.progress === 0)
      ) {
        watching += 1;
      }

      if (row.state === 'watched') {
        watched += 1;
      }
    }

    return {
      all: rows.length,
      watching,
      watched,
    };
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (filter === 'all') {
      return rows;
    }

    if (filter === 'watched') {
      return rows.filter((row) => row.state === 'watched');
    }

    return rows.filter(
      (row) =>
        row.state === 'watching' ||
        (row.anime.status === 'ongoing' && row.progress === 0),
    );
  }, [filter, rows]);

  const removeItem = (id: number) => {
    const updated = list.filter((anime) => anime.id !== id);
    setList(updated);
    writeAnimeList(updated);
    window.dispatchEvent(new Event('anime-list-changed'));
  };

  return (
    <div className="search-page tracker-page">
      <div className="page-heading">
        <span className="pill pill--accent">МОЙ ANIMEBOX</span>
        <h1>Трекер</h1>
        <p>Здесь собраны сохранённые тайтлы, прогресс просмотра и уже завершённые сериалы.</p>
      </div>

      <div className="tracker-tabs" role="tablist" aria-label="Категории трекера">
        {filters.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={`tracker-tab ${filter === id ? 'is-active' : ''}`}
            onClick={() => setFilter(id)}
          >
            <span>{label}</span>
            <b>{counts[id]}</b>
          </button>
        ))}
      </div>

      {visibleRows.length === 0 ? (
        <div className="empty-state tracker-empty">
          <Icon name="heart" width={30} height={30} />
          <strong>{list.length ? 'В этой категории пока пусто' : 'Твой список пока пуст'}</strong>
          <span>
            {filter === 'watching'
              ? 'Открой сохранённый тайтл и начни первую серию — он появится здесь автоматически.'
              : filter === 'watched'
                ? 'Когда завершишь сериал, он попадёт в эту категорию автоматически.'
                : 'Добавляй аниме со страницы тайтла.'}
          </span>
          <Link href="/search" className="btn btn--primary" style={{ marginTop: 15 }}>
            Найти аниме
          </Link>
        </div>
      ) : (
        <div className="anime-grid tracker-grid" style={{ marginTop: 18 }}>
          {visibleRows.map(({ anime, progress, count, state, progressPercent }) => (
            <div key={anime.id} className="tracker-card anime-card" style={{ position: 'relative' }}>
              <Link href={animeHref(anime)}>
                <div className="anime-card__image-wrap">
                  <AnimeImage
                    image={anime.coverImage ?? anime.image}
                    alt={getAnimeTitle(anime)}
                    englishName={anime.title?.english || anime.title?.romaji || anime.name}
                    className="anime-card__image"
                  />
                  <span className="anime-card__rating"><span>★</span>{anime.score ?? '—'}</span>
                  <span className={`tracker-badge tracker-badge--${state}`}>
                    {state === 'watched' ? 'Просмотрено' : state === 'watching' ? 'Смотрю' : 'Сохранено'}
                  </span>
                </div>
                <div className="anime-card__body">
                  <h3>{getAnimeTitle(anime)}</h3>
                  <div className="anime-card__meta">
                    <span>{count ? `${anime.status === 'ongoing' ? 'Вышло' : 'Эпизодов'} ${count}` : 'Эпизоды уточняются'}</span>
                  </div>
                  <div className="tracker-progress-row">
                    <span>Серия {progress}</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="progress tracker-progress">
                    <i style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
              </Link>
              <button
                type="button"
                aria-label="Удалить из списка"
                onClick={() => removeItem(anime.id)}
                className="tracker-remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
