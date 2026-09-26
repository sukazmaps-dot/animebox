import { after, NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';

import { getAnimesWithShikimori } from '@/lib/combined-anime';
import type { GetAnimesOptions } from '@/lib/anilist';
import { findAnimeGenre } from '@/lib/anime-taxonomy';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';
import {
  filterAnimeByAvailability,
  refreshCatalogAvailabilityBatch,
} from '@/lib/catalog-availability-server';

import { observeApiRoute } from '@/lib/request-observability-server';
import {
  privateNoStoreHeaders,
  publicApiCacheHeaders,
} from '@/lib/edge-cache-policy';
import { runtimeFeatureDecision } from '@/lib/runtime-controls-server';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 30;
const MAX_PAGE = 10_000;
const CACHE_SECONDS = 15 * 60;
const FILTERED_RESPONSE_CACHE_SECONDS = 5 * 60;
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
  ['animebox-recommendation-candidates-v7-verified-playback'],
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
  const fallback = fallbackSource(source, page);

  try {
    const items = await getCachedCandidatePage(
      page,
      limit,
      source,
      tasteGenre,
      mood,
      bucket,
    );

    // A narrow source can legitimately run out before the broad catalogue.
    // Empty ongoing/mood/genre pages must not terminate the shared cursor.
    if (items.length > 0 || fallback === source) {
      return {
        items,
        candidateSource: source,
        fallbackFrom: null as CandidateSource | null,
      };
    }

    const fallbackItems = await getCachedCandidatePage(
      page,
      limit,
      fallback,
      tasteGenre,
      mood,
      bucket,
    );

    if (fallbackItems.length > 0) {
      console.info(
        '[Recommendations] empty candidate source fallback',
        source,
        '->',
        fallback,
        'page',
        page,
      );
    }

    return {
      items: fallbackItems,
      candidateSource: fallback,
      fallbackFrom: source,
    };
  } catch (primaryError) {
    if (fallback === source) throw primaryError;

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
async function observedGET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, {
    scope: 'recommendations_ip',
    limit: 120,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const runtimeControl = await runtimeFeatureDecision(
    'recommendations',
    { considerLocalPressure: true },
  );
  if (!runtimeControl.allowed) {
    return NextResponse.json(
      {
        error: 'feature_temporarily_unavailable',
        feature: 'recommendations',
        reason: runtimeControl.reason,
      },
      {
        status: 503,
        headers: {
          ...privateNoStoreHeaders(),
          'Retry-After': '30',
          'X-AnimeBox-Degraded': runtimeControl.reason ?? 'admin_disabled',
        },
      },
    );
  }

  const brownout = runtimeControl.brownout;
  const params = request.nextUrl.searchParams;
  const rawCursor = params.get('cursor');
  const cursorPage = decodeRecommendationCursor(rawCursor);

  if (rawCursor && cursorPage == null) {
    return NextResponse.json(
      { error: 'invalid_cursor' },
      {
        status: 400,
        headers: privateNoStoreHeaders(),
      },
    );
  }

  const page =
    cursorPage ?? clampInteger(params.get('page'), 1, 1, MAX_PAGE);
  const limit = clampInteger(
    params.get('limit'),
    brownout ? 10 : DEFAULT_LIMIT,
    5,
    brownout ? 12 : MAX_LIMIT,
  );
  const bucket = clampInteger(params.get('bucket'), 0, 0, 3);
  const mood = normalizeMood(params.get('mood'));

  const requestedGenre = params.get('genre')?.trim() ?? '';
  const tasteGenre = requestedGenre
    ? findAnimeGenre(requestedGenre)?.value ?? null
    : null;

  const requestedSource: CandidateSource = brownout
    ? (page % 2 === 0 ? 'popularity' : 'ranked')
    : selectCandidateSource({
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
    const availability = await filterAnimeByAvailability(
      result.items,
      'recommendations',
    );

    if (
      !brownout &&
      runtimeControl.snapshot.features.background_jobs &&
      availability.refreshTargets.length > 0
    ) {
      after(async () => {
        await refreshCatalogAvailabilityBatch(
          availability.refreshTargets,
          { limit: 8 },
        );
      });
    }

    // Short filtered pages and empty narrow-source pages are not EOF. The
    // client already performs bounded empty-page hops, so a page containing
    // only confirmed unavailable titles simply advances to the next cursor.
    const hasMore = result.items.length > 0 && page < MAX_PAGE;
    const nextPage = hasMore ? page + 1 : null;
    const nextCursor =
      nextPage == null ? null : encodeRecommendationCursor(nextPage);

    return NextResponse.json(
      {
        items: availability.items,
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
          ...publicApiCacheHeaders({
            browserSeconds: 30,
            edgeSeconds: FILTERED_RESPONSE_CACHE_SECONDS,
            staleWhileRevalidateSeconds: STALE_SECONDS,
          }),
          'X-AnimeBox-Cache-Profile': 'recommendations-public-v1',
          ...(brownout ? { 'X-AnimeBox-Degraded': 'brownout' } : {}),
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
        headers: privateNoStoreHeaders(),
      },
    );
  }
}

export const GET = observeApiRoute('/api/recommendations', observedGET);
