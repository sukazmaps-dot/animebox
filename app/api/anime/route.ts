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
import {
  hydrateLocalAnimeHits,
  indexAnimeSearchDocuments,
  searchLocalAnimeIndex,
} from '@/lib/search-index-server';

import type {
  GetAnimesOptions,
  AniListListOrder,
} from '@/lib/anilist';
import type { Anime } from '@/types/anime';
import {
  privateNoStoreHeaders,
  publicApiCacheHeaders,
} from '@/lib/edge-cache-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
) {
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
    statusRaw === 'ongoing' ||
    statusRaw === 'finished' ||
    statusRaw === 'upcoming'
      ? statusRaw
      : undefined;

  const formatRaw = params.get('format');
  const format =
    formatRaw === 'TV' ||
    formatRaw === 'MOVIE' ||
    formatRaw === 'OVA' ||
    formatRaw === 'ONA' ||
    formatRaw === 'SPECIAL'
      ? formatRaw
      : undefined;

  const seasonRaw = params.get('season');
  const season =
    seasonRaw === 'WINTER' ||
    seasonRaw === 'SPRING' ||
    seasonRaw === 'SUMMER' ||
    seasonRaw === 'FALL'
      ? seasonRaw
      : undefined;

  const genreRaw = params.get('genre');
  const genresRaw = params.get('genres');
  const genres = (genresRaw || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 6);
  const tags = (params.get('tags') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 6);
  const studioNames = (params.get('studios') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 4);
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
        : orderRaw === 'updated'
          ? ('updated' as AniListListOrder)
          : 'ranked',
    status,
    search,
    genre: genres.length === 0 ? genreRaw ?? undefined : undefined,
    genres: genres.length > 0 ? genres : undefined,
    tags: tags.length > 0 ? tags : undefined,
    studioNames: studioNames.length > 0 ? studioNames : undefined,
    year,
    format,
    season,
  };

  try {
    const primary = await getAnimesWithShikimori(options);
    let candidates: Anime[] = primary;
    let fallbackUsed: string | null = null;
    let localIndexUsed = false;

    if (rawSearch && page === 1) {
      try {
        const localHits = await searchLocalAnimeIndex(rawSearch, 12);
        if (localHits.length) {
          const localAnime = await hydrateLocalAnimeHits(localHits);
          candidates = mergeAnimeCandidates(localAnime, candidates);
          localIndexUsed = localAnime.length > 0;
        }
      } catch (localSearchError) {
        console.warn('[Anime search local index]', localSearchError);
      }
    }

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

    // Search index writes are best-effort and bounded. Never fail a catalogue
    // request because the auxiliary retrieval corpus is temporarily unavailable.
    void indexAnimeSearchDocuments(candidates.slice(0, 30)).catch(() => undefined);

    return NextResponse.json(
      {
        anime,
        ...(rawSearch
          ? {
              searchMeta: {
                requested: rawSearch,
                understoodAs: searchIntent?.titleQuery || rawSearch,
                fallbackUsed,
                localIndexUsed,
              },
            }
          : {}),
      },
      {
        headers: rawSearch?.trim()
          ? publicApiCacheHeaders({
              browserSeconds: 15,
              edgeSeconds: 120,
              staleWhileRevalidateSeconds: 300,
            })
          : publicApiCacheHeaders({
              browserSeconds: 60,
              edgeSeconds: 600,
              staleWhileRevalidateSeconds: 1800,
            }),
      },
    );
  } catch (error) {
    console.error('Anime list API error:', error);

    return NextResponse.json(
      {
        error: 'Не удалось загрузить список аниме',
      },
      {
        status: 502,
        headers: privateNoStoreHeaders(),
      },
    );
  }
}
