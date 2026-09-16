'use client';

import Link from 'next/link';

import AnimeImage from '@/components/AnimeImage';
import { getAnimeTitle } from '@/lib/anime-display';
import { animeHref } from '@/lib/anime-url';
import type { AnimeHistoryEntry } from '@/lib/anime-storage';

export type ContinueWatchingItem = {
  anime: AnimeHistoryEntry;
  episode: number;
};

export default function HomeContinueWatching({
  items,
}: {
  items: ContinueWatchingItem[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="section continue-watching-section">
      <div className="section-head">
        <div>
          <span className="smart-section-eyebrow">ВОЗВРАЩАЙСЯ В ИСТОРИЮ</span>
          <h2 className="section-title">Продолжить просмотр</h2>
        </div>

        <Link className="section-link" href="/list">
          Мой трекер →
        </Link>
      </div>

      <div className="continue-smart-grid">
        {items.slice(0, 4).map(({ anime, episode }) => {
          const title = getAnimeTitle(anime);
          const totalEpisodes = anime.episodes && anime.episodes > 0 ? anime.episodes : null;
          const progress = totalEpisodes
            ? Math.min(100, Math.max(4, (episode / totalEpisodes) * 100))
            : 18;

          return (
            <Link
              key={anime.id}
              href={`${animeHref(anime)}/watch?ep=${Math.max(1, episode)}`}
              className="continue-smart-card"
            >
              <div className="continue-smart-card__poster">
                <AnimeImage
                  image={anime.coverImage}
                  alt={title}
                  englishName={anime.title?.english || anime.title?.romaji}
                  className="continue-smart-card__image"
                  loading="lazy"
                />
                <span className="continue-smart-card__play" aria-hidden="true">▶</span>
              </div>

              <div className="continue-smart-card__body">
                <span className="continue-smart-card__eyebrow">ЭПИЗОД {Math.max(1, episode)}</span>
                <strong title={title}>{title}</strong>
                <div className="continue-smart-card__progress" aria-hidden="true">
                  <i style={{ width: `${progress}%` }} />
                </div>
                <small>
                  {totalEpisodes ? `${episode} из ${totalEpisodes}` : 'Продолжить с места просмотра'}
                </small>
              </div>

              <span className="continue-smart-card__arrow" aria-hidden="true">→</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
