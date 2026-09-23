import { requireAdmin } from '@/lib/admin-server';
import { ApiError, failure } from '@/lib/community-server';
import { getProductionHealthSnapshot } from '@/lib/production-health-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin(['owner', 'admin']);
    const health = await getProductionHealthSnapshot();

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

    console.error('[Admin production health]', error);
    return Response.json(
      { ok: false, error: 'production_health_unavailable' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  }
}
