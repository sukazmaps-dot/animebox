import { registerAnime } from '@/lib/anime-registry';
import { animeHref } from '@/lib/anime-url';
import Link from 'next/link';
import AnimeImageCascade from '@/components/AnimeImageCascade';
import {
  FRANCHISE_CATEGORY_LABELS,
  getPrimarySeasonItems,
  type AnimeFranchise as FranchiseData,
  type FranchiseCategory,
} from '@/lib/anime-franchise';
import { translateFormat } from '@/lib/anilist';
import { getAnimeFranchiseWithShikimori } from '@/lib/combined-anime';

const CATEGORIES: FranchiseCategory[] = [
  'series', 'movies', 'ova', 'specials', 'spinOffs', 'other',
];
const SECTION_CLASS = 'mx-auto max-w-7xl px-4 pb-12 pt-4 md:px-6';

export function AnimeFranchiseLoading() {
  return (
    <section className={SECTION_CLASS} aria-busy="true" aria-label="Франшиза">
      <p role="status" className="text-sm text-white/50">Загружаем связанные части…</p>
      <div aria-hidden="true" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-28 rounded-xl bg-white/5 motion-safe:animate-pulse" />
        ))}
      </div>
    </section>
  );
}

export default async function AnimeFranchise({
  animeId,
  currentTitle,
}: {
  animeId: number;
  currentTitle?: string | null;
}) {
  let franchise: FranchiseData | null;
  try {
    franchise = await getAnimeFranchiseWithShikimori(animeId);
  } catch (error) {
    console.error('Franchise section failed:', error);
    franchise = null;
  }

  // Франшиза — дополнительный блок. Если внешний API временно
  // ограничил запросы, основная страница аниме всё равно должна работать.
  if (!franchise) return null;

  // У отдельного произведения не показываем блок из одной карточки.
  if (franchise.items.length <= 1 && !franchise.partial) return null;

  franchise.items = franchise.items.map(registerAnime);
  for (const category of CATEGORIES) franchise.groups[category] = franchise.groups[category].map(registerAnime);
  const seasons = getPrimarySeasonItems(franchise);
  const hasSeasonSwitcher = seasons.length > 1;

  return (
    <section className={SECTION_CLASS} aria-labelledby="franchise-heading">
      <div className="border-t border-white/10 pt-8">
        <h2 id="franchise-heading" className="text-xl font-bold tracking-tight md:text-2xl">Франшиза</h2>
        <p className="mt-2 text-sm text-white/50">Связанные части по дате выхода</p>
        {franchise.partial && (
          <p className="mt-3 text-sm text-amber-200/80" role="status">
            Показана часть франшизы. Некоторые связи пока не загружены.
          </p>
        )}

        {hasSeasonSwitcher && (
          <div className="mt-6">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white/85">Сезоны / части</h3>
                <p className="mt-1 text-xs text-white/40">
                  Части одного сезона не получают лишний номер
                </p>
              </div>
              <span className="text-xs text-white/35">{seasons.length}</span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {seasons.map((item) => {
                const title =
                  item.title.russian ||
                  (item.isCurrent && currentTitle) ||
                  item.title.romaji ||
                  item.title.english ||
                  item.title.native ||
                  'Без названия';

                const content = (
                  <>
                    <span className="block text-sm font-bold">{item.label}</span>
                    <span className="mt-1 block max-w-44 truncate text-[11px] text-white/45" title={title}>
                      {title}
                    </span>
                    {item.startDate?.year && (
                      <span className="mt-1 block text-[10px] text-white/30">
                        {item.startDate.year}
                      </span>
                    )}
                  </>
                );

                return item.isCurrent ? (
                  <div
                    key={item.id}
                    aria-current="page"
                    className="min-w-[150px] max-w-[190px] shrink-0 rounded-xl border border-violet-400/55 bg-violet-500/15 px-3 py-2.5 text-white"
                  >
                    {content}
                    <span className="mt-1.5 block text-[10px] font-medium text-violet-300">Вы здесь</span>
                  </div>
                ) : (
                  <Link
                    key={item.id}
                    href={animeHref(item)}
                    prefetch={false}
                    className="min-w-[150px] max-w-[190px] shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-white/75 transition-colors hover:border-violet-400/40 hover:bg-white/[0.07] hover:text-white"
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-6 space-y-7">
          {CATEGORIES.map((category) => {
            if (category === 'series' && hasSeasonSwitcher) return null;

            const items = franchise.groups[category];
            if (!items.length) return null;
            return (
              <div key={category}>
                <h3 className="mb-3 text-sm font-semibold text-white/80">
                  {FRANCHISE_CATEGORY_LABELS[category]}
                  <span className="ml-2 text-white/40">{items.length}</span>
                </h3>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {items.map((item) => {
                    const title = item.title.russian || (item.isCurrent && currentTitle) || item.title.romaji || item.title.english || item.title.native || 'Без названия';
                    const sources = [item.coverImage.extraLarge, item.coverImage.large, item.coverImage.medium]
                      .filter((source): source is string => Boolean(source));
                    const details = [translateFormat(item.format), item.startDate?.year].filter(Boolean).join(' · ');
                    const content = (
                      <>
                        <div className="h-28 w-[74px] shrink-0 overflow-hidden rounded-lg">
                          <AnimeImageCascade sources={sources} alt="" loading="lazy" />
                        </div>
                        <div className="min-w-0 py-1">
                          <p className="line-clamp-3 text-sm font-semibold leading-5">{title}</p>
                          {details && <p className="mt-2 text-xs text-white/45">{details}</p>}
                          {item.isCurrent && <p className="mt-2 text-xs font-medium text-violet-300">Вы здесь</p>}
                        </div>
                      </>
                    );
                    return (
                      <li key={item.id}>
                        {item.isCurrent ? (
                          <div aria-current="page" className="flex h-full gap-3 rounded-xl border border-violet-400/40 bg-violet-400/10 p-2">{content}</div>
                        ) : (
                          <Link
                            href={animeHref(item)}
                            prefetch={false}
                            className="flex h-full gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2 transition-colors hover:border-violet-400/40 hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
                          >{content}</Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
