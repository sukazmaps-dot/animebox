import { cleanupApiRateBuckets } from '@/lib/api-rate-limit';
import { beginOperationalJob } from '@/lib/operational-job-server';
import { pruneOperationalData } from '@/lib/production-readiness-server';
import { isCronAuthorized } from '@/lib/server-request-auth';
import { createSystemJobObserver } from '@/lib/system-observability-server';
import { cleanupWatchPartyRooms } from '@/lib/watch-party-rooms-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function run(request: Request) {
  if (!isCronAuthorized(request)) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const observer = createSystemJobObserver('production-maintenance', {
    service: 'cron',
  });
  const permit = await beginOperationalJob('production-maintenance', {
    budgetMs: 52_000,
    leaseTtlSeconds: 90,
    // Retention/cleanup reduces pressure, so it is safe and useful in brownout.
    allowDuringBrownout: true,
  });

  if (!permit.allowed) {
    await observer.skipped(permit.reason, {
      degraded: permit.degraded,
    });

    return Response.json(
      {
        ok: true,
        skipped: true,
        reason: permit.reason,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const results = await Promise.allSettled([
      pruneOperationalData(),
      cleanupWatchPartyRooms().then(() => true),
      cleanupApiRateBuckets().then(() => true),
    ]);

    const prune =
      results[0].status === 'fulfilled'
        ? results[0].value
        : null;
    const roomsCleaned =
      results[1].status === 'fulfilled' && results[1].value === true;
    const rateBucketsCleaned =
      results[2].status === 'fulfilled' && results[2].value === true;

    const summary = {
      prune,
      roomsCleaned,
      rateBucketsCleaned,
      remainingMs: permit.remainingMs(),
    };

    const degraded =
      results.some((result) => result.status === 'rejected') ||
      permit.shouldStop(2_000);

    if (degraded) {
      for (const result of results) {
        if (result.status === 'rejected') {
          console.error('[Production maintenance]', result.reason);
        }
      }
      await observer.degraded('maintenance_partial', summary);
    } else {
      await observer.success(summary);
    }

    return Response.json(
      {
        ok: true,
        degraded,
        ...summary,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[Production maintenance cron]', error);
    await observer.failed(error);
    return Response.json(
      { ok: false, error: 'production_maintenance_failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    await permit.release();
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
