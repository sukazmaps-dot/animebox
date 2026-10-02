import Link from 'next/link';
import { after } from 'next/server';

import HomeAnimeRail from '@/components/HomeAnimeRail';
import { getAnimesWithShikimori } from '@/lib/combined-anime';
import {
  filterAnimeByAvailability,
  refreshCatalogAvailabilityBatch,
} from '@/lib/catalog-availability-server';
import { recommendationFranchiseKeys } from '@/lib/recommendation-franchise';
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

const RELATED_POOL_PER_GENRE = 18;
const RELATED_POOL_LIMIT = 30;
const RELATED_OUTPUT_LIMIT = 12;

function normalizeGenre(genre?: string | null): string | undefined {
  const value = genre?.trim();
  if (!value) return undefined;
  return ANILIST_GENRE_BY_RUSSIAN[value] ?? value;
}

function normalizeToken(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedSet(values: Array<string | null | undefined>) {
  return new Set(
    values
      .map((value) => (typeof value === 'string' ? normalizeToken(value) : ''))
      .filter(Boolean),
  );
}

function overlapRatio(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;

  let shared = 0;
  for (const value of left) {
    if (right.has(value)) shared += 1;
  }

  return shared / Math.max(1, Math.min(left.size, right.size));
}

function tagsOf(anime: Anime) {
  const raw = anime.tags;
  if (!Array.isArray(raw)) return new Set<string>();

  return normalizedSet(
    raw
      .slice(0, 24)
      .map((tag: unknown) => {
        if (typeof tag === 'string') return tag;
        if (tag && typeof tag === 'object') {
          const row = tag as { name?: unknown };
          return typeof row.name === 'string' ? row.name : null;
        }
        return null;
      }),
  );
}

function studiosOf(anime: Anime) {
  const raw = anime.studios;
  const values: unknown[] = Array.isArray(raw)
    ? raw
    : raw &&
        typeof raw === 'object' &&
        Array.isArray((raw as { nodes?: unknown[] }).nodes)
      ? (raw as { nodes: unknown[] }).nodes
      : [];

  return normalizedSet(
    values.slice(0, 12).map((studio) => {
      if (typeof studio === 'string') return studio;
      if (studio && typeof studio === 'object') {
        const row = studio as {
          name?: unknown;
          node?: { name?: unknown };
        };
        if (typeof row.name === 'string') return row.name;
        if (typeof row.node?.name === 'string') return row.node.name;
      }
      return null;
    }),
  );
}

function formatKey(anime: Anime) {
  return normalizeToken(String(anime.format ?? anime.kind ?? ''));
}

function yearOf(anime: Anime) {
  const value = Number(anime.startDate?.year ?? 0);
  return Number.isSafeInteger(value) && value >= 1940 && value <= 2200
    ? value
    : null;
}

function episodesOf(anime: Anime) {
  const value = Number(anime.episodes ?? anime.episodesAired ?? 0);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function durationOf(anime: Anime) {
  const value = Number(anime.duration ?? 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function qualityScore(anime: Anime) {
  const raw = Number(anime.score ?? anime.averageScore ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 10 ? Math.min(1, raw / 100) : Math.min(1, raw / 10);
}

function proximityScore(
  left: number | null,
  right: number | null,
  tolerance: number,
) {
  if (left == null || right == null) return 0;
  const distance = Math.abs(left - right);
  return Math.max(0, 1 - distance / Math.max(1, tolerance));
}

function contextualScore(candidate: Anime, reference: Anime) {
  const referenceGenres = normalizedSet(reference.genres ?? []);
  const candidateGenres = normalizedSet(candidate.genres ?? []);
  const genreAffinity = overlapRatio(referenceGenres, candidateGenres);

  const referenceTags = tagsOf(reference);
  const candidateTags = tagsOf(candidate);
  const tagAffinity = overlapRatio(referenceTags, candidateTags);

  const referenceStudios = studiosOf(reference);
  const candidateStudios = studiosOf(candidate);
  const studioAffinity = overlapRatio(referenceStudios, candidateStudios);

  const formatAffinity =
    formatKey(reference) &&
    formatKey(reference) === formatKey(candidate)
      ? 1
      : 0;

  const yearAffinity = proximityScore(
    yearOf(reference),
    yearOf(candidate),
    8,
  );
  const episodeAffinity = proximityScore(
    episodesOf(reference),
    episodesOf(candidate),
    Math.max(12, Number(reference.episodes ?? 0) * 0.75),
  );
  const durationAffinity = proximityScore(
    durationOf(reference),
    durationOf(candidate),
    18,
  );

  return (
    genreAffinity * 52 +
    tagAffinity * 17 +
    studioAffinity * 10 +
    formatAffinity * 7 +
    yearAffinity * 5 +
    episodeAffinity * 4 +
    durationAffinity * 3 +
    qualityScore(candidate) * 2
  );
}

function uniqueContextCandidates(
  items: Anime[],
  reference: Anime,
) {
  const seen = new Set<number>([reference.id]);
  const referenceFamilies = new Set(
    recommendationFranchiseKeys(reference),
  );

  return items.filter((anime) => {
    if (
      !Number.isSafeInteger(anime.id) ||
      anime.id <= 0 ||
      seen.has(anime.id)
    ) {
      return false;
    }

    seen.add(anime.id);

    const candidateFamilies = recommendationFranchiseKeys(anime);
    if (
      referenceFamilies.size > 0 &&
      candidateFamilies.some((family) => referenceFamilies.has(family))
    ) {
      return false;
    }

    return true;
  });
}

async function loadGenrePool(reference: Anime) {
  const genres = [...new Set(
    (reference.genres ?? [])
      .map(normalizeGenre)
      .filter((value): value is string => Boolean(value)),
  )].slice(0, 2);

  if (!genres.length) return [];

  const settled = await Promise.allSettled(
    genres.map((genre) =>
      getAnimesWithShikimori({
        page: 1,
        limit: RELATED_POOL_PER_GENRE,
        order: 'popularity',
        genre,
      }),
    ),
  );

  return settled.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  );
}

async function loadRankedFallback() {
  try {
    return await getAnimesWithShikimori({
      page: 1,
      limit: RELATED_POOL_PER_GENRE,
      order: 'ranked',
    });
  } catch (error) {
    console.warn('Related anime ranked fallback failed:', error);
    return [];
  }
}

async function availabilityFiltered(
  filtered: Anime[],
) {
  const availability = await filterAnimeByAvailability(
    filtered,
    'catalog',
  );

  if (availability.refreshTargets.length > 0) {
    after(async () => {
      await refreshCatalogAvailabilityBatch(
        availability.refreshTargets,
        { limit: 4 },
      );
    });
  }

  return availability.items;
}

async function loadRelatedAnime(
  reference: Anime,
): Promise<Anime[]> {
  try {
    const genrePool = await loadGenrePool(reference);
    let candidates = uniqueContextCandidates(
      genrePool,
      reference,
    );

    if (candidates.length < RELATED_OUTPUT_LIMIT) {
      const fallback = await loadRankedFallback();
      candidates = uniqueContextCandidates(
        [...candidates, ...fallback],
        reference,
      );
    }

    const ranked = candidates
      .map((anime) => ({
        anime,
        score: contextualScore(anime, reference),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          qualityScore(right.anime) - qualityScore(left.anime) ||
          left.anime.id - right.anime.id,
      )
      .slice(0, RELATED_POOL_LIMIT)
      .map(({ anime }) => anime);

    const visible = await availabilityFiltered(ranked);
    return visible.slice(0, RELATED_OUTPUT_LIMIT);
  } catch (error) {
    console.warn('Contextual related anime failed:', error);

    const fallback = uniqueContextCandidates(
      await loadRankedFallback(),
      reference,
    );

    try {
      return (await availabilityFiltered(fallback))
        .slice(0, RELATED_OUTPUT_LIMIT);
    } catch (availabilityError) {
      console.warn(
        'Related anime availability fallback failed:',
        availabilityError,
      );
      return [];
    }
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
              key={`related-loading-${index}`}
              className="h-[310px] w-[170px] shrink-0 animate-pulse rounded-2xl bg-white/[0.04]"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default async function RelatedAnime({
  anime,
}: {
  anime: Anime;
}) {
  const items = await loadRelatedAnime(anime);

  if (items.length === 0) {
    return null;
  }

  return (
    <section
      className="border-t border-white/[0.04] py-10"
      data-related-strategy="context-v2"
    >
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="section-head">
          <div>
            <h2 className="section-title">Похожие по атмосфере</h2>
            <p className="mt-1 text-sm text-white/45">
              Жанры, теги, студия, формат и темп — без повторов этой франшизы
            </p>
          </div>

          <Link href="/search" className="section-link">
            Весь каталог →
          </Link>
        </div>

        <HomeAnimeRail
          items={items}
          ariaLabel="Похожие по атмосфере аниме"
        />
      </div>
    </section>
  );
}
