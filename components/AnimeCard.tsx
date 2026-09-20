import { animeHref } from '@/lib/anime-url';
import Link from 'next/link';
import type { Anime } from '@/types/anime';

import AnimeImage from '@/components/AnimeImage';
import { getAnimeTitle, isAnimeOngoing } from '@/lib/anime-display';

function formatLabel(
  format: string | null | undefined,
): string {
  if (!format) return 'Аниме';

  const labels: Record<string, string> = {
    TV: 'TV',
    'ТВ': 'TV',
    TV_SHORT: 'TV Short',
    'ТВ (Короткое)': 'TV Short',
    MOVIE: 'Фильм',
    'Фильм': 'Фильм',
    OVA: 'OVA',
    ONA: 'ONA',
    SPECIAL: 'Спецвыпуск',
    'Спешл': 'Спецвыпуск',
    MUSIC: 'Музыка',
    'Клип': 'Музыка',
  };

  return labels[format] ?? format;
}

function episodeLabel(anime: Anime): string {
  if (!anime.episodes || anime.episodes <= 0) {
    return 'Эпизоды уточняются';
  }

  return `${anime.episodes} эп.`;
}

function yearLabel(anime: Anime): string | null {
  const year = Number(anime.startDate?.year ?? 0);
  return Number.isInteger(year) && year > 1900 ? String(year) : null;
}

export default function AnimeCard({
  anime,
  compact = false,
  watchedEpisode = null,
  discoveryMatch = null,
}: {
  anime: Anime;
  compact?: boolean;
  watchedEpisode?: number | null;
  discoveryMatch?: { percent: number; reasons?: string[] } | null;
}) {
  const title = getAnimeTitle(anime);
  const year = yearLabel(anime);
  const episode =
    typeof watchedEpisode === 'number' &&
    Number.isInteger(watchedEpisode) &&
    watchedEpisode > 0
      ? watchedEpisode
      : null;
  const totalEpisodes =
    typeof anime.episodes === 'number' &&
    Number.isInteger(anime.episodes) &&
    anime.episodes > 0
      ? anime.episodes
      : null;
  const progressPercent =
    episode && totalEpisodes
      ? Math.min(100, Math.max(2, (episode / totalEpisodes) * 100))
      : null;
  const ongoing = isAnimeOngoing(anime);

  return (
    <Link
      href={animeHref(anime)}
      className={`anime-card anime-card--signature flex h-full min-w-0 flex-col ${
        compact ? 'anime-card--compact' : ''
      }`}
    >
      <div
        className="anime-card__image-wrap aspect-[2/3] shrink-0"
        style={{ aspectRatio: '2 / 3' }}
      >
        <div className="anime-card__image-fill">
          <AnimeImage
            image={anime.coverImage}
            alt={title}
            englishName={anime.title?.english || anime.title?.romaji}
            className="anime-card__image"
            loading="lazy"
            sizes="(max-width: 560px) 39vw, (max-width: 900px) 26vw, (max-width: 1280px) 17vw, 205px"
            quality={68}
          />
        </div>

        <span className="anime-card__rating">
          <span aria-hidden="true">★</span>
          {anime.score ?? anime.averageScore ?? '—'}
        </span>

        <span className="anime-card__state">
          {episode ? `эп. ${episode}` : ongoing ? 'онгоинг' : year || formatLabel(anime.format)}
        </span>

        <span className="anime-card__shine" aria-hidden="true" />

        {progressPercent != null && (
          <span className="anime-card__watch-progress" aria-hidden="true">
            <i style={{ width: `${progressPercent}%` }} />
          </span>
        )}
      </div>

      <div className="anime-card__body flex min-w-0 flex-1 flex-col">
        <h3 title={title} className="line-clamp-2">
          {title}
        </h3>

        {discoveryMatch && (
          <div className="anime-card__match" title={discoveryMatch.reasons?.join(' · ')}>
            <strong>{discoveryMatch.percent}%</strong>
            <span>{discoveryMatch.reasons?.[0] || 'совпадение'}</span>
          </div>
        )}

        {episode ? (
          <div className="anime-card__personal">
            <span aria-hidden="true" />
            <strong>Продолжить</strong>
            <small>эпизод {episode}</small>
          </div>
        ) : (
          <div className="anime-card__meta">
            {year && <span>{year}</span>}
            {year && <span aria-hidden="true">·</span>}
            <span>{formatLabel(anime.format)}</span>
            <span aria-hidden="true">·</span>
            <span>{episodeLabel(anime)}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
