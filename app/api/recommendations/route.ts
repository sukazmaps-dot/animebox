import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';

import { getAnimesWithShikimori } from '@/lib/combined-anime';
import type { GetAnimesOptions } from '@/lib/anilist';
import { findAnimeGenre } from '@/lib/anime-taxonomy';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 30;
const MAX_PAGE = 10_000;
const CACHE_SECONDS = 15 * 60;
const STALE_SECONDS = 24 * 60 * 60;
const CURSOR_VERSION = 1;

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

type RecommendationCursorPayload = {
  v: typeof CURSOR_VERSION;
  p: number;
};

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

function encodeRecommendationCursor(page: number) {
  const payload: RecommendationCursorPayload = {
    v: CURSOR_VERSION,
    p: Math.min(MAX_PAGE, Math.max(1, Math.trunc(page))),
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeRecommendationCursor(value: string | null): number | null {
  if (!value || value.length > 96) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<RecommendationCursorPayload>;

    if (
      parsed.v !== CURSOR_VERSION ||
      !Number.isSafeInteger(parsed.p) ||
      Number(parsed.p) < 1 ||
      Number(parsed.p) > MAX_PAGE
    ) {
      return null;
    }

    return Number(parsed.p);
  } catch {
    return null;
  }
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

function fallbackSource(source: CandidateSource, page: number): CandidateSource {
  if (source === 'ranked') return 'popularity';
  if (source === 'popularity') return 'ranked';
  return page % 2 === 0 ? 'ranked' : 'popularity';
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
  ['animebox-recommendation-candidates-v6-cursor'],
  {
    revalidate: CACHE_SECONDS,
    tags: ['animebox-recommendation-candidates'],
  },
);

async function loadCandidatePage(input: {
  page: number;
  limit: number;
  source: CandidateSource;
  tasteGenre: string | null;
  mood: CandidateMood;
  bucket: number;
}) {
  const { page, limit, source, tasteGenre, mood, bucket } = input;

  try {
    const items = await getCachedCandidatePage(
      page,
      limit,
      source,
      tasteGenre,
      mood,
      bucket,
    );

    return {
      items,
      candidateSource: source,
      fallbackFrom: null as CandidateSource | null,
    };
  } catch (primaryError) {
    const fallback = fallbackSource(source, page);

    try {
      const items = await getCachedCandidatePage(
        page,
        limit,
        fallback,
        tasteGenre,
        mood,
        bucket,
      );

      console.warn(
        '[Recommendations] candidate source fallback',
        source,
        '->',
        fallback,
      );

      return {
        items,
        candidateSource: fallback,
        fallbackFrom: source,
      };
    } catch {
      throw primaryError;
    }
  }
}

/**
 * Multi-source candidate endpoint for the infinite Smart Feed.
 *
 * Candidate retrieval and ranking are intentionally separate:
 * - this endpoint broadens recall with ranked/popular/ongoing/taste/mood pools;
 * - the client ranking layer applies personal exclusions, scoring and diversity.
 *
 * A unique recommendation session never enters the URL. The only context is a
 * 0..3 exploration bucket, one canonical genre and one finite mood value.
 *
 * Cursor pagination is intentionally opaque and contains only the next public
 * catalogue page number. The legacy page query remains accepted so old clients
 * and the first bootstrap request keep working during rollout.
 */
export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, {
    scope: 'recommendations_ip',
    limit: 120,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const params = request.nextUrl.searchParams;
  const rawCursor = params.get('cursor');
  const cursorPage = decodeRecommendationCursor(rawCursor);

  if (rawCursor && cursorPage == null) {
    return NextResponse.json(
      { error: 'invalid_cursor' },
      {
        status: 400,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }

  const page =
    cursorPage ?? clampInteger(params.get('page'), 1, 1, MAX_PAGE);
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

  const requestedSource = selectCandidateSource({
    page,
    bucket,
    hasTasteGenre: Boolean(tasteGenre),
    mood,
  });

  try {
    const result = await loadCandidatePage({
      page,
      limit,
      source: requestedSource,
      tasteGenre,
      mood,
      bucket,
    });
    // The candidate list is filtered/localized after the upstream page is
    // fetched. A page can legitimately contain fewer than `limit` eligible
    // anime while later pages still exist, so "items.length < limit" must not
    // be interpreted as end-of-catalogue. Probe the next page until an empty
    // eligible page is reached.
    const hasMore = result.items.length > 0 && page < MAX_PAGE;
    const nextPage = hasMore ? page + 1 : null;
    const nextCursor =
      nextPage == null ? null : encodeRecommendationCursor(nextPage);

    return NextResponse.json(
      {
        items: result.items,
        page,
        nextPage,
        nextCursor,
        hasMore: nextCursor != null,
        bucket,
        candidateSource: result.candidateSource,
        fallbackFrom: result.fallbackFrom,
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
