import { NextRequest, NextResponse } from 'next/server';

import { enforceIpRateLimit } from '@/lib/api-rate-limit';
import { filterAnimeIdsByAvailability } from '@/lib/catalog-availability-server';
import { publicApiCacheHeaders } from '@/lib/edge-cache-policy';
import { observeApiRoute } from '@/lib/request-observability-server';
import {
  localAnimeSearchHitToAnime,
  searchLocalAnimeIndex,
} from '@/lib/search-index-server';

import { getSavedAnimeMetadata } from '@/lib/saved-catalog-server';
import { mergeAnimeMetadata } from '@/lib/anime-metadata-merge';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 18;
const MAX_LIMIT = 30;

async function observedGET(request: NextRequest) {
  const requestStartedAt = performance.now();
  const limited = await enforceIpRateLimit(request, {
    scope: 'search_instant_ip',
    limit: 180,
    windowSeconds: 60,
  });

  if (limited) return limited;
  const rateLimitMs = Math.max(0, Math.round(performance.now() - requestStartedAt));

  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (query.length < 2) {
    return NextResponse.json(
      {
        items: [],
        query,
        source: 'local-index-v2',
      },
      {
        headers: publicApiCacheHeaders({
          browserSeconds: 15,
          edgeSeconds: 120,
          staleWhileRevalidateSeconds: 300,
        }),
      },
    );
  }

  const requestedLimit = Number.parseInt(
    request.nextUrl.searchParams.get('limit') ?? String(DEFAULT_LIMIT),
    10,
  );
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_LIMIT, Math.max(4, requestedLimit))
    : DEFAULT_LIMIT;

  const startedAt = performance.now();

  try {
    const hits = await searchLocalAnimeIndex(query, limit);
    const lexicalMs = Math.max(0, Math.round(performance.now() - startedAt));
    const enrichmentStartedAt = performance.now();
    let metadataMs = 0;
    let availabilityMs = 0;
    const ids = hits.map(hit => hit.animeId);
    const [allowed, saved] = await Promise.all([
      filterAnimeIdsByAvailability(ids).then(rows => {
        availabilityMs = Math.max(0, Math.round(performance.now() - enrichmentStartedAt));
        return rows;
      }),
      getSavedAnimeMetadata(ids).then(rows => {
        metadataMs = Math.max(0, Math.round(performance.now() - enrichmentStartedAt));
        return rows;
      }),
    ]);
    const allowedIds = new Set(allowed);
    const savedById = new Map(saved.map(item => [item.id, item]));

    const filtered = hits
      .filter((hit) => allowedIds.has(hit.animeId))
      .slice(0, limit);
    const tookMs = Math.max(
      0,
      Math.round(performance.now() - startedAt),
    );

    return NextResponse.json(
      {
        items: filtered.map(hit => {
          const shell = localAnimeSearchHitToAnime(hit);
          const saved = savedById.get(hit.animeId);
          return saved ? mergeAnimeMetadata(saved, shell) : shell;
        }),
        query,
        source: 'local-index-v2',
        tookMs,
        timings: {rateLimitMs, lexicalMs, availabilityMs, metadataMs},
        matches: filtered.map((hit) => ({
          animeId: hit.animeId,
          score: Math.round(hit.score * 1000) / 1000,
          matchKind: hit.matchKind,
          matchedText: hit.matchedText,
        })),
      },
      {
        headers: {
          ...publicApiCacheHeaders({
            browserSeconds: 30,
            edgeSeconds: 180,
            staleWhileRevalidateSeconds: 600,
          }),
          'X-AnimeBox-Search-Path': 'instant-local-v1',
          'Server-Timing': `animebox_search_local;dur=${tookMs}, animebox_rate_limit;dur=${rateLimitMs}, animebox_lexical;dur=${lexicalMs}, animebox_availability;dur=${availabilityMs}, animebox_metadata;dur=${metadataMs}`,
        },
      },
    );
  } catch (error) {
    console.warn('[Instant search]', error);

    // The instant lane is an optimization only. Returning an empty successful
    // payload lets the authoritative /api/anime request continue normally.
    return NextResponse.json(
      {
        items: [],
        query,
        source: 'local-index-v2',
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-AnimeBox-Search-Path': 'instant-local-failed',
        },
      },
    );
  }
}

export const GET = observeApiRoute('/api/search/instant', observedGET);
