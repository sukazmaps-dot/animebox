import { NextResponse } from 'next/server';

import { finalizeRecentLeaderboardSeasons } from '@/lib/leaderboard-seasons-server';

import { beginOperationalJob } from '@/lib/operational-job-server';
import { optionalServerSecret } from '@/lib/env/server';
import { secureServerSecretEqual } from '@/lib/server-request-auth';

import { isCronAuthorized } from '@/lib/server-request-auth';
import { createSystemJobObserver } from '@/lib/system-observability-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorized(request) && !secureServerSecretEqual(optionalServerSecret('LEADERBOARD_CRON_SECRET'), request.headers.get('x-leaderboard-cron-secret')?.trim())) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const observer = createSystemJobObserver('leaderboard-seasons');

  const permit = await beginOperationalJob('leaderboard-seasons', { budgetMs: 48_000, leaseTtlSeconds: 90, allowDuringBrownout: true });
  if (!permit.allowed) {
    await observer.skipped(permit.reason);
    return NextResponse.json({ ok: true, skipped: true, reason: permit.reason }, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const seasons = await finalizeRecentLeaderboardSeasons(new Date(), () => permit.shouldStop(8_000));

    if (permit.shouldStop(8_000)) await observer.degraded('leaderboard_budget_low', { seasons: seasons.length });
    else await observer.success({ seasons: seasons.length });

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
  } finally {
    await permit.release();
  }
}
