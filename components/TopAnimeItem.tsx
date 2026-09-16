import Link from 'next/link';
import AnimeImage from '@/components/AnimeImage';
import { animeHref } from '@/lib/anime-url';
import { getAnimeTitle } from '@/lib/anime-display';
import type { Anime } from '@/types/anime';

export default function TopAnimeItem({ anime, rank }: { anime: Anime; rank: number }) {
  const title = getAnimeTitle(anime);
  return (
    <Link href={animeHref(anime)} className="group flex min-w-0 items-center gap-3 border-b border-slate-800/70 py-3 last:border-b-0 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-violet-400">
      <span className={`w-8 shrink-0 text-center text-xl font-black tabular-nums ${rank <= 3 ? 'bg-gradient-to-b from-violet-200 to-purple-500 bg-clip-text text-transparent' : 'text-slate-600'}`}>
        {String(rank).padStart(2, '0')}
      </span>
      {/* Dimensions belong to the wrapper: AnimeImage renders its own div. */}
      <div className="h-16 w-12 shrink-0 overflow-hidden rounded-md">
        <AnimeImage image={anime.coverImage || anime.image} alt={title} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 title={title} className="truncate text-sm font-semibold text-slate-100 group-hover:text-violet-300">{title}</h3>
        <p className="mt-1 truncate text-xs leading-5 text-slate-400">
          <span className="text-amber-300">★ {anime.score ?? '—'}</span>
          {anime.format ? ` · ${anime.format}` : ''}
          {anime.episodes ? ` · ${anime.episodes} эп.` : ''}
        </p>
      </div>
    </Link>
  );
}
