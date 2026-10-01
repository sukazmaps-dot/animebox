import {
  requireAdminMutation,
  writeAdminAudit,
} from '@/lib/admin-server';
import { ApiError, failure } from '@/lib/community-server';
import { repairSearchIndexCoverage } from '@/lib/search-index-maintenance-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const auth = await requireAdminMutation(
      request,
      ['owner', 'admin'],
    );
    const result = await repairSearchIndexCoverage(2_000);

    if (result.migrationRequired) {
      return Response.json(
        {
          ok: false,
          error: 'search_index_migration_required',
          result,
        },
        {
          status: 503,
          headers: { 'Cache-Control': 'private, no-store' },
        },
      );
    }

    await writeAdminAudit({
      actorId: auth.user.id,
      actorRole: auth.role,
      action: 'search_index_repaired',
      targetType: 'search_index',
      targetId: 'anime_search_documents',
      details: {
        processed: result.processed,
        beforeCoveragePct: result.before.coveragePct,
        afterCoveragePct: result.after.coveragePct,
        beforeRichCoveragePct: result.before.richCoveragePct,
        afterRichCoveragePct: result.after.richCoveragePct,
      },
      request,
    });

    return Response.json(
      {
        ok: true,
        result,
      },
      {
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  } catch (error) {
    if (error instanceof ApiError) return failure(error);

    console.error('[Admin search index repair]', error);

    return Response.json(
      {
        ok: false,
        error: 'search_index_repair_failed',
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
}
