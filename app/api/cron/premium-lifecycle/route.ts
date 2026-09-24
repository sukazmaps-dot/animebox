import { NextResponse } from 'next/server';

import { reconcileAllPremiumLifecycle } from '@/lib/premium-server';
import { finalizeRecentLeaderboardSeasons } from '@/lib/leaderboard-seasons-server';
import { cleanupWatchPartyRooms } from '@/lib/watch-party-rooms-server';
import { cleanupApiRateBuckets } from '@/lib/api-rate-limit';

import { isCronAuthorized } from '@/lib/server-request-auth';
import { createSystemJobObserver } from '@/lib/system-observability-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const observer = createSystemJobObserver('premium-lifecycle');

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
    const summary = {
      ...result,
      leaderboardSeasons: seasons.length,
      roomsCleaned,
      rateBucketsCleaned,
    };

    if (!roomsCleaned || !rateBucketsCleaned) {
      await observer.degraded('maintenance_cleanup_partial', summary);
    } else {
      await observer.success(summary);
    }

    return NextResponse.json({ ok: true, ...result, leaderboardSeasons: seasons, roomsCleaned, rateBucketsCleaned });
  } catch (error) {
    await observer.failed(error);
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
