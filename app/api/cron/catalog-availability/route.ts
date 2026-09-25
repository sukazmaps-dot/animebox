import { isCronAuthorized } from '@/lib/server-request-auth';
import { refreshStaleCatalogAvailability } from '@/lib/catalog-availability-server';
import { pruneSystemRequestMetrics } from '@/lib/request-observability-server';
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

  try {
    const result = await refreshStaleCatalogAvailability(24);
    const prunedRequestMetrics = await pruneSystemRequestMetrics(30);

    await observer.success({
      ...result,
      prunedRequestMetrics,
    });

    return Response.json(
      { ok: true, ...result, prunedRequestMetrics },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[Catalog availability cron]', error);
    await observer.failed(error);

    return Response.json(
      { ok: false, error: 'catalog_availability_refresh_failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
