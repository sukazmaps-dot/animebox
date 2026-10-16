import AnimeIntentLink from '@/components/AnimeIntentLink';
import AnimeImage from '@/components/AnimeImage';
import { animeHref } from '@/lib/anime-url';
import { getAnimeTitle } from '@/lib/anime-display';
import { formatAnimeScore } from '@/lib/anime-score';
import { animeEpisodesDisplay } from '@/lib/anime-content-intelligence';
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
    <AnimeIntentLink href={animeHref(anime)} className={`top-anime-item${editorial ? ' top-anime-item--editorial' : ''}`}>
      <span className="top-anime-item__rank">
        {String(rank)}
      </span>

      <div className="top-anime-item__poster">
        <AnimeImage
          image={anime.coverImage || anime.image}
          alt={title}
          sizes={editorial ? '(max-width: 768px) 42vw, (max-width: 1200px) 24vw, 17vw' : '(max-width: 768px) 30vw, 44px'}
          quality={70}
          sourcePreference={editorial ? 'quality' : 'compact'}
          preset={editorial ? 'large' : 'tiny'}
        />
      </div>

      <div className="top-anime-item__copy">
        <strong title={title}>{title}</strong>
        <span>
          <b>★ {formatAnimeScore(anime) ?? '—'}</b>
          {anime.format ? ` · ${anime.format}` : ''}
          {animeEpisodesDisplay(anime) ? ` · ${animeEpisodesDisplay(anime)}` : ''}
        </span>
      </div>
    </AnimeIntentLink>
  );
}
