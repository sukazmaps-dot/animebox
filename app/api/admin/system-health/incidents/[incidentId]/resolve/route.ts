import {
  requireAdminMutation,
  writeAdminAudit,
} from '@/lib/admin-server';
import {
  adminClient,
  ApiError,
  assertBrowserMutationRequest,
  failure,
} from '@/lib/community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ incidentId: string }> },
) {
  try {
    assertBrowserMutationRequest(request);
    const { user, role } = await requireAdminMutation(
      request,
      ['owner', 'admin'],
    );
    const { incidentId } = await context.params;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        incidentId,
      )
    ) {
      throw new ApiError(400, 'Некорректный incident id.');
    }

    const now = new Date().toISOString();
    const { data, error } = await adminClient()
      .from('system_incidents')
      .update({
        status: 'resolved',
        resolved_at: now,
        updated_at: now,
      })
      .eq('id', incidentId)
      .eq('status', 'open')
      .select('id,fingerprint,service,severity,title')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new ApiError(404, 'Инцидент уже закрыт или не найден.');

    await writeAdminAudit({
      actorId: user.id,
      actorRole: role,
      action: 'system_incident_resolved',
      targetType: 'system_incident',
      targetId: incidentId,
      details: {
        fingerprint: data.fingerprint,
        service: data.service,
        severity: data.severity,
        title: data.title,
      },
      request,
    });

    return Response.json(
      { ok: true, incidentId },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof ApiError) return failure(error);

    console.error('[Admin system health incident resolve]', error);
    return Response.json(
      { ok: false, error: 'incident_resolve_failed' },
      {
        status: 500,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
}
