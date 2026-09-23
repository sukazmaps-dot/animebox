import { NextResponse } from 'next/server';

import { finalizeRecentLeaderboardSeasons } from '@/lib/leaderboard-seasons-server';

import { isCronAuthorized } from '@/lib/server-request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const seasons = await finalizeRecentLeaderboardSeasons();

    return NextResponse.json(
      { ok: true, seasons },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
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
