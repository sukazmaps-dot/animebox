import { requireAdmin } from '@/lib/admin-server';
import { ApiError, failure } from '@/lib/community-server';
import { getProfileMediaModerationHealth } from '@/lib/profile-media-health-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin(['owner', 'admin']);
    const health = await getProfileMediaModerationHealth();

    return Response.json(
      { ok: true, health },
      { headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' } },
    );
  } catch (error) {
    if (error instanceof ApiError) return failure(error);

    console.error('[Admin moderation health]', error);
    return Response.json(
      { ok: false, error: 'moderation_health_unavailable' },
      { status: 500 },
    );
  }
}
