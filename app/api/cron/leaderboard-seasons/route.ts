import { NextResponse } from 'next/server';

import { finalizeRecentLeaderboardSeasons } from '@/lib/leaderboard-seasons-server';

import { isCronAuthorized } from '@/lib/server-request-auth';
import { createSystemJobObserver } from '@/lib/system-observability-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const observer = createSystemJobObserver('leaderboard-seasons');

  try {
    const seasons = await finalizeRecentLeaderboardSeasons();

    await observer.success({ seasons: seasons.length });

    return NextResponse.json(
      { ok: true, seasons },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    await observer.failed(error);
    console.error('[Leaderboard seasons cron]', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'leaderboard_seasons_cron_failed',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
