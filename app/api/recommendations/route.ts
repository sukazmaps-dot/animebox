import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';

import { getAnimesWithShikimori } from '@/lib/combined-anime';
import type { AniListListOrder, GetAnimesOptions } from '@/lib/anilist';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 30;
const CACHE_SECONDS = 15 * 60;
const STALE_SECONDS = 24 * 60 * 60;

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

/*
 * Candidate pages are public data. Personal ranking still happens in the
 * browser from AnimeBox's local taste/history signals, so all users can share
 * the same AniList + Shikimori candidate cache.
 *
 * unstable_cache also deduplicates the expensive localization merge on the
 * server. page/limit/order are included in the cache key automatically as
 * function arguments.
 */
const getCachedCandidatePage = unstable_cache(
  async (
    page: number,
    limit: number,
    order: AniListListOrder,
  ) => {
    const options: GetAnimesOptions = {
      limit,
      page,
      order,
    };

    return getAnimesWithShikimori(options);
  },
  ['animebox-recommendation-candidates-v4'],
  {
    revalidate: CACHE_SECONDS,
    tags: ['animebox-recommendation-candidates'],
  },
);

/**
 * Candidate endpoint for the infinite Smart Feed.
 *
 * We intentionally do NOT put the UUID recommendation session into the URL.
 * A unique session query parameter would destroy shared CDN/server caching.
 * Instead the client sends only a tiny deterministic bucket (0..3), which
 * keeps exploration stable while producing at most four cache variants.
 */
export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, {
    scope: 'recommendations_ip', limit: 120, windowSeconds: 60,
  });
  if (limited) return limited;

  const params = request.nextUrl.searchParams;

  const page = clampInteger(params.get('page'), 1, 1, 10_000);
  const limit = clampInteger(params.get('limit'), DEFAULT_LIMIT, 5, MAX_LIMIT);
  const bucket = clampInteger(params.get('bucket'), 0, 0, 3);

  /*
   * About every fifth page is discovery/popularity rather than score-ranked.
   * The bucket offsets the discovery page per session without creating a
   * unique cache key for every user/session.
   */
  const explorationPage = (page + bucket) % 5 === 0;
  const order: AniListListOrder = explorationPage ? 'popularity' : 'ranked';

  try {
    const items = await getCachedCandidatePage(page, limit, order);
    const hasMore = items.length >= limit;

    return NextResponse.json(
      {
        items,
        page,
        nextPage: hasMore ? page + 1 : null,
        hasMore,
        bucket,
      },
      {
        headers: {
          /* Browser may reuse briefly; Vercel/CDN keeps it much longer. */
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
