import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';

import { getAnimesWithShikimori } from '@/lib/combined-anime';
import type { AniListListOrder, GetAnimesOptions } from '@/lib/anilist';
import { findAnimeGenre } from '@/lib/anime-taxonomy';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 30;
const CACHE_SECONDS = 15 * 60;
const STALE_SECONDS = 24 * 60 * 60;

type CandidateMood =
  | 'any'
  | 'comfort'
  | 'tension'
  | 'emotion'
  | 'adventure';

type CandidateSource =
  | 'ranked'
  | 'popularity'
  | 'ongoing'
  | 'preferred_genre'
  | 'mood';

const MOOD_GENRES: Record<Exclude<CandidateMood, 'any'>, readonly string[]> = {
  comfort: ['Slice of Life', 'Comedy', 'Romance'],
  tension: ['Thriller', 'Mystery', 'Action'],
  emotion: ['Drama', 'Romance', 'Psychological'],
  adventure: ['Adventure', 'Fantasy', 'Action'],
};

function clampInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeMood(value: string | null): CandidateMood {
  if (
    value === 'comfort' ||
    value === 'tension' ||
    value === 'emotion' ||
    value === 'adventure'
  ) {
    return value;
  }
  return 'any';
}

function selectCandidateSource(input: {
  page: number;
  bucket: number;
  hasTasteGenre: boolean;
  mood: CandidateMood;
}): CandidateSource {
  const slot = (input.page - 1 + input.bucket) % 5;

  if (slot === 0 && input.hasTasteGenre) return 'preferred_genre';
  if (slot === 1) return 'ranked';
  if (slot === 2 && input.mood !== 'any') return 'mood';
  if (slot === 3) return 'popularity';
  if (slot === 4) return 'ongoing';

  return slot % 2 === 0 ? 'popularity' : 'ranked';
}

function sourceOptions(input: {
  source: CandidateSource;
  page: number;
  bucket: number;
  tasteGenre: string | null;
  mood: CandidateMood;
}): GetAnimesOptions {
  const { source, page, bucket, tasteGenre, mood } = input;
  const base: GetAnimesOptions = {
    page,
    order: source === 'ranked' ? 'ranked' : 'popularity',
  };

  if (source === 'ongoing') {
    return {
      ...base,
      order: 'popularity',
      status: 'ongoing',
    };
  }

  if (source === 'preferred_genre' && tasteGenre) {
    return {
      ...base,
      order: page % 2 === 0 ? 'popularity' : 'ranked',
      genres: [tasteGenre],
    };
  }

  if (source === 'mood' && mood !== 'any') {
    const genres = MOOD_GENRES[mood];
    const genre = genres[(page + bucket) % genres.length];
    return {
      ...base,
      order: page % 2 === 0 ? 'ranked' : 'popularity',
      genres: [genre],
    };
  }

  return base;
}

/*
 * Candidate pages are public data. We only use finite public context buckets
 * (canonical genre + one of five moods), never a user/session UUID, so pages
 * stay shareable across users and retain CDN/server cache efficiency.
 */
const getCachedCandidatePage = unstable_cache(
  async (
    page: number,
    limit: number,
    source: CandidateSource,
    tasteGenre: string | null,
    mood: CandidateMood,
    bucket: number,
  ) => {
    const options = sourceOptions({
      source,
      page,
      bucket,
      tasteGenre,
      mood,
    });
    options.limit = limit;

    return getAnimesWithShikimori(options);
  },
  ['animebox-recommendation-candidates-v5-multisource'],
  {
    revalidate: CACHE_SECONDS,
    tags: ['animebox-recommendation-candidates'],
  },
);

/**
 * Multi-source candidate endpoint for the infinite Smart Feed.
 *
 * Candidate retrieval and ranking are intentionally separate:
 * - this endpoint broadens recall with ranked/popular/ongoing/taste/mood pools;
 * - the client ranking layer applies personal exclusions, scoring and MMR.
 *
 * A unique recommendation session never enters the URL. The only context is a
 * 0..3 exploration bucket, one canonical genre and one finite mood value.
 */
export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, {
    scope: 'recommendations_ip',
    limit: 120,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const params = request.nextUrl.searchParams;

  const page = clampInteger(params.get('page'), 1, 1, 10_000);
  const limit = clampInteger(
    params.get('limit'),
    DEFAULT_LIMIT,
    5,
    MAX_LIMIT,
  );
  const bucket = clampInteger(params.get('bucket'), 0, 0, 3);
  const mood = normalizeMood(params.get('mood'));

  const requestedGenre = params.get('genre')?.trim() ?? '';
  const tasteGenre = requestedGenre
    ? findAnimeGenre(requestedGenre)?.value ?? null
    : null;

  const candidateSource = selectCandidateSource({
    page,
    bucket,
    hasTasteGenre: Boolean(tasteGenre),
    mood,
  });

  try {
    const items = await getCachedCandidatePage(
      page,
      limit,
      candidateSource,
      tasteGenre,
      mood,
      bucket,
    );
    const hasMore = items.length >= limit;

    return NextResponse.json(
      {
        items,
        page,
        nextPage: hasMore ? page + 1 : null,
        hasMore,
        bucket,
        candidateSource,
        tasteGenre,
        mood,
      },
      {
        headers: {
          'Cache-Control': `public, max-age=60, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
          'Vercel-CDN-Cache-Control': `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
        },
      },
    );
  } catch (error) {
    console.error('Recommendation candidate API error:', error);

    return NextResponse.json(
      {
        error: 'Не удалось загрузить следующую страницу рекомендаций',
      },
      {
        status: 502,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
