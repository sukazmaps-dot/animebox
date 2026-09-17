import { NextRequest, NextResponse } from 'next/server';

import {
  filterKodikResultsForEpisode,
  searchKodikByShikimoriId,
} from '@/lib/kodik-episode-availability';

export async function GET(request: NextRequest) {
  const shikimoriIdParam = request.nextUrl.searchParams.get('shikimoriId');
  const episodeParam = request.nextUrl.searchParams.get('episode');

  if (!shikimoriIdParam || !/^\d+$/.test(shikimoriIdParam)) {
    return NextResponse.json(
      { error: 'Missing or invalid shikimoriId' },
      { status: 400 },
    );
  }

  const shikimoriId = Number(shikimoriIdParam);
  const episode = episodeParam == null ? null : Number(episodeParam);

  if (
    episodeParam != null &&
    (!Number.isSafeInteger(episode) || Number(episode) < 1)
  ) {
    return NextResponse.json(
      { error: 'Invalid episode' },
      { status: 400 },
    );
  }

  try {
    const results = await searchKodikByShikimoriId(shikimoriId, {
      noStore: episode != null,
    });
    const filtered =
      episode == null
        ? {
            status: 'available' as const,
            maxEpisode: null,
            results,
          }
        : filterKodikResultsForEpisode(results, episode);

    const seen = new Set<string>();
    const translations = filtered.results
      .map((item) => ({
        title: item.translation?.title?.trim() || 'Озвучка',
        url: item.link?.trim() || '',
        type: 'kodik' as const,
        translationId: item.translation?.id ?? null,
      }))
      .filter((item) => item.url.length > 0)
      .filter((item) => {
        const key = item.translationId
          ? `id:${item.translationId}`
          : `title:${item.title.toLowerCase()}`;

        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    return NextResponse.json(
      {
        name: 'Kodik',
        status:
          episode == null
            ? translations.length > 0
              ? 'available'
              : 'unavailable'
            : filtered.status,
        maxEpisode: filtered.maxEpisode,
        translations,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  } catch (error) {
    console.error('[Kodik] request failed:', error);

    return NextResponse.json(
      { error: 'Failed to fetch Kodik', status: 'unknown' },
      { status: 502 },
    );
  }
}
