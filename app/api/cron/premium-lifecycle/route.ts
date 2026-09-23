import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { reconcileAllPremiumLifecycle } from '@/lib/premium-server';
import { finalizeRecentLeaderboardSeasons } from '@/lib/leaderboard-seasons-server';
import { cleanupWatchPartyRooms } from '@/lib/watch-party-rooms-server';
import { cleanupApiRateBuckets } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const direct = request.headers.get('x-cron-secret')?.trim() ?? '';
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';

  return Boolean(
    expected &&
      ((direct && secureEqual(direct, expected)) ||
        (bearer && secureEqual(bearer, expected))),
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get('limit') || '500');
    const [roomsCleaned, rateBucketsCleaned] = await Promise.all([
      cleanupWatchPartyRooms().then(() => true).catch((error) => {
        console.error('[Watch party cleanup cron]', error);
        return false;
      }),
      cleanupApiRateBuckets().then(() => true).catch((error) => {
        console.error('[API rate bucket cleanup cron]', error);
        return false;
      }),
    ]);
    const result = await reconcileAllPremiumLifecycle(requestedLimit);
    const seasons = await finalizeRecentLeaderboardSeasons().catch((error) => {
      console.error('[Leaderboard seasons piggyback cron]', error);
      return [];
    });
    return NextResponse.json({ ok: true, ...result, leaderboardSeasons: seasons, roomsCleaned, rateBucketsCleaned });
  } catch (error) {
    console.error('[Premium lifecycle cron]', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'premium_lifecycle_cron_failed',
      },
      { status: 500 },
    );
  }
}
