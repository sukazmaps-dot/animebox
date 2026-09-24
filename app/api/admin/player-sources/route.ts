import {
  requireAdmin,
  requireAdminMutation,
  writeAdminAudit,
} from '@/lib/admin-server';
import {
  adminClient,
  ApiError,
  readJsonBody,
  response,
} from '@/lib/community-server';
import { getPlayerHealthDashboard } from '@/lib/player-health-server';
import {
  getProviderControlSnapshot,
  invalidateProviderControlCache,
  resetProviderRuntime,
} from '@/lib/player-source-control';
import type { PlayerProviderKey } from '@/types/player-source-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROVIDERS = new Set<PlayerProviderKey>([
  'direct',
  'kodik',
  'aniliberty',
]);

function providerKey(value: unknown): PlayerProviderKey {
  if (
    typeof value !== 'string' ||
    !PROVIDERS.has(value as PlayerProviderKey)
  ) {
    throw new ApiError(400, 'Некорректный provider.');
  }

  return value as PlayerProviderKey;
}

function boundedInteger(
  value: unknown,
  min: number,
  max: number,
  label: string,
) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ApiError(400, 'Некорректное поле: ' + label + '.');
  }
  return parsed;
}

function cleanText(value: unknown, max: number) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export async function GET(request: Request) {
  try {
    await requireAdmin(['owner', 'admin']);
    const url = new URL(request.url);
    const days = Number(url.searchParams.get('days') || '7');

    if (days !== 7 && days !== 30) {
      throw new ApiError(400, 'invalid_range');
    }

    const [providers, health] = await Promise.all([
      getProviderControlSnapshot(),
      getPlayerHealthDashboard(days),
    ]);

    return response({
      ok: true,
      providers,
      health,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return response({ ok: false, error: error.message }, error.status);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error('[Admin player sources GET]', error);

    return response(
      {
        ok: false,
        error: /player_provider_|schema cache|relation/i.test(message)
          ? 'player_source_migration_required'
          : 'player_source_control_unavailable',
      },
      503,
    );
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await requireAdminMutation(
      request,
      ['owner', 'admin'],
    );
    const body = await readJsonBody(request, { maxBytes: 12_000 });
    const action =
      typeof body.action === 'string' ? body.action.trim() : '';
    const provider = providerKey(body.provider);

    if (action === 'reset_health') {
      await resetProviderRuntime(provider);

      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: 'player_provider_health_reset',
        targetType: 'player_provider',
        targetId: provider,
        request,
      });

      return response({ ok: true });
    }

    if (action !== 'update_provider') {
      throw new ApiError(400, 'Неизвестное действие.');
    }

    if (typeof body.enabled !== 'boolean') {
      throw new ApiError(400, 'Некорректное поле: enabled.');
    }

    const priority = boundedInteger(body.priority, 0, 999, 'priority');
    const failureThreshold = boundedInteger(
      body.failureThreshold,
      1,
      20,
      'failureThreshold',
    );
    const cooldownSeconds = boundedInteger(
      body.cooldownSeconds,
      30,
      86_400,
      'cooldownSeconds',
    );
    const notes = cleanText(body.notes, 500);

    const update = await adminClient()
      .from('player_provider_settings')
      .update({
        enabled: body.enabled,
        priority,
        failure_threshold: failureThreshold,
        cooldown_seconds: cooldownSeconds,
        notes: notes || null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('provider_key', provider);

    if (update.error) throw update.error;

    invalidateProviderControlCache();

    await writeAdminAudit({
      actorId: user.id,
      actorRole: role,
      action: 'player_provider_config_update',
      targetType: 'player_provider',
      targetId: provider,
      details: {
        enabled: body.enabled,
        priority,
        failureThreshold,
        cooldownSeconds,
      },
      request,
    });

    return response({ ok: true });
  } catch (error) {
    if (error instanceof ApiError) {
      return response({ ok: false, error: error.message }, error.status);
    }

    console.error('[Admin player sources POST]', error);
    return response(
      { ok: false, error: 'Не удалось обновить provider.' },
      503,
    );
  }
}
