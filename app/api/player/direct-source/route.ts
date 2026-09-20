import { NextRequest, NextResponse } from 'next/server';
import { resolveDirectPlayerStreams } from '@/lib/direct-player-server';

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

export async function GET(request: NextRequest) {
  if (rateLimited(request)) {
    return NextResponse.json(
      { enabled: false, provider: 'Alloha Direct', streams: [], reason: 'rate_limited' },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const shikimoriId = Number(request.nextUrl.searchParams.get('shikimoriId'));
  const episode = Number(request.nextUrl.searchParams.get('episode'));

  if (!Number.isSafeInteger(shikimoriId) || shikimoriId <= 0 || !Number.isSafeInteger(episode) || episode <= 0) {
    return NextResponse.json(
      { enabled: false, provider: 'Alloha Direct', streams: [], reason: 'invalid_request' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const result = await resolveDirectPlayerStreams({
    shikimoriId,
    episode,
    signal: request.signal,
  });

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
