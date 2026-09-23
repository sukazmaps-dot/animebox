import { NextRequest, NextResponse } from 'next/server';

import {
  filterKodikResultsForEpisode,
  searchKodikByShikimoriId,
} from '@/lib/kodik-episode-availability';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';
import { resolveAnimeRoute } from '@/lib/anime-route';
import { recordEpisodePlayerUrl } from '@/lib/episode-timeline-server';

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, {
    scope: 'kodik_lookup_ip', limit: 180, windowSeconds: 60,
  });
  if (limited) return limited;

  const shikimoriIdParam = request.nextUrl.searchParams.get('shikimoriId');
  const episodeParam = request.nextUrl.searchParams.get('episode');
  const animeIdParam = request.nextUrl.searchParams.get('animeId');

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

    if (
      episode != null &&
      animeIdParam &&
      /^\d+$/.test(animeIdParam) &&
      translations[0]?.url
    ) {
      const animeId = Number(animeIdParam);

      if (Number.isSafeInteger(animeId) && animeId > 0) {
        try {
          const anime = await resolveAnimeRoute(String(animeId));
          const expectedMalId = Number(anime?.idMal ?? anime?.mal_id ?? 0);

          if (anime && expectedMalId === shikimoriId) {
            await recordEpisodePlayerUrl({
              animeId,
              episode,
              playerUrl: translations[0].url,
            });
          }
        } catch (cacheError) {
          console.warn('[Kodik] Video SEO player cache skipped:', cacheError);
        }
      }
    }

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
