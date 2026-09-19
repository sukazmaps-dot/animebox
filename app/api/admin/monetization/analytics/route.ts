import { requireAdmin } from '@/lib/admin-server';
import { ApiError, failure } from '@/lib/community-server';
import { getMonetizationDashboard } from '@/lib/monetization-analytics-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdmin(['owner', 'admin']);

    const url = new URL(request.url);
    const days = Number(url.searchParams.get('days') || '30');
    if (days !== 7 && days !== 30) {
      return Response.json({ ok: false, error: 'invalid_range' }, { status: 400 });
    }

    const dashboard = await getMonetizationDashboard(days);
    return Response.json(
      { ok: true, dashboard },
      { headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' } },
    );
  } catch (error) {
    if (error instanceof ApiError) return failure(error);
    console.error('[Admin monetization analytics]', error);
    const message = error instanceof Error ? error.message : 'analytics_unavailable';
    const migrationMissing = /get_monetization_dashboard|monetization_events|schema cache/i.test(message);

    return Response.json(
      {
        ok: false,
        error: migrationMissing ? 'analytics_migration_required' : 'analytics_unavailable',
      },
      { status: migrationMissing ? 503 : 500 },
    );
  }
}
