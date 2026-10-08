import { requireAdmin } from '@/lib/admin-server';
import { ApiError, response } from '@/lib/community-server';
import { collectReliabilitySnapshot } from '@/lib/reliability-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin(['owner', 'admin']);
    return response({ ok: true, snapshot: await collectReliabilitySnapshot() });
  } catch (error) {
    if (error instanceof ApiError) return response({ ok: false, error: error.message }, error.status);
    return response({ ok: false, error: 'Диагностика временно недоступна.' }, 503);
  }
}
