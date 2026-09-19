import TopAnimeItem from '@/components/TopAnimeItem';
import { animeHref } from '@/lib/anime-url';
import Link from 'next/link';
import type { Anime } from '@/types/anime';
import AnimeImage from '@/components/AnimeImage';
import Icon from '@/components/Icon';

export function TopAnimePanel({ items }: { items: Anime[] }) {
  return (
    <section className="rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,#0d192a,#09131f)] shadow-[0_18px_40px_rgba(0,0,0,.16)]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Топ аниме</h2>
        <span className="text-[10px] text-slate-500">2026</span>
      </div>
      <div className="px-2 pb-2">
        {items.slice(0, 5).map((anime, index) => (
          <TopAnimeItem key={anime.id} anime={anime} rank={index + 1} />
        ))}
      </div>
    </section>
  );
}

export function UpcomingPanel({ items }: { items: Anime[] }) {
  return (
    <section className="rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,#0d192a,#09131f)] shadow-[0_18px_40px_rgba(0,0,0,.16)]">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Ближайшие серии</h2>
      </div>
      <div className="px-2 pb-2">
        {items.slice(0, 5).map((anime) => {
          const episode = anime.episodes && anime.episodes > 0 ? anime.episodes + 1 : null;
          return (
            <Link
              key={anime.id}
              href={animeHref(anime)}
              className="group grid grid-cols-[32px_1fr_auto] items-center gap-2.5 rounded-xl px-2 py-2 transition-all duration-300 hover:bg-white/[0.045]"
            >
              <AnimeImage image={anime.image} alt={anime.russian} sizes="32px" quality={60} className="h-10 w-8 rounded-md object-cover transition duration-300 group-hover:scale-105" />
              <div className="min-w-0">
                <div className="truncate text-[10px] font-semibold text-slate-100">{anime.russian}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[9px] text-slate-500">
                  <span>{episode ? `Серия ${episode}` : 'Новый эпизод'}</span>
                  <span className="text-slate-700">•</span>
                  <span>скоро</span>
                </div>
              </div>
              <Icon name="chevron" width={11} height={11} className="text-slate-600 transition group-hover:text-violet-300" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
