import {
  adminClient,
  ApiError,
  failure,
  readBody,
  response,
} from '@/lib/community-server';
import { requireAdmin, writeAdminAudit } from '@/lib/admin-server';
import {
  AD_PLACEMENTS,
  normalizePlacementFlags,
} from '@/lib/ads';
import { readStoredAdSettings } from '@/lib/ad-settings-server';
import { ADS_ENABLED, AD_PROVIDER } from '@/lib/monetization';

function integer(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export async function GET() {
  try {
    const { role } = await requireAdmin(['owner', 'admin']);
    const stored = await readStoredAdSettings();

    return response({
      role,
      environmentEnabled: ADS_ENABLED,
      provider: AD_PROVIDER,
      persistenceAvailable: stored.persistenceAvailable,
      settings: stored.settings,
      placements: AD_PLACEMENTS,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await requireAdmin(['owner', 'admin']);
    const body = await readBody(request);
    const current = await readStoredAdSettings();

    if (!current.persistenceAvailable) {
      throw new ApiError(
        503,
        'Таблица ad_settings не найдена. Сначала выполни supabase/ad-system-v1.sql.',
      );
    }

    const settings = {
      enabled:
        typeof body.enabled === 'boolean'
          ? body.enabled
          : current.settings.enabled,
      maxAdsPerSession: integer(
        body.maxAdsPerSession,
        current.settings.maxAdsPerSession,
        1,
        10,
      ),
      minSecondsBetweenAds: integer(
        body.minSecondsBetweenAds,
        current.settings.minSecondsBetweenAds,
        0,
        1800,
      ),
      placements: normalizePlacementFlags(body.placements),
    };

    const { error } = await adminClient().from('ad_settings').upsert(
      {
        id: 'global',
        enabled: settings.enabled,
        max_ads_per_session: settings.maxAdsPerSession,
        min_seconds_between_ads: settings.minSecondsBetweenAds,
        placements: settings.placements,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

    if (error) throw error;

    await writeAdminAudit({
      actorId: user.id,
      actorRole: role,
      action: 'ads.settings.update',
      targetType: 'ad_settings',
      targetId: 'global',
      details: settings,
    });

    return response({ ok: true, settings });
  } catch (error) {
    return failure(error);
  }
}
