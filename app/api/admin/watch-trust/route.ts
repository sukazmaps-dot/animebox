import { requireAdmin } from '@/lib/admin-server';
import { ApiError, failure } from '@/lib/community-server';
import { getWatchTrustAdminSnapshot } from '@/lib/watch-trust-admin-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin(['owner', 'admin']);
    const trust = await getWatchTrustAdminSnapshot();

    return Response.json(
      { ok: true, trust },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof ApiError) return failure(error);

    console.error('[Admin watch trust]', error);
    return Response.json(
      { ok: false, error: 'watch_trust_unavailable' },
      {
        status: 500,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
}
