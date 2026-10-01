import { requireAdmin } from '@/lib/admin-server';
import { ApiError, failure } from '@/lib/community-server';
import { getSearchPerformanceSnapshot } from '@/lib/search-performance-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdmin(['owner', 'admin']);

    const url = new URL(request.url);
    const requestedHours = Number.parseInt(
      url.searchParams.get('hours') ?? '24',
      10,
    );
    const health = await getSearchPerformanceSnapshot(
      Number.isFinite(requestedHours) ? requestedHours : 24,
    );

    return Response.json(
      { ok: true, health },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  } catch (error) {
    if (error instanceof ApiError) return failure(error);

    console.error('[Admin search performance]', error);
    return Response.json(
      { ok: false, error: 'search_performance_unavailable' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  }
}
