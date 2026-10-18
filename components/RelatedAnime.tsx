import Link from 'next/link';
import { after } from 'next/server';

import HomeAnimeRail from '@/components/HomeAnimeRail';
import { getAnimeRecommendationsById } from '@/lib/anilist';
import { enrichAnimePosterSources } from '@/lib/anime-poster-metadata-server';
import { getAnimesWithShikimori } from '@/lib/combined-anime';
import { findAnimeGenre, findAnimeTag } from '@/lib/anime-taxonomy';
import type { Anime } from '@/types/anime';
import {
  filterAnimeByAvailability,
  refreshCatalogAvailabilityBatch,
} from '@/lib/catalog-availability-server';

function genreKey(value: string): string {
  return (findAnimeGenre(value)?.value ?? value)
    .normalize('NFKC').trim().toLocaleLowerCase('en');
}

function tagKey(value: string): string {
  return (findAnimeTag(value)?.value ?? value)
    .normalize('NFKC').trim().toLocaleLowerCase('en');
}

function normalizeNames(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => {
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object' && 'name' in value &&
        typeof value.name === 'string') return value.name;
      return '';
    })
    .map((value) => value.normalize('NFKC').trim().toLocaleLowerCase('en'))
    .filter(Boolean);
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

/**
 * A title-specific graph, combined with an OR-genre candidate pool.
 * Unlike the old ranked fallback, every returned item must share at least
 * one genre/tag with the page (unless the source lacks taxonomy entirely).
 * No global cache key or global top-anime list is used here.
 */
async function loadRelatedAnime(
  animeId: number,
  genres: string[],
  tags: string[],
): Promise<Anime[]> {
  const displayGenres = [...new Set(genres.flatMap((value) => {
    const genre = findAnimeGenre(value);
    return genre ? [genre.value] : [];
  }))];
  const activeGenres = displayGenres.map(genreKey);
  const displayTags = [...new Set([
    ...tags,
    ...genres.flatMap((value) => {
      const tag = findAnimeTag(value);
      return tag ? [tag.value] : [];
    }),
  ].map((value) => findAnimeTag(value)?.value ?? value.trim()).filter(Boolean))];
  const activeTags = new Set(displayTags.map(tagKey).slice(0, 12));

  const [graphResult, genresResult] = await Promise.allSettled([
    getAnimeRecommendationsById(animeId, 30),
    displayGenres.length
      ? getAnimesWithShikimori({
          page: 1,
          limit: 30,
          order: 'popularity',
          genres: displayGenres.slice(0, 3),
        })
      : displayTags.length
        ? getAnimesWithShikimori({
            page: 1,
            limit: 30,
            order: 'popularity',
            tags: displayTags.slice(0, 3),
          })
        : Promise.resolve([] as Anime[]),
  ]);

  if (graphResult.status === 'rejected') {
    console.warn('Related anime graph failed:', graphResult.reason);
  }
  if (genresResult.status === 'rejected') {
    console.warn('Related anime genre lookup failed:', genresResult.reason);
  }

  const graph = graphResult.status === 'fulfilled' ? graphResult.value : [];
  const genrePool = genresResult.status === 'fulfilled' ? genresResult.value : [];
  const graphIds = new Set(graph.map((anime) => anime.id));
  const requestedGenres = new Set(activeGenres);

  const ranked = uniqueWithoutCurrent([...graph, ...genrePool], animeId)
    .map((anime) => {
      const matchingGenres = [...new Set(normalizeNames(anime.genres).map(genreKey))]
        .filter((genre) => requestedGenres.has(genre)).length;
      const matchingTags = [...new Set([
        ...normalizeNames(anime.tags),
        ...normalizeNames(anime.genres).filter((value) => findAnimeTag(value)),
      ].map(tagKey))]
        .filter((tag) => activeTags.has(tag)).length;
      const hasContext = requestedGenres.size > 0 || activeTags.size > 0;
      if (hasContext && matchingGenres === 0 && matchingTags === 0) {
        return null;
      }
      const rating = Number(anime.score ?? 0);
      return {
        anime,
        relevance:
          matchingGenres * 12 +
          matchingTags * 4 +
          (graphIds.has(anime.id) ? 6 : 0) +
          (Number.isFinite(rating) ? Math.min(10, rating) / 10 : 0),
      };
    })
    .filter((item): item is { anime: Anime; relevance: number } => item !== null)
    .sort((a, b) => b.relevance - a.relevance || a.anime.id - b.anime.id)
    .slice(0, 30)
    .map(({ anime }) => anime);

  if (ranked.length === 0) return [];

  try {
    const availability = await filterAnimeByAvailability(ranked, 'catalog');
    if (availability.refreshTargets.length > 0) {
      after(async () => {
        await refreshCatalogAvailabilityBatch(availability.refreshTargets, { limit: 4 });
      });
    }
    return await enrichAnimePosterSources(availability.items.slice(0, 12));
  } catch (error) {
    console.warn('Related anime availability failed:', error);
    // Fail closed for availability, not over to an unrelated global ranking.
    return [];
  }
}

export function RelatedAnimeLoading() {
  return (
    <section className="border-t border-white/[0.04] py-8">
      <div className="min-w-0 w-full">
        <div className="mb-5 h-7 w-52 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="w-[140px] shrink-0">
              <div className="aspect-[2/3] animate-pulse rounded-[8px] bg-white/[0.06]" />
              <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-white/[0.04]" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default async function RelatedAnime({
  animeId,
  genres,
  tags = [],
}: {
  animeId: number;
  genres: string[];
  tags?: string[];
}) {
  const items = await loadRelatedAnime(animeId, genres, tags);
  if (items.length === 0) return null;

  return (
    <section className="border-t border-white/[0.04] py-8">
      <div className="min-w-0 w-full">
        <div className="section-head">
          <div>
            <h2 className="section-title">Похожие аниме</h2>
            <p className="mt-1 text-sm text-white/45">
              По жанрам, темам и рекомендациям зрителей
            </p>
          </div>
          <Link href="/search" className="section-link">Весь каталог →</Link>
        </div>
        <HomeAnimeRail key={animeId} items={items} ariaLabel="Похожие аниме" />
      </div>
    </section>
  );
}

