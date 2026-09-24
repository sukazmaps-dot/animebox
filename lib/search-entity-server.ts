import 'server-only';

import { getAnimesWithShikimori } from '@/lib/combined-anime';
import {
  hydrateLocalAnimeHits,
  indexAnimeSearchDocuments,
  searchLocalAnimeIndex,
} from '@/lib/search-index-server';
import {
  buildEntityResolutionQueries,
  mergeAnimeCandidates,
  rankAnimeForSmartSearchDetailed,
} from '@/lib/smart-search';
import type { Anime } from '@/types/anime';

export type SearchEntityResolution = {
  seed: Anime | null;
  candidates: Anime[];
  resolvedBy: string | null;
  matchKind: string | null;
  score: number | null;
};

export async function resolveSearchEntity(
  rawTitle: string,
): Promise<SearchEntityResolution> {
  const queries = buildEntityResolutionQueries(rawTitle);
  const firstQuery = queries[0] ?? rawTitle;
  let local: Anime[] = [];
  let primary: Anime[] = [];

  const [localResult, providerResult] = await Promise.allSettled([
    searchLocalAnimeIndex(rawTitle, 12).then((hits) => hydrateLocalAnimeHits(hits)),
    getAnimesWithShikimori({
      page: 1,
      limit: 14,
      order: 'ranked',
      search: firstQuery,
    }),
  ]);

  if (localResult.status === 'fulfilled') {
    local = localResult.value;
  } else {
    console.warn('[Search entity] local resolution failed', localResult.reason);
  }

  if (providerResult.status === 'fulfilled') {
    primary = providerResult.value;
  } else {
    console.warn('[Search entity] provider primary failed', providerResult.reason);
  }

  let candidates = mergeAnimeCandidates(local, primary);
  let fallbackResolvedBy: string | null = null;

  if (candidates.length < 3 && queries.length > 1) {
    const fallbackResults = await Promise.allSettled(
      queries.slice(1, 3).map(async (query) => ({
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
      fallbackResolvedBy ??= result.value.query;
    }
  }

  const ranked = rankAnimeForSmartSearchDetailed(candidates, rawTitle);
  const top = ranked[0] ?? null;
  const localIds = new Set(local.map((anime) => anime.id));
  const resolvedBy = top
    ? localIds.has(top.anime.id)
      ? 'local-index-v2'
      : fallbackResolvedBy ?? firstQuery
    : null;

  void indexAnimeSearchDocuments(candidates.slice(0, 30)).catch(() => undefined);

  return {
    seed: top?.anime ?? null,
    candidates: ranked.map(({ anime }) => anime),
    resolvedBy,
    matchKind: top?.matchKind ?? null,
    score: top ? Math.round(top.score) : null,
  };
}
