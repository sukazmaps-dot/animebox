import Link from 'next/link';

import HomeAnimeRail from '@/components/HomeAnimeRail';
import { getAnimesWithShikimori } from '@/lib/combined-anime';
import type { Anime } from '@/types/anime';

const ANILIST_GENRE_BY_RUSSIAN: Record<string, string> = {
  'Экшен': 'Action',
  'Приключения': 'Adventure',
  'Комедия': 'Comedy',
  'Драма': 'Drama',
  'Эччи': 'Ecchi',
  'Фэнтези': 'Fantasy',
  'Ужасы': 'Horror',
  'Махо-сёдзё': 'MahouShoujo',
  'Меха': 'Mecha',
  'Музыка': 'Music',
  'Детектив': 'Mystery',
  'Тайна': 'Mystery',
  'Психологическое': 'Psychological',
  'Романтика': 'Romance',
  'Фантастика': 'Sci-Fi',
  'Повседневность': 'Slice of Life',
  'Спорт': 'Sports',
  'Сверхъестественное': 'Supernatural',
  'Триллер': 'Thriller',
};

function normalizeGenre(genre?: string | null): string | undefined {
  const value = genre?.trim();
  if (!value) return undefined;
  return ANILIST_GENRE_BY_RUSSIAN[value] ?? value;
}

function uniqueWithoutCurrent(items: Anime[], animeId: number): Anime[] {
  const seen = new Set<number>([animeId]);

  return items.filter((anime) => {
    if (!Number.isSafeInteger(anime.id) || anime.id <= 0 || seen.has(anime.id)) {
      return false;
    }

    seen.add(anime.id);
    return true;
  });
}

async function loadRelatedAnime(
  animeId: number,
  genres: string[],
): Promise<Anime[]> {
  const genre = normalizeGenre(genres[0]);

  try {
    const related = await getAnimesWithShikimori({
      page: 1,
      limit: 16,
      order: 'popularity',
      genre,
    });

    const filtered = uniqueWithoutCurrent(related, animeId).slice(0, 12);

    if (filtered.length >= 6) {
      return filtered;
    }
  } catch (error) {
    console.warn('Related anime by genre failed:', error);
  }

  try {
    const fallback = await getAnimesWithShikimori({
      page: 1,
      limit: 16,
      order: 'ranked',
    });

    return uniqueWithoutCurrent(fallback, animeId).slice(0, 12);
  } catch (error) {
    console.warn('Related anime fallback failed:', error);
    return [];
  }
}

export function RelatedAnimeLoading() {
  return (
    <section className="border-t border-white/[0.04] py-10">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="mb-5 h-7 w-52 animate-pulse rounded-lg bg-white/[0.06]" />

        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-[310px] w-[170px] shrink-0 animate-pulse rounded-2xl bg-white/[0.04]"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default async function RelatedAnime({
  animeId,
  genres,
}: {
  animeId: number;
  genres: string[];
}) {
  const items = await loadRelatedAnime(animeId, genres);

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-white/[0.04] py-10">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="section-head">
          <div>
            <h2 className="section-title">Похожие аниме</h2>
            <p className="mt-1 text-sm text-white/45">
              Тайтлы с похожими жанрами и интересами аудитории
            </p>
          </div>

          <Link href="/search" className="section-link">
            Весь каталог →
          </Link>
        </div>

        <HomeAnimeRail
          items={items}
          ariaLabel="Похожие аниме"
        />
      </div>
    </section>
  );
}
