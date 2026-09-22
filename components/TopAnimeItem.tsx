import Link from 'next/link';
import AnimeImage from '@/components/AnimeImage';
import { animeHref } from '@/lib/anime-url';
import { getAnimeTitle } from '@/lib/anime-display';
import type { Anime } from '@/types/anime';

export default function TopAnimeItem({
  anime,
  rank,
}: {
  anime: Anime;
  rank: number;
}) {
  const title = getAnimeTitle(anime);

  return (
    <Link href={animeHref(anime)} className="top-anime-item">
      <span className="top-anime-item__rank">
        {String(rank).padStart(2, '0')}
      </span>

      <div className="top-anime-item__poster">
        <AnimeImage
          image={anime.coverImage || anime.image}
          alt={title}
          sizes="(max-width: 768px) 30vw, 44px"
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
