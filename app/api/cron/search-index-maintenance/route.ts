import { beginOperationalJob } from '@/lib/operational-job-server';
import { isCronAuthorized } from '@/lib/server-request-auth';
import { repairSearchIndexCoverage } from '@/lib/search-index-maintenance-server';
import { createSystemJobObserver } from '@/lib/system-observability-server';

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

  const observer = createSystemJobObserver('search-index-maintenance', {
    service: 'cron',
  });
  const permit = await beginOperationalJob('search-index-maintenance', {
    budgetMs: 50_000,
    leaseTtlSeconds: 90,
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
    const result = await repairSearchIndexCoverage(750);

    if (result.migrationRequired) {
      await observer.degraded('search_index_migration_required', {
        processed: result.processed,
        coveragePct: result.after.coveragePct,
      });

      return Response.json(
        {
          ok: true,
          degraded: true,
          migrationRequired: true,
          result,
          remainingMs: permit.remainingMs(),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    await observer.success({
      processed: result.processed,
      beforeCoveragePct: result.before.coveragePct,
      afterCoveragePct: result.after.coveragePct,
      beforeRichCoveragePct: result.before.richCoveragePct,
      afterRichCoveragePct: result.after.richCoveragePct,
      remainingMs: permit.remainingMs(),
    });

    return Response.json(
      {
        ok: true,
        result,
        remainingMs: permit.remainingMs(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[Search index maintenance cron]', error);
    await observer.failed(error);

    return Response.json(
      {
        ok: false,
        error: 'search_index_maintenance_failed',
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      },
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
