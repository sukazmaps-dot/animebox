import { after, NextRequest, NextResponse } from 'next/server';

import { COPYRIGHT_RESTRICTED_MESSAGE } from '@/lib/copyright-server';
import {
  claimProviderHalfOpenProbe,
  getProviderDecision,
  recordProviderResult,
} from '@/lib/player-source-control';
import { resolveDirectPlayerStreams } from '@/lib/direct-player-server';

import { observeApiRoute } from '@/lib/request-observability-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 40;
const MAX_REQUEST_BUCKETS = 2_000;
const REQUEST_BUCKET_SWEEP_MS = 30_000;
const requestBuckets = new Map<string, { count: number; resetAt: number }>();
let nextRequestBucketSweepAt = 0;

function sweepExpiredRequestBuckets(now: number) {
  if (now < nextRequestBucketSweepAt) return;
  nextRequestBucketSweepAt = now + REQUEST_BUCKET_SWEEP_MS;

  for (const [key, bucket] of requestBuckets) {
    if (bucket.resetAt <= now) requestBuckets.delete(key);
  }
}

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
  sweepExpiredRequestBuckets(now);

  const key = clientKey(request);
  const current = requestBuckets.get(key);

  if (current && current.resetAt > now) {
    current.count += 1;
    return current.count > RATE_LIMIT;
  }

  if (current) requestBuckets.delete(key);

  if (requestBuckets.size >= MAX_REQUEST_BUCKETS) {
    // Keep the saturated path O(1): the regular sweep above owns cleanup.
    // Reject new identities until expired buckets are removed by that sweep.
    if (requestBuckets.size >= MAX_REQUEST_BUCKETS) return true;
  }

  requestBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
  return false;
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

  const recoveryPermit = await claimProviderHalfOpenProbe(
    'direct',
    providerDecision,
  );

  if (!recoveryPermit.allowed) {
    return NextResponse.json(
      {
        enabled: true,
        provider: 'AnimeBox Direct',
        streams: [],
        reason: 'provider_recovering',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
          'Retry-After': '2',
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
  const serverBusy = result.reason === 'server_busy';

  if (!serverBusy) {
    const providerResult = {
      ok: !providerFailure,
      latencyMs: Date.now() - providerStartedAt,
      reason: providerFailure ? result.reason : null,
    };

    if (providerDecision.halfOpenProbe) {
      await recordProviderResult('direct', providerResult);
    } else {
      after(async () => {
        await recordProviderResult('direct', providerResult);
      });
    }
  }

  return NextResponse.json(result, {
    status: serverBusy ? 503 : 200,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      ...(serverBusy ? { 'Retry-After': '1' } : {}),
    },
  });
}

export const GET = observeApiRoute('/api/player/direct-source', observedGET);
