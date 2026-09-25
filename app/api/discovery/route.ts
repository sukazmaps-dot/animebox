import { after, NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';

import { getAnimesWithShikimori } from '@/lib/combined-anime';
import { getAnimeRecommendationsById } from '@/lib/anilist';
import {
  discoveryGenreForProvider,
  rankSmartDiscoveryCandidates,
} from '@/lib/smart-discovery';
import { mergeAnimeCandidates } from '@/lib/smart-search';
import { classifySearchQuery } from '@/lib/search-query';
import { resolveSearchEntity } from '@/lib/search-entity-server';
import type { Anime } from '@/types/anime';
import {
  filterAnimeByAvailability,
  refreshCatalogAvailabilityBatch,
} from '@/lib/catalog-availability-server';
import {
  hydrateLocalAnimeHits,
  indexAnimeSearchDocuments,
  searchLocalAnimeIndex,
} from '@/lib/search-index-server';

import { observeApiRoute } from '@/lib/request-observability-server';

export const runtime = 'nodejs';

const loadCandidates = unstable_cache(
  async (genre: string | null, tag: string | null, page: number) => getAnimesWithShikimori({
    page,
    limit: 50,
    order: page % 2 === 0 ? 'popularity' : 'ranked',
    genre: genre || undefined,
    tags: tag ? [tag] : undefined,
  }),
  ['animebox-smart-discovery-v4-verified-playback'],
  { revalidate: 900 },
);

const resolveSeed = unstable_cache(
  resolveSearchEntity,
  ['animebox-intelligence-v1-seed-resolution'],
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

async function observedGET(request: NextRequest) {
  const rawQuery = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(40, Math.max(5, requestedLimit)) : 20;
  const classification = classifySearchQuery(rawQuery);
  const intent = classification.discoveryIntent;

  if (!rawQuery || classification.mode !== 'context') {
    return NextResponse.json(
      {
        items: [],
        intent,
        seed: null,
        meta: { queryMode: classification.mode },
      },
      { status: 400 },
    );
  }

  try {
    let seed: Anime | null = null;
    let seedCandidates: Anime[] = [];
    let resolvedBy: string | null = null;
    let seedMatchKind: string | null = null;
    let seedScore: number | null = null;

    if (intent.similarTo) {
      const resolution = await resolveSeed(intent.similarTo);
      seed = resolution.seed;
      seedCandidates = resolution.candidates;
      resolvedBy = resolution.resolvedBy;
      seedMatchKind = resolution.matchKind;
      seedScore = resolution.score;

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
              queryMode: classification.mode,
              seedMatchKind,
              seedScore,
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
    const primaryTag = intent.includeTags[0] ?? null;
    const secondaryTag = intent.includeTags[1] ?? null;

    let localContext: Anime[] = [];
    try {
      const localHits = await searchLocalAnimeIndex(
        intent.freeText || rawQuery,
        Math.max(10, limit),
      );
      localContext = await hydrateLocalAnimeHits(localHits);
    } catch (localError) {
      console.warn('[Smart Discovery local corpus]', localError);
    }

    // AniList's recommendation graph + genre/global pools run in parallel.
    // The graph gives "similar to X" semantic quality while global candidates
    // keep the result resilient when that graph or a localized genre fails.
    const firstPools = await Promise.allSettled([
      seed ? loadAniListRecommendations(seed.id) : Promise.resolve([] as Anime[]),
      loadCandidates(primaryGenre, primaryTag, 1),
      secondaryTag
        ? loadCandidates(null, secondaryTag, 1)
        : Promise.resolve([] as Anime[]),
      loadCandidates(null, null, 1),
    ]);

    const recommended = firstPools[0].status === 'fulfilled' ? firstPools[0].value : [];
    const first = firstPools[1].status === 'fulfilled' ? firstPools[1].value : [];
    const secondary = firstPools[2].status === 'fulfilled' ? firstPools[2].value : [];
    const globalFirst = firstPools[3].status === 'fulfilled' ? firstPools[3].value : [];
    let candidates = mergeUnique(localContext, seedCandidates, recommended, first, secondary, globalFirst)
      .filter((anime) => anime.id !== seed?.id);

    // One cached second page is enough for a much healthier pool without
    // turning every keystroke into a burst of upstream traffic.
    if (candidates.length < Math.max(limit * 2, 36)) {
      const secondPools = await Promise.allSettled([
        loadCandidates(primaryGenre, primaryTag, 2),
        loadCandidates(null, null, 2),
      ]);
      candidates = mergeUnique(
        candidates,
        secondPools[0].status === 'fulfilled' ? secondPools[0].value : [],
        secondPools[1].status === 'fulfilled' ? secondPools[1].value : [],
      ).filter((anime) => anime.id !== seed?.id);
    }

    const availability = await filterAnimeByAvailability(
      candidates,
      'catalog',
    );
    candidates = availability.items;

    if (availability.refreshTargets.length > 0) {
      after(async () => {
        await refreshCatalogAvailabilityBatch(
          availability.refreshTargets,
          { limit: 8 },
        );
      });
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

    void indexAnimeSearchDocuments(candidates.slice(0, 40)).catch(() => undefined);

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
          queryMode: classification.mode,
          seedMatchKind,
          seedScore,
          contextTags: intent.includeTags.slice(0, 3),
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
      {
        items: [],
        intent,
        seed: null,
        meta: {
          relaxed: false,
          seedResolved: false,
          queryMode: classification.mode,
        },
        error: 'discovery_failed',
      },
      { status: 502 },
    );
  }
}

export const GET = observeApiRoute('/api/discovery', observedGET);
