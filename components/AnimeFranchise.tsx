import { registerAnime } from '@/lib/anime-registry';
import { animeHref } from '@/lib/anime-url';
import Link from 'next/link';
import AnimePoster from '@/components/AnimePoster';
import HorizontalNavRail from '@/components/ui/HorizontalNavRail';
import styles from './AnimeFranchise.module.css';
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
const SECTION_CLASS = 'anime-franchise-v3 w-full min-w-0 max-w-full pb-6 pt-2';

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
  watchHref,
}: {
  animeId: number;
  currentTitle?: string | null;
  watchHref?: string;
}) {
  let franchise: FranchiseData | null;
  try {
    franchise = await getAnimeFranchiseWithShikimori(animeId, { maxRequests: 16 });
  } catch (error) {
    console.error('Franchise section failed:', error);
    franchise = null;
  }

  // Never leave an open "Порядок частей" accordion completely blank:
  // AniList relation lookup may fail or report no linked parts.
  if (!franchise || (franchise.items.length <= 1 && !franchise.partial)) {
    return (
      <div className="min-w-0 px-0 pb-5 text-sm leading-6 text-[var(--ab-ui-muted)]" role="status">
        <p>{!franchise
          ? 'Не удалось загрузить порядок частей. Попробуй позже.'
          : 'Связанные сезоны пока не найдены в каталоге.'}</p>
        {watchHref && (
          <Link href={watchHref} className="mt-2 inline-flex min-h-11 items-center text-[var(--ab-ui-accent)]">
            Открыть раздел просмотра →
          </Link>
        )}
      </div>
    );
  }

  franchise.items = franchise.items.map(registerAnime);
  for (const category of CATEGORIES) franchise.groups[category] = franchise.groups[category].map(registerAnime);
  const seasons = getPrimarySeasonItems(franchise);
  const hasSeasonSwitcher = seasons.length > 1;

  return (
    <section className={SECTION_CLASS} aria-labelledby="franchise-heading">
      <div className="anime-franchise-v3__inner min-w-0 max-w-full pt-3">
        <span className="anime-franchise-v3__eyebrow">Франшиза</span>
        <h2 id="franchise-heading" className="anime-franchise-v3__title">Порядок частей</h2>
        <p className="anime-franchise-v3__subtitle">Сезоны, фильмы и спецвыпуски по порядку выхода.</p>
        {franchise.partial && (
          <p className="mt-3 text-sm text-amber-200/80" role="status">
            Показана часть франшизы. Некоторые связи пока не загружены.
          </p>
        )}

        {hasSeasonSwitcher && (
          <div className="mt-6">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white/85">Основная линия</h3>
                <p className="mt-1 text-xs text-white/40">От первого сезона к следующей части</p>
              </div>
              <span className="text-xs text-white/35">{seasons.length}</span>
            </div>

            <HorizontalNavRail
              className={styles.seasonsRail}
              ariaLabel="Сезоны и части франшизы"
              stepRatio={0.74}
            >
              {seasons.map((item, index) => {
                const title =
                  item.title.russian ||
                  (item.isCurrent && currentTitle) ||
                  item.title.romaji ||
                  item.title.english ||
                  item.title.native ||
                  'Без названия';

                const content = (
                  <>
                    <span className="anime-franchise-v3__step" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    <span className="anime-franchise-v3__season-label">{item.label}</span>
                    <span className="anime-franchise-v3__season-title" title={title}>{title}</span>
                    {item.startDate?.year && (
                      <span className="anime-franchise-v3__year">{item.startDate.year}</span>
                    )}
                  </>
                );

                return item.isCurrent ? (
                  <div
                    key={item.id}
                    aria-current="page"
                    data-rail-active="true"
                    className={`${styles.season} anime-franchise-v3__season is-current min-w-[150px] w-[190px] shrink-0 snap-start text-white md:w-[210px]`}
                  >
                    {content}
                    <span className="anime-franchise-v3__current">Сейчас</span>
                  </div>
                ) : (
                  <Link
                    key={item.id}
                    href={animeHref(item)}
                    prefetch={false}
                    className={`${styles.season} anime-franchise-v3__season min-w-[150px] w-[190px] shrink-0 snap-start text-white/75 md:w-[210px]`}
                  >
                    {content}
                  </Link>
                );
              })}
            </HorizontalNavRail>
          </div>
        )}

        <div className="anime-franchise-v3__groups mt-6">
          {CATEGORIES.map((category) => {
            if (category === 'series' && hasSeasonSwitcher) return null;

            const items = franchise.groups[category];
            if (!items.length) return null;
            return (
              <div key={category} className="anime-franchise-v3__group">
                <h3 className="mb-3 text-sm font-semibold text-white/80">
                  {FRANCHISE_CATEGORY_LABELS[category]}
                  <span className="ml-2 text-white/40">{items.length}</span>
                </h3>
                <ul className="anime-franchise-v3__group-list">
                  {items.map((item) => {
                    const title = item.title.russian || (item.isCurrent && currentTitle) || item.title.romaji || item.title.english || item.title.native || 'Без названия';
                    const details = [translateFormat(item.format), item.startDate?.year].filter(Boolean).join(' · ');
                    const content = (
                      <>
                        <div className="h-28 w-[74px] shrink-0 overflow-hidden rounded-lg">
                          <AnimePoster image={item.coverImage} alt="" loading="lazy" preset="card" format="auto" />
                        </div>
                        <div className="min-w-0 py-1">
                          <p className="line-clamp-3 text-sm font-semibold leading-5">{title}</p>
                          {details && <p className="mt-2 text-xs text-white/45">{details}</p>}
                          {item.isCurrent && <p className="mt-2 text-xs font-medium text-[var(--ab-ui-accent)]">Вы здесь</p>}
                        </div>
                      </>
                    );
                    return (
                      <li key={item.id}>
                        {item.isCurrent ? (
                          <div aria-current="page" className="anime-franchise-v3__related is-current flex h-full gap-3 p-2">{content}</div>
                        ) : (
                          <Link
                            href={animeHref(item)}
                            prefetch={false}
                            className="anime-franchise-v3__related flex h-full gap-3 p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
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
