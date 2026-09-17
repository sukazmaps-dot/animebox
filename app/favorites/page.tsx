'use client';

import { animeHref } from '@/lib/anime-url';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import AnimeImage from '@/components/AnimeImage';
import { getAnimeTitle } from '@/lib/anime-display';
import type { AnimeListItem } from '@/types/anime';
import {
  ANIME_FAVORITES_STORAGE_KEY,
  readAnimeFavorites,
  toggleAnimeFavorite,
} from '@/lib/anime-storage';

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<AnimeListItem[]>([]);

  useEffect(() => {
    const sync = () => {
      setFavorites(readAnimeFavorites());
    };

    const onStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === ANIME_FAVORITES_STORAGE_KEY
      ) {
        sync();
      }
    };

    sync();

    window.addEventListener('storage', onStorage);
    window.addEventListener('anime-favorites-changed', sync);
    window.addEventListener('pageshow', sync);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('anime-favorites-changed', sync);
      window.removeEventListener('pageshow', sync);
    };
  }, []);

  const removeFavorite = (anime: AnimeListItem) => {
    toggleAnimeFavorite(anime);

    /*
     * Мгновенно обновляем UI без повторного сетевого запроса.
     * localStorage уже обновлён toggleAnimeFavorite().
     */
    setFavorites((current) =>
      current.filter((item) => item.id !== anime.id),
    );
  };

  return (
    <div className="search-page tracker-page">
      <div className="page-heading">
        <span className="pill pill--accent">МОЙ ANIMEBOX</span>
        <h1>Избранное</h1>
        <p>Сохранённые аниме, к которым ты хочешь быстро вернуться.</p>
      </div>

      {favorites.length === 0 ? (
        <div className="empty-state tracker-empty">
          <img className="tracker-empty__art" src="/brand/illustrations/empty-favorites.webp" alt="" aria-hidden="true" />
          <strong>Избранное пока пусто</strong>
          <span>Открой страницу аниме и нажми «В избранное».</span>
          <Link href="/search" className="btn btn--primary" style={{ marginTop: 15 }}>
            Найти аниме
          </Link>
        </div>
      ) : (
        <div className="anime-grid tracker-grid" style={{ marginTop: 18 }}>
          {favorites.map((anime) => (
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
                </div>
                <div className="anime-card__body">
                  <h3>{getAnimeTitle(anime)}</h3>
                  <div className="anime-card__meta">
                    <span>{anime.status === 'ongoing' ? 'Онгоинг' : 'Аниме'}</span>
                  </div>
                </div>
              </Link>
              <button
                type="button"
                aria-label="Удалить из избранного"
                onClick={() => removeFavorite(anime)}
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
