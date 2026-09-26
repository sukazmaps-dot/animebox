import { refreshStaleCatalogAvailability } from '@/lib/catalog-availability-server';
import { beginOperationalJob } from '@/lib/operational-job-server';
import { isCronAuthorized } from '@/lib/server-request-auth';
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

  const observer = createSystemJobObserver('catalog-availability', {
    service: 'cron',
  });
  const permit = await beginOperationalJob('catalog-availability', {
    budgetMs: 50_000,
    leaseTtlSeconds: 90,
  });

  if (!permit.allowed) {
    await observer.skipped(permit.reason, {
      degraded: permit.degraded,
    });
    return Response.json(
      { ok: true, skipped: true, reason: permit.reason },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const result = await refreshStaleCatalogAvailability(24);

    await observer.success({
      ...result,
      remainingMs: permit.remainingMs(),
    });

    return Response.json(
      {
        ok: true,
        ...result,
        remainingMs: permit.remainingMs(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[Catalog availability cron]', error);
    await observer.failed(error);

    return Response.json(
      { ok: false, error: 'catalog_availability_refresh_failed' },
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
