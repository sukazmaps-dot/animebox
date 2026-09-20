import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';

import { getAnimesWithShikimori } from '@/lib/combined-anime';
import { getAnimeRecommendationsById } from '@/lib/anilist';
import {
  discoveryGenreForProvider,
  parseSmartDiscoveryQuery,
  rankSmartDiscoveryCandidates,
} from '@/lib/smart-discovery';
import {
  buildEntityResolutionQueries,
  mergeAnimeCandidates,
  rankAnimeForSmartSearch,
} from '@/lib/smart-search';
import type { Anime } from '@/types/anime';

export const runtime = 'nodejs';

const loadCandidates = unstable_cache(
  async (genre: string | null, page: number) => getAnimesWithShikimori({
    page,
    limit: 50,
    order: page % 2 === 0 ? 'popularity' : 'ranked',
    genre: genre || undefined,
  }),
  ['animebox-smart-discovery-v2-candidates'],
  { revalidate: 900 },
);

async function resolveSeedUncached(rawTitle: string) {
  const queries = buildEntityResolutionQueries(rawTitle);
  let candidates: Anime[] = [];
  let resolvedBy: string | null = null;

  // Healthy RU/EN title searches resolve in one request. Fuzzy variants are
  // only attempted after that request is weak, keeping normal search cheap.
  const firstQuery = queries[0];
  if (firstQuery) {
    try {
      const first = await getAnimesWithShikimori({
        page: 1,
        limit: 12,
        order: 'ranked',
        search: firstQuery,
      });
      candidates = first;
      if (first.length) resolvedBy = firstQuery;
    } catch (error) {
      console.warn('[Smart Discovery seed primary]', error);
    }
  }

  if (candidates.length < 2 && queries.length > 1) {
    const fallbackResults = await Promise.allSettled(
      queries.slice(1).map(async (query) => ({
        query,
        items: await getAnimesWithShikimori({
          page: 1,
          limit: 12,
          order: 'ranked',
          search: query,
        }),
      })),
    );

    for (const result of fallbackResults) {
      if (result.status !== 'fulfilled' || !result.value.items.length) continue;
      candidates = mergeAnimeCandidates(candidates, result.value.items);
      resolvedBy ??= result.value.query;
    }
  }

  const ranked = rankAnimeForSmartSearch(candidates, rawTitle);
  return {
    seed: ranked[0] ?? null,
    candidates: ranked,
    resolvedBy,
  };
}

const resolveSeed = unstable_cache(
  resolveSeedUncached,
  ['animebox-smart-discovery-v2-seed'],
  { revalidate: 3600 },
);

const loadAniListRecommendations = unstable_cache(
  async (animeId: number) => getAnimeRecommendationsById(animeId, 36),
  ['animebox-smart-discovery-v2-anilist-recommendations'],
  { revalidate: 3600 },
);

function mergeUnique(...groups: Anime[][]) {
  return mergeAnimeCandidates(...groups);
}

function compactSeed(seed: Anime | null) {
  if (!seed) return null;
  return {
    id: seed.id,
    slug: seed.slug ?? null,
    title: seed.title,
    russian: seed.russian ?? seed.title?.russian ?? null,
    episodes: seed.episodes ?? null,
    genres: seed.genres ?? [],
    startDate: seed.startDate ?? null,
    coverImage: seed.coverImage ?? seed.image ?? null,
  };
}

export async function GET(request: NextRequest) {
  const rawQuery = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(40, Math.max(5, requestedLimit)) : 20;
  const intent = parseSmartDiscoveryQuery(rawQuery);

  if (!rawQuery || !intent.isDiscovery) {
    return NextResponse.json({ items: [], intent, seed: null }, { status: 400 });
  }

  try {
    let seed: Anime | null = null;
    let seedCandidates: Anime[] = [];
    let resolvedBy: string | null = null;

    if (intent.similarTo) {
      const resolution = await resolveSeed(intent.similarTo);
      seed = resolution.seed;
      seedCandidates = resolution.candidates;
      resolvedBy = resolution.resolvedBy;

      if (!seed) {
        return NextResponse.json(
          {
            items: [],
            seed: null,
            intent,
            meta: {
              relaxed: false,
              resolvedBy,
              candidateCount: 0,
              seedResolved: false,
            },
          },
          {
            headers: {
              'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
            },
          },
        );
      }
    }

    const requestedGenre = intent.includeGenres[0] ?? seed?.genres?.[0] ?? null;
    const primaryGenre = discoveryGenreForProvider(requestedGenre);

    // AniList's recommendation graph + genre/global pools run in parallel.
    // The graph gives "similar to X" semantic quality while global candidates
    // keep the result resilient when that graph or a localized genre fails.
    const firstPools = await Promise.allSettled([
      seed ? loadAniListRecommendations(seed.id) : Promise.resolve([] as Anime[]),
      loadCandidates(primaryGenre, 1),
      loadCandidates(null, 1),
    ]);

    const recommended = firstPools[0].status === 'fulfilled' ? firstPools[0].value : [];
    const first = firstPools[1].status === 'fulfilled' ? firstPools[1].value : [];
    const globalFirst = firstPools[2].status === 'fulfilled' ? firstPools[2].value : [];
    let candidates = mergeUnique(seedCandidates, recommended, first, globalFirst)
      .filter((anime) => anime.id !== seed?.id);

    // One cached second page is enough for a much healthier pool without
    // turning every keystroke into a burst of upstream traffic.
    if (candidates.length < Math.max(limit * 2, 36)) {
      const secondPools = await Promise.allSettled([
        loadCandidates(primaryGenre, 2),
        loadCandidates(null, 2),
      ]);
      candidates = mergeUnique(
        candidates,
        secondPools[0].status === 'fulfilled' ? secondPools[0].value : [],
        secondPools[1].status === 'fulfilled' ? secondPools[1].value : [],
      ).filter((anime) => anime.id !== seed?.id);
    }

    let ranked = rankSmartDiscoveryCandidates(candidates, intent, { seed, strict: true });
    let relaxed = false;

    // Progressive fallback: a natural-language query should almost never end
    // in a dead empty state just because one secondary constraint was too
    // strict or metadata (episodes/year) is missing upstream.
    if (ranked.length === 0 && candidates.length > 0) {
      ranked = rankSmartDiscoveryCandidates(candidates, intent, { seed, strict: false });
      relaxed = ranked.length > 0;
    }

    return NextResponse.json(
      {
        items: ranked.slice(0, limit),
        seed: compactSeed(seed),
        intent,
        meta: {
          relaxed,
          resolvedBy,
          candidateCount: candidates.length,
          seedResolved: Boolean(seed),
        },
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=120, stale-while-revalidate=300',
          'Vary': 'Accept-Encoding',
        },
      },
    );
  } catch (error) {
    console.error('[Smart Discovery]', error);
    return NextResponse.json(
      { items: [], intent, seed: null, meta: { relaxed: false, seedResolved: false }, error: 'discovery_failed' },
      { status: 502 },
    );
  }
}
