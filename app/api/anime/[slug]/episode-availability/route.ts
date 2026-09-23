import { after, NextResponse } from 'next/server';

import { getAnimeByIdWithShikimori } from '@/lib/combined-anime';
import { getEpisodeProviderAvailability } from '@/lib/episode-provider-availability';
import { syncSeoEpisodeIndex } from '@/lib/seo-episode-index';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const animeId = Number(slug);

  if (!Number.isSafeInteger(animeId) || animeId <= 0) {
    return NextResponse.json({ error: 'Invalid anime id' }, { status: 400 });
  }

  try {
    const anime = await getAnimeByIdWithShikimori(animeId);
    if (!anime) {
      return NextResponse.json({ error: 'Anime not found' }, { status: 404 });
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

    const cacheControl =
      availability.status === 'available'
        ? 'public, s-maxage=300, stale-while-revalidate=900'
        : availability.status === 'unavailable'
          ? 'public, s-maxage=120, stale-while-revalidate=300'
          : 'public, s-maxage=30, stale-while-revalidate=60';

    return NextResponse.json(availability, {
      headers: { 'Cache-Control': cacheControl },
    });
  } catch (error) {
    console.error('[episode-availability] failed:', error);

    return NextResponse.json(
      {
        animeId,
        status: 'unknown',
        episodes: [],
        maxEpisode: null,
        providers: [],
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
      },
    );
  }
}
