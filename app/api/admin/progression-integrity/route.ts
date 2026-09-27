import { requireAdmin } from '@/lib/admin-server';
import { ApiError, failure } from '@/lib/community-server';
import { getProgressionIntegritySnapshot } from '@/lib/progression-integrity-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin(['owner', 'admin']);
    const integrity = await getProgressionIntegritySnapshot();

    return Response.json(
      { ok: true, integrity },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof ApiError) return failure(error);

    console.error('[Admin progression integrity]', error);
    return Response.json(
      { ok: false, error: 'progression_integrity_unavailable' },
      {
        status: 500,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
}
