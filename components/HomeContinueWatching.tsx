'use client';

import Link from 'next/link';

import AnimeImage from '@/components/AnimeImage';
import { getAnimeTitle } from '@/lib/anime-display';
import { animeHref } from '@/lib/anime-url';
import type { AnimeHistoryEntry } from '@/lib/anime-storage';

export type ContinueWatchingItem = {
  anime: AnimeHistoryEntry;
  episode: number;
  resumeSeconds?: number;
  completedEpisodes?: number;
  totalEpisodes?: number | null;
};

function formatResumeTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

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
          <span className="smart-section-eyebrow">Твоя история</span>
          <h2 className="section-title">Продолжить просмотр</h2>
        </div>

        <Link className="section-link" href="/list">
          Мой трекер →
        </Link>
      </div>

      <div className="continue-smart-grid">
        {items.slice(0, 4).map(({
          anime,
          episode,
          resumeSeconds = 0,
          completedEpisodes,
          totalEpisodes: explicitTotalEpisodes,
        }) => {
          const title = getAnimeTitle(anime);
          const totalEpisodes =
            explicitTotalEpisodes ??
            (anime.episodes && anime.episodes > 0 ? anime.episodes : null);
          const titleProgress =
            completedEpisodes != null && totalEpisodes
              ? (completedEpisodes / totalEpisodes) * 100
              : totalEpisodes
                ? (episode / totalEpisodes) * 100
                : 18;
          const progress = Math.min(100, Math.max(4, titleProgress));

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
                  sizes="54px"
                  quality={60}
                />
                <span className="continue-smart-card__play" aria-hidden="true">▶</span>
              </div>

              <div className="continue-smart-card__body">
                <span className="continue-smart-card__eyebrow">
                  ЭПИЗОД {Math.max(1, episode)}
                  {resumeSeconds >= 10 ? ` · ${formatResumeTime(resumeSeconds)}` : ''}
                </span>
                <strong title={title}>{title}</strong>
                <div className="continue-smart-card__progress" aria-hidden="true">
                  <i style={{ width: `${progress}%` }} />
                </div>
                <small>
                  {resumeSeconds >= 10
                    ? `Продолжить с ${formatResumeTime(resumeSeconds)}`
                    : completedEpisodes != null && totalEpisodes
                      ? `${completedEpisodes} из ${totalEpisodes} серий подтверждено`
                      : totalEpisodes
                        ? `${episode} из ${totalEpisodes}`
                        : 'Продолжить с места просмотра'}
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
