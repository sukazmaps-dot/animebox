import { NextResponse } from 'next/server';

import { reconcileAllPremiumLifecycle } from '@/lib/premium-server';
import { finalizeRecentLeaderboardSeasons } from '@/lib/leaderboard-seasons-server';
import { beginOperationalJob } from '@/lib/operational-job-server';
import { isCronAuthorized } from '@/lib/server-request-auth';
import { createSystemJobObserver } from '@/lib/system-observability-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const observer = createSystemJobObserver('premium-lifecycle');
  const permit = await beginOperationalJob('premium-lifecycle', {
    budgetMs: 52_000,
    leaseTtlSeconds: 90,
    // Entitlement lifecycle is a critical business job and continues in
    // brownout while non-essential background refreshes are paused.
    allowDuringBrownout: true,
  });

  if (!permit.allowed) {
    await observer.skipped(permit.reason, { degraded: permit.degraded });
    return NextResponse.json(
      { ok: true, skipped: true, reason: permit.reason },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get('limit') || '500');
    const requestedLimit = Number.isFinite(rawLimit)
      ? Math.min(500, Math.max(1, Math.round(rawLimit)))
      : 500;

    const result = await reconcileAllPremiumLifecycle(requestedLimit);
    const seasons = permit.shouldStop(6_000)
      ? []
      : await finalizeRecentLeaderboardSeasons().catch((error) => {
          console.error('[Leaderboard seasons cron]', error);
          return [];
        });

    const budgetExhausted = permit.shouldStop(2_000);
    const summary = {
      ...result,
      leaderboardSeasons: seasons.length,
      budgetExhausted,
      remainingMs: permit.remainingMs(),
    };

    if (budgetExhausted) {
      await observer.degraded('premium_lifecycle_budget_low', summary);
    } else {
      await observer.success(summary);
    }

    return NextResponse.json(
      { ok: true, ...summary },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    await observer.failed(error);
    console.error('[Premium lifecycle cron]', error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'premium_lifecycle_cron_failed',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    await permit.release();
  }
}
