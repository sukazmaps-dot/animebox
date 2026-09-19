import { animeHref } from '@/lib/anime-url';
import Link from 'next/link';
import type { Anime } from '@/types/anime';

import AnimeImage from '@/components/AnimeImage';
import { getAnimeTitle } from '@/lib/anime-display';

function formatLabel(
  format: string | null | undefined,
)
: string {
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

function episodeLabel(
  anime: Anime,
): string {
  if (
    !anime.episodes ||
    anime.episodes <= 0
  ) {
    return 'Эпизоды уточняются';
  }

  return `${anime.episodes} эп.`;
}

export default function AnimeCard({
  anime,
  compact = false,
}: {
  anime: Anime;
  compact?: boolean;
}) {
  const title = getAnimeTitle(anime);
  const genres = Array.isArray(anime.genres)
    ? anime.genres
    : [];

  return (
    <Link
      href={animeHref(anime)}
      className={`anime-card flex h-full min-w-0 flex-col ${
        compact
          ? 'anime-card--compact'
          : ''
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
            englishName={
              anime.title?.english ||
              anime.title?.romaji
            }
            className="anime-card__image"
            loading="lazy"
            sizes="(max-width: 560px) 39vw, (max-width: 900px) 26vw, (max-width: 1280px) 17vw, 180px"
            quality={68}
          />
        </div>

        <span className="anime-card__rating">
          <span>★</span>
          {anime.score ?? '—'}
        </span>

        <span className="anime-card__shine" />

        <div className="anime-card__peek" aria-hidden="true">
          <span className="anime-card__peek-label">
            Открыть тайтл
            <span className="anime-card__peek-arrow">↗</span>
          </span>
        </div>
      </div>

      <div className="anime-card__body flex min-w-0 flex-1 flex-col">
        <h3 title={title} className="line-clamp-2">
          {title}
        </h3>

        <div className="anime-card__meta">
          <span>
            {formatLabel(anime.format)}
          </span>

          <span>•</span>

          <span>
            {episodeLabel(anime)}
          </span>
        </div>

        {!compact && (
            <div className="anime-card__tags">
              {genres
                .slice(0, 2)
                .map((genre) => (
                  <span key={genre}>
                    {genre}
                  </span>
                ))}
            </div>
          )}
      </div>
    </Link>
  );
}