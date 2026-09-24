import { requireAdmin } from '@/lib/admin-server';
import { ApiError, failure } from '@/lib/community-server';
import { getSystemHealthSnapshot } from '@/lib/system-health-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin(['owner', 'admin']);
    const health = await getSystemHealthSnapshot();

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

    console.error('[Admin system health]', error);

    const message = error instanceof Error ? error.message : String(error);
    const migrationMissing =
      /system_job_runs|system_incidents|schema cache|relation/i.test(message);

    return Response.json(
      {
        ok: false,
        error: migrationMissing
          ? 'system_health_migration_required'
          : 'system_health_unavailable',
      },
      {
        status: migrationMissing ? 503 : 500,
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  }
}
