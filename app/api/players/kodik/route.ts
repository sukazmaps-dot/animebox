import { after, NextRequest, NextResponse } from 'next/server';

import {
  filterKodikResultsForEpisode,
  searchKodikByShikimoriId,
} from '@/lib/kodik-episode-availability';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';
import { resolveAnimeRoute } from '@/lib/anime-route';
import { recordEpisodePlayerUrl } from '@/lib/episode-timeline-server';
import { COPYRIGHT_RESTRICTED_MESSAGE } from '@/lib/copyright-server';
import {
  claimProviderHalfOpenProbe,
  getProviderDecision,
  recordProviderResult,
} from '@/lib/player-source-control';

import { observeApiRoute } from '@/lib/request-observability-server';
import {
  isUpstreamPressureError,
  upstreamPressureReason,
} from '@/lib/upstream-resilience-server';

async function observedGET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, {
    scope: 'kodik_lookup_ip', limit: 180, windowSeconds: 60,
  });
  if (limited) return limited;

  const shikimoriIdParam = request.nextUrl.searchParams.get('shikimoriId');
  const episodeParam = request.nextUrl.searchParams.get('episode');
  const animeIdParam = request.nextUrl.searchParams.get('animeId');
  const seasonParam = request.nextUrl.searchParams.get('season');

  if (!shikimoriIdParam || !/^\d+$/.test(shikimoriIdParam)) {
    return NextResponse.json(
      { error: 'Missing or invalid shikimoriId' },
      { status: 400 },
    );
  }

  const shikimoriId = Number(shikimoriIdParam);
  const episode = episodeParam == null ? null : Number(episodeParam);
  const animeId = animeIdParam == null ? null : Number(animeIdParam);
  const season = seasonParam == null ? null : Number(seasonParam);

  if (
    episodeParam != null &&
    (!Number.isSafeInteger(episode) || Number(episode) < 1)
  ) {
    return NextResponse.json(
      { error: 'Invalid episode' },
      { status: 400 },
    );
  }

  const providerDecision = await getProviderDecision('kodik', {
    animeId,
    season:
      season != null && Number.isSafeInteger(season) && season > 0
        ? season
        : null,
    episode,
  });

  if (!providerDecision.enabled) {
    const restricted = providerDecision.reason === 'copyright_restricted';
    return NextResponse.json(
      {
        name: 'Kodik',
        status: 'unavailable',
        maxEpisode: null,
        translations: [],
        reason: restricted
          ? 'copyright_restricted'
          : 'provider_disabled',
        message: restricted
          ? COPYRIGHT_RESTRICTED_MESSAGE
          : 'Источник Kodik временно недоступен.',
      },
      {
        status: restricted ? 451 : 503,
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  }

  const recoveryPermit = await claimProviderHalfOpenProbe(
    'kodik',
    providerDecision,
  );

  if (!recoveryPermit.allowed) {
    return NextResponse.json(
      {
        name: 'Kodik',
        status: 'unknown',
        maxEpisode: null,
        translations: [],
        reason: 'provider_recovering',
        message: 'Kodik восстанавливается. Повторите попытку через несколько секунд.',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'private, no-store',
          'Retry-After': '2',
        },
      },
    );
  }

  const providerStartedAt = Date.now();

  async function reportProviderAttempt(result: {
    ok: boolean;
    latencyMs?: number | null;
    reason?: string | null;
  }) {
    if (providerDecision.halfOpenProbe) {
      await recordProviderResult('kodik', result);
      return;
    }

    after(async () => {
      await recordProviderResult('kodik', result);
    });
  }

  try {
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(6_500),
    ]);
    const results = await searchKodikByShikimoriId(shikimoriId, {
      noStore: episode != null,
      signal,
    });

    await reportProviderAttempt({
      ok: true,
      latencyMs: Date.now() - providerStartedAt,
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
          ? 'id:' + item.translationId
          : 'title:' + item.title.toLowerCase();

        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    if (
      episode != null &&
      animeId != null &&
      Number.isSafeInteger(animeId) &&
      animeId > 0 &&
      translations[0]?.url
    ) {
      const playerUrl = translations[0].url;

      after(async () => {
        try {
          const anime = await resolveAnimeRoute(String(animeId));
          const expectedMalId = Number(anime?.idMal ?? anime?.mal_id ?? 0);

          if (anime && expectedMalId === shikimoriId) {
            await recordEpisodePlayerUrl({
              animeId,
              episode,
              playerUrl,
            });
          }
        } catch (cacheError) {
          console.warn('[Kodik] Video SEO player cache skipped:', cacheError);
        }
      });
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
    if (isUpstreamPressureError(error)) {
      console.warn('[Kodik] upstream pressure shield engaged:', {
        reason: upstreamPressureReason(error),
      });

      return NextResponse.json(
        {
          error: 'Kodik temporarily busy',
          status: 'unknown',
          reason: 'server_busy',
        },
        {
          status: 503,
          headers: {
            'Cache-Control': 'private, no-store',
            'Retry-After': '1',
          },
        },
      );
    }

    console.error('[Kodik] request failed:', error);

    await reportProviderAttempt({
      ok: false,
      latencyMs: Date.now() - providerStartedAt,
      reason: error instanceof Error ? error.message : 'kodik_request_failed',
    });

    return NextResponse.json(
      { error: 'Failed to fetch Kodik', status: 'unknown' },
      { status: 502 },
    );
  }
}

export const GET = observeApiRoute('/api/players/kodik', observedGET);
