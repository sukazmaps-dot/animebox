import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getAnimesWithShikimori,
} from '@/lib/combined-anime';
import {
  isCatalogMood,
  rankAnimeByCatalogMood,
} from '@/lib/catalog-moods';
import {
  parseAnimeSearchIntent,
  rankAnimeForSearchIntent,
} from '@/lib/search-intent';
import {
  buildSmartSearchFallbacks,
  mergeAnimeCandidates,
  rankAnimeForSmartSearch,
} from '@/lib/smart-search';

import type {
  GetAnimesOptions,
  AniListListOrder,
} from '@/lib/anilist';
import type { Anime } from '@/types/anime';
import { consumeIpRateLimit, rateLimitResponse } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
) {
  try {
    if (!(await consumeIpRateLimit(request, { scope: 'anime_catalog', limit: 90, windowSeconds: 60 }))) {
      return rateLimitResponse();
    }
  } catch (error) {
    console.error('[Anime catalog] rate limit unavailable', error);
    return NextResponse.json({ error: 'Каталог временно недоступен.' }, { status: 503 });
  }

  const params = request.nextUrl.searchParams;

  const requestedLimit = Number.parseInt(
    params.get('limit') ?? '20',
    10,
  );

  const requestedPage = Number.parseInt(
    params.get('page') ?? '1',
    10,
  );

  const limit = Number.isFinite(requestedLimit)
    ? Math.min(50, Math.max(1, requestedLimit))
    : 20;

  const page = Number.isFinite(requestedPage)
    ? Math.max(1, requestedPage)
    : 1;

  const orderRaw = params.get('order');
  const rawSearch = params.get('search')?.trim() || undefined;
  const searchIntent = rawSearch ? parseAnimeSearchIntent(rawSearch) : null;
  const search = searchIntent?.titleQuery || rawSearch;

  const statusRaw = params.get('status');
  const status =
    statusRaw === 'ongoing' || statusRaw === 'finished'
      ? statusRaw
      : undefined;

  const genreRaw = params.get('genre');
  const genresRaw = params.get('genres');
  const genres = (genresRaw || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 6);
  const requestedYear = Number.parseInt(params.get('year') || '', 10);
  const year =
    Number.isSafeInteger(requestedYear) &&
    requestedYear >= 1940 &&
    requestedYear <= new Date().getFullYear() + 2
      ? requestedYear
      : undefined;
  const moodRaw = params.get('mood');
  const mood = isCatalogMood(moodRaw) ? moodRaw : 'any';

  /*
   * Mood is a second ranking axis, not a fake genre. When it is active we
   * retrieve a wider candidate pool, keep AniList/Shikimori genre filtering,
   * then rerank those candidates by atmosphere.
   */
  const hasStructuredSearch = Boolean(
    searchIntent?.seasonNumber || searchIntent?.partNumber || searchIntent?.episodeNumber,
  );

  const upstreamLimit = hasStructuredSearch
    ? Math.min(50, Math.max(limit * 3, 40))
    : mood === 'any'
      ? limit
      : Math.min(50, Math.max(limit * 3, 30));

  const options: GetAnimesOptions = {
    limit: upstreamLimit,
    page,
    order:
      orderRaw === 'popularity'
        ? ('popularity' as AniListListOrder)
        : 'ranked',
    status,
    search,
    genre: genres.length === 0 ? genreRaw ?? undefined : undefined,
    genres: genres.length > 0 ? genres : undefined,
    year,
  };

  try {
    const primary = await getAnimesWithShikimori(options);
    let candidates: Anime[] = primary;
    let fallbackUsed: string | null = null;

    /*
     * Smart fallback is intentionally bounded. Healthy searches make exactly
     * one provider request. Only weak/empty first-page searches get one extra
     * attempt (two only when the first result set was completely empty).
     * This keeps AniList/Shikimori rate pressure predictable.
     */
    if (rawSearch && search && page === 1 && primary.length < 4) {
      const fallbacks = buildSmartSearchFallbacks(rawSearch, search);
      const attempts = primary.length === 0 ? fallbacks.slice(0, 2) : fallbacks.slice(0, 1);

      for (const fallback of attempts) {
        const extra = await getAnimesWithShikimori({
          ...options,
          page: 1,
          search: fallback,
          limit: Math.min(50, Math.max(upstreamLimit, 20)),
        });

        if (extra.length > 0) {
          candidates = mergeAnimeCandidates(candidates, extra);
          fallbackUsed ??= fallback;
        }

        if (candidates.length >= Math.min(limit, 8)) break;
      }
    }

    const smartRanked = rawSearch
      ? rankAnimeForSmartSearch(candidates, searchIntent?.titleQuery || rawSearch)
      : candidates;
    const intentRanked = searchIntent
      ? rankAnimeForSearchIntent(smartRanked, searchIntent)
      : smartRanked;
    const anime = rankAnimeByCatalogMood(intentRanked, mood).slice(0, limit);

    return NextResponse.json(
      {
        anime,
        ...(rawSearch
          ? {
              searchMeta: {
                requested: rawSearch,
                understoodAs: searchIntent?.titleQuery || rawSearch,
                fallbackUsed,
              },
            }
          : {}),
      },
      {
        headers: {
          'Cache-Control':
            rawSearch?.trim()
              ? 'private, max-age=60, stale-while-revalidate=120'
              : 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600',
        },
      },
    );
  } catch (error) {
    console.error('Anime list API error:', error);

    return NextResponse.json(
      {
        error: 'Не удалось загрузить список аниме',
      },
      { status: 502 },
    );
  }
}
