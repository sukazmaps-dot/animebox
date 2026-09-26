import {
  requireAdmin,
  requireAdminMutation,
  writeAdminAudit,
} from '@/lib/admin-server';
import {
  ApiError,
  failure,
  readJsonBody,
} from '@/lib/community-server';
import {
  getRuntimeControlSnapshot,
  setRuntimeControl,
  type RuntimeControlKey,
} from '@/lib/runtime-controls-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONTROL_KEYS = new Set<RuntimeControlKey>([
  'platform_mode',
  'recommendations',
  'smart_discovery',
  'watch_together',
  'community_writes',
  'background_jobs',
]);

function validControlKey(value: unknown): value is RuntimeControlKey {
  return typeof value === 'string' &&
    CONTROL_KEYS.has(value as RuntimeControlKey);
}

function validState(
  controlKey: RuntimeControlKey,
  value: unknown,
): value is 'normal' | 'brownout' | 'enabled' | 'disabled' {
  if (typeof value !== 'string') return false;
  return controlKey === 'platform_mode'
    ? value === 'normal' || value === 'brownout'
    : value === 'enabled' || value === 'disabled';
}

export async function GET() {
  try {
    await requireAdmin(['owner', 'admin']);
    const controls = await getRuntimeControlSnapshot();

    return Response.json(
      { ok: true, controls },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  } catch (error) {
    if (error instanceof ApiError) return failure(error);
    console.error('[Admin runtime controls GET]', error);
    return Response.json(
      { ok: false, error: 'runtime_controls_unavailable' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminMutation(request, ['owner', 'admin']);
    const body = await readJsonBody(request, { maxBytes: 8_000 });

    if (!validControlKey(body.controlKey)) {
      throw new ApiError(400, 'Неизвестный runtime control.');
    }

    if (!validState(body.controlKey, body.state)) {
      throw new ApiError(400, 'Некорректное состояние runtime control.');
    }

    const reason =
      typeof body.reason === 'string'
        ? body.reason.trim().slice(0, 500)
        : null;

    const updated = await setRuntimeControl({
      controlKey: body.controlKey,
      state: body.state,
      reason,
      actorId: auth.user.id,
    });

    await writeAdminAudit({
      actorId: auth.user.id,
      actorRole: auth.role,
      action: 'runtime_control_updated',
      targetType: 'system_runtime_control',
      targetId: updated.controlKey,
      reason,
      details: {
        state: updated.state,
      },
      request,
    });

    return Response.json(
      {
        ok: true,
        control: updated,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  } catch (error) {
    if (error instanceof ApiError) return failure(error);

    console.error('[Admin runtime controls PATCH]', error);
    return Response.json(
      { ok: false, error: 'runtime_control_update_failed' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
