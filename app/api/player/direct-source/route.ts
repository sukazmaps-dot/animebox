import { after, NextRequest, NextResponse } from 'next/server';

import { COPYRIGHT_RESTRICTED_MESSAGE } from '@/lib/copyright-server';
import {
  getProviderDecision,
  recordProviderResult,
} from '@/lib/player-source-control';
import { resolveDirectPlayerStreams } from '@/lib/direct-player-server';

import { observeApiRoute } from '@/lib/request-observability-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 40;
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: NextRequest) {
  return (
    request.headers.get('x-vercel-forwarded-for') ||
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
    .split(',')[0]
    .trim()
    .slice(0, 80);
}

function rateLimited(request: NextRequest) {
  const now = Date.now();
  const key = clientKey(request);
  const current = requestBuckets.get(key);

  if (!current || current.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  current.count += 1;

  if (requestBuckets.size > 2_000) {
    for (const [bucketKey, bucket] of requestBuckets) {
      if (bucket.resetAt <= now) requestBuckets.delete(bucketKey);
    }
  }

  return current.count > RATE_LIMIT;
}

async function observedGET(request: NextRequest) {
  if (rateLimited(request)) {
    return NextResponse.json(
      {
        enabled: false,
        provider: 'Alloha Direct',
        streams: [],
        reason: 'rate_limited',
      },
      {
        status: 429,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  const shikimoriId = Number(
    request.nextUrl.searchParams.get('shikimoriId'),
  );
  const animeId = Number(request.nextUrl.searchParams.get('animeId'));
  const season = Number(request.nextUrl.searchParams.get('season'));
  const episode = Number(request.nextUrl.searchParams.get('episode'));

  if (
    !Number.isSafeInteger(shikimoriId) ||
    shikimoriId <= 0 ||
    !Number.isSafeInteger(animeId) ||
    animeId <= 0 ||
    !Number.isSafeInteger(episode) ||
    episode <= 0
  ) {
    return NextResponse.json(
      {
        enabled: false,
        provider: 'Alloha Direct',
        streams: [],
        reason: 'invalid_request',
      },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  const providerDecision = await getProviderDecision('direct', {
    animeId,
    season:
      Number.isSafeInteger(season) && season > 0
        ? season
        : null,
    episode,
  });

  if (!providerDecision.enabled) {
    const restricted = providerDecision.reason === 'copyright_restricted';

    return NextResponse.json(
      {
        enabled: false,
        provider: 'AnimeBox Direct',
        streams: [],
        reason: restricted
          ? 'copyright_restricted'
          : 'provider_disabled',
        message: restricted
          ? COPYRIGHT_RESTRICTED_MESSAGE
          : 'AnimeBox Direct временно недоступен.',
      },
      {
        status: restricted ? 451 : 503,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
        },
      },
    );
  }

  const providerStartedAt = Date.now();

  const result = await resolveDirectPlayerStreams({
    shikimoriId,
    episode,
    signal: request.signal,
  });

  const providerFailure = Boolean(
    result.reason &&
      (
        result.reason === 'provider_unavailable' ||
        result.reason === 'invalid_provider_endpoint' ||
        result.reason.startsWith('provider_http_')
      ),
  );

  after(async () => {
    await recordProviderResult('direct', {
      ok: !providerFailure,
      latencyMs: Date.now() - providerStartedAt,
      reason: providerFailure ? result.reason : null,
    });
  });

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const GET = observeApiRoute('/api/player/direct-source', observedGET);
