import Link from 'next/link';
import AnimeImage from '@/components/AnimeImage';
import { animeHref } from '@/lib/anime-url';
import { getAnimeTitle } from '@/lib/anime-display';
import type { Anime } from '@/types/anime';

export default function TopAnimeItem({
  anime,
  rank,
  editorial = false,
}: {
  anime: Anime;
  rank: number;
  editorial?: boolean;
}) {
  const title = getAnimeTitle(anime);

  return (
    <Link href={animeHref(anime)} className={`top-anime-item${editorial ? ' top-anime-item--editorial' : ''}`}>
      <span className="top-anime-item__rank">
        {String(rank)}
      </span>

      <div className="top-anime-item__poster">
        <AnimeImage
          image={anime.coverImage || anime.image}
          alt={title}
          sizes={editorial ? '(max-width: 768px) 42vw, (max-width: 1200px) 24vw, 17vw' : '(max-width: 768px) 30vw, 44px'}
          quality={70}
        />
      </div>

      <div className="top-anime-item__copy">
        <strong title={title}>{title}</strong>
        <span>
          <b>★ {anime.score ?? anime.averageScore ?? '—'}</b>
          {anime.format ? ` · ${anime.format}` : ''}
          {anime.episodes ? ` · ${anime.episodes} эп.` : ''}
        </span>
      </div>
    </Link>
  );
}
