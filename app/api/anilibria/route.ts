import { after, NextRequest, NextResponse } from 'next/server';
import { resolveAnimeRoute } from '@/lib/anime-route';
import { findAnimeRouteById } from '@/lib/anime-registry';
import {
  collectEpisodePages,
  episodeOrdinal,
  exactReleaseTitle,
  isRecord,
  pageItems,
} from '@/lib/provider-episodes';
import { extractHlsVideos } from '@/lib/anilibria';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';
import { COPYRIGHT_RESTRICTED_MESSAGE } from '@/lib/copyright-server';
import {
  claimProviderHalfOpenProbe,
  getProviderDecision,
  recordProviderResult,
} from '@/lib/player-source-control';

import { observeApiRoute } from '@/lib/request-observability-server';
import {
  isTransientUpstreamResponse,
  isUpstreamPressureError,
  runWithUpstreamBudget,
} from '@/lib/upstream-resilience-server';

export const runtime = 'nodejs';

const API_BASES = [
  'https://aniliberty.top/api/v1',
  'https://anilibria.top/api/v1',
  'https://api.anilibria.app/api/v1',
];

async function observedGET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, {
    scope: 'anilibria_lookup_ip', limit: 120, windowSeconds: 60,
  });
  if (limited) return limited;

  const slug = request.nextUrl.searchParams.get('slug') || '';
  const episode = Number(request.nextUrl.searchParams.get('episode'));

  if (!slug || !Number.isSafeInteger(episode) || episode < 1) {
    return NextResponse.json({ reason: 'invalid_request' }, { status: 400 });
  }

  // Resolve the anime from the slug itself. On Vercel this works without a
  // persistent SQLite file because production slugs contain the AniList id.
  const anime = await resolveAnimeRoute(slug);
  if (!anime) {
    return NextResponse.json({ reason: 'unknown_slug' }, { status: 404 });
  }

  const routeRecord = findAnimeRouteById(anime.id);
  const titleData = anime.title as Record<string, string | null | undefined>;
  const titles = [
    ...new Set(
      Object.values(titleData).filter(
        (value): value is string => typeof value === 'string' && Boolean(value.trim()),
      ),
    ),
  ];

  const providerSeason = routeRecord?.provider_season || anime.providerSeason || 1;
  const requestedSeason = request.nextUrl.searchParams.get('season');

  const providerDecision = await getProviderDecision('aniliberty', {
    animeId: anime.id,
    season: providerSeason,
    episode,
  });

  if (!providerDecision.enabled) {
    const restricted = providerDecision.reason === 'copyright_restricted';

    return NextResponse.json(
      {
        hls: [],
        episodes: [],
        externalPlayer: null,
        reason: restricted
          ? 'copyright_restricted'
          : 'provider_disabled',
        message: restricted
          ? COPYRIGHT_RESTRICTED_MESSAGE
          : 'AniLiberty временно недоступен.',
      },
      {
        status: restricted ? 451 : 503,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }

  if (requestedSeason && Number(requestedSeason) !== providerSeason) {
    return NextResponse.json({ reason: 'stale_season_selection' }, { status: 409 });
  }

  const recoveryPermit = await claimProviderHalfOpenProbe(
    'aniliberty',
    providerDecision,
  );

  if (!recoveryPermit.allowed) {
    return NextResponse.json(
      {
        hls: [],
        episodes: [],
        externalPlayer: null,
        reason: 'provider_recovering',
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
      await recordProviderResult('aniliberty', result);
      return;
    }

    after(async () => {
      await recordProviderResult('aniliberty', result);
    });
  }
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(9_000)]);
  let uncertain = false;
  let reason = 'not_found';

  for (const base of API_BASES) {
    const fetchJson = async (url: string): Promise<unknown> => {
      const attemptSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(2_800),
      ]);
      const response = await runWithUpstreamBudget(
        'aniliberty',
        () =>
          fetch(url, {
            headers: { Accept: 'application/json' },
            signal: attemptSignal,
            next: { revalidate: 120 },
            redirect: 'error',
          }),
        {
          signal,
          isFailure: isTransientUpstreamResponse,
        },
      );

      if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
      return response.json();
    };

    try {
      let alias = routeRecord?.provider_alias || null;

      if (!alias) {
        const matches = new Map<string, unknown>();

        for (const title of titles) {
          const url = new URL(`${base}/app/search/releases`);
          url.searchParams.set('query', title);
          const candidates = pageItems(await fetchJson(url.href));

          for (const item of candidates) {
            if (!isRecord(item) || !exactReleaseTitle(item, titles)) continue;
            const key = item.alias;
            if (typeof key === 'string' && key) matches.set(key, item);
          }

          if (matches.size) break;
        }

        if (matches.size > 1) {
          uncertain = true;
          reason = 'ambiguous_release';
          continue;
        }

        alias = matches.keys().next().value || null;
      }

      if (!alias) continue;

      const endpoint = `${base}/anime/releases/${encodeURIComponent(alias)}`;
      const response = await fetchJson(endpoint);
      const root = isRecord(response) && isRecord(response.data) ? response.data : response;

      if (!isRecord(root) || (!routeRecord?.provider_alias && !exactReleaseTitle(root, titles))) {
        uncertain = true;
        reason = 'release_mismatch';
        continue;
      }

      if (!Array.isArray(root.episodes) && !isRecord(root.episodes)) {
        uncertain = true;
        reason = 'unknown_episode_list';
        continue;
      }

      const all = await collectEpisodePages(root.episodes, endpoint, fetchJson);
      const episodes = all.map(episodeOrdinal).filter((n): n is number => n !== null);
      const selected = all.find((item) => episodeOrdinal(item) === episode);
      const hls = selected ? extractHlsVideos(selected, new URL(base).origin) : [];

      await reportProviderAttempt({
        ok: true,
        latencyMs: Date.now() - providerStartedAt,
      });

      return NextResponse.json(
        {
          slug: anime.slug,
          title: titleData.romaji || titleData.english || titleData.russian,
          season: providerSeason,
          releaseAlias: alias,
          episodes,
          hls,
          externalPlayer: null,
          reason: hls.length ? '' : 'episode_unavailable',
        },
        { headers: { 'Cache-Control': 'private, max-age=60' } },
      );
    } catch (error) {
      uncertain = true;

      if (isUpstreamPressureError(error)) {
        reason = 'server_busy';
        break;
      }

      reason = 'upstream_error';
      if (signal.aborted) break;
    }
  }

  if (reason !== 'server_busy') {
    await reportProviderAttempt({
      ok: reason !== 'upstream_error',
      latencyMs: Date.now() - providerStartedAt,
      reason: reason === 'upstream_error' ? reason : null,
    });
  }

  const serverBusy = reason === 'server_busy';

  return NextResponse.json(
    {
      hls: [],
      episodes: [],
      externalPlayer: null,
      reason: uncertain ? reason : 'not_found',
    },
    {
      status: uncertain ? 503 : 200,
      headers: {
        'Cache-Control': 'no-store',
        ...(serverBusy ? { 'Retry-After': '1' } : {}),
      },
    },
  );
}

export const GET = observeApiRoute('/api/anilibria', observedGET);
