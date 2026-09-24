import { NextRequest, NextResponse } from 'next/server';

import { enforceIpRateLimit } from '@/lib/api-rate-limit';
import { animeHref } from '@/lib/anime-url';
import { getAnimesWithShikimori } from '@/lib/combined-anime';
import {
  indexAnimeSearchDocuments,
  searchLocalAnimeSuggestions,
} from '@/lib/search-index-server';
import { rankAnimeForSmartSearch } from '@/lib/smart-search';
import {
  classifySearchQuery,
  shouldBootstrapSearchProvider,
} from '@/lib/search-query';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, {
    scope: 'search_suggestions_ip',
    limit: 90,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) {
    return NextResponse.json({ items: [] });
  }

  const rawLimit = Number.parseInt(
    request.nextUrl.searchParams.get('limit') ?? '6',
    10,
  );
  const limit = Number.isFinite(rawLimit)
    ? Math.min(8, Math.max(3, rawLimit))
    : 6;

  try {
    const classification = classifySearchQuery(query);
    let local = await searchLocalAnimeSuggestions(query, limit);

    // Prefixes normally stay completely local. Provider lookup only bootstraps
    // the corpus when a reasonably specific query has almost no indexed hits.
    if (
      local.length < 2 &&
      shouldBootstrapSearchProvider(classification)
    ) {
      try {
        const provider = await getAnimesWithShikimori({
          page: 1,
          limit: 8,
          order: 'ranked',
          search: query,
        });
        const ranked = rankAnimeForSmartSearch(provider, query).slice(0, 8);
        await indexAnimeSearchDocuments(ranked);
        local = await searchLocalAnimeSuggestions(query, limit);
      } catch (providerError) {
        console.warn('[Search suggestions provider fallback]', providerError);
      }
    }

    return NextResponse.json(
      {
        items: local.slice(0, limit).map((item) => ({
          id: item.animeId,
          title: item.title,
          href: animeHref({
            id: item.animeId,
            slug: item.slug,
          }),
          posterUrl: item.posterUrl,
          genres: item.genres,
          confidence: Math.round(item.score * 100),
          matchKind: item.matchKind,
          matchedText: item.matchedText,
        })),
      },
      {
        headers: {
          'Cache-Control':
            'public, max-age=20, s-maxage=180, stale-while-revalidate=300',
        },
      },
    );
  } catch (error) {
    console.error('[Search suggestions]', error);
    return NextResponse.json(
      { items: [] },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
}
