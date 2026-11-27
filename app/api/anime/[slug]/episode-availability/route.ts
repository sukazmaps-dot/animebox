import { after, NextResponse } from 'next/server';

import { resolveAnimeRoute } from '@/lib/anime-route';
import {getLocalAnimeDetailFallback} from '@/lib/anime-localization-server';
import { getEpisodeProviderAvailability } from '@/lib/episode-provider-availability';
import { syncSeoEpisodeIndex } from '@/lib/seo-episode-index';

export const runtime = 'nodejs';

function availabilityCacheHeaders(edgeSeconds: number, swrSeconds: number): Record<string, string> {
  const edgeValue = `public, max-age=${edgeSeconds}, stale-while-revalidate=${swrSeconds}`;
  return {
    'Cache-Control': `public, max-age=0, s-maxage=${edgeSeconds}, stale-while-revalidate=${swrSeconds}`,
    'CDN-Cache-Control': edgeValue,
    'Vercel-CDN-Cache-Control': edgeValue,
    'Cloudflare-CDN-Cache-Control': edgeValue,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const animeId = Number(slug);

  if (!Number.isSafeInteger(animeId) || animeId <= 0) {
    return NextResponse.json(
      { error: 'Invalid anime id' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  try {
    const local = await getLocalAnimeDetailFallback(animeId);
    const anime = local && (local.idMal || local.mal_id)
      ? local
      : await resolveAnimeRoute(String(animeId));
    if (!anime) {
      return NextResponse.json(
        { error: 'Anime not found' },
        { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]);
    const availability = await getEpisodeProviderAvailability(anime, { signal });

    if (availability.status === 'available' && availability.episodes.length) {
      after(async () => {
        try {
          await syncSeoEpisodeIndex(anime, availability);
        } catch (indexError) {
          console.warn('[episode-availability] SEO index sync failed:', indexError);
        }
      });
    }

    const headers =
      availability.status === 'available'
        ? availabilityCacheHeaders(300, 900)
        : availability.status === 'unavailable'
          ? availabilityCacheHeaders(120, 300)
          : availabilityCacheHeaders(30, 60);

    return NextResponse.json(availability, { headers });
  } catch (error) {
    console.error('[episode-availability] failed:', error);

    return NextResponse.json(
      {
        animeId,
        status: 'unknown',
        reason: error instanceof Error && /Timeout|Abort/.test(error.name)
          ? 'provider_timeout'
          : 'availability_check_failed',
        episodes: [],
        maxEpisode: null,
        providers: [],
      },
      {
        status: 200,
        headers: availabilityCacheHeaders(15, 30),
      },
    );
  }
}
