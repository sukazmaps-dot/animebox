import 'server-only';

import { adminClient } from '@/lib/community-server';
import {
  DEFAULT_AD_SETTINGS,
  normalizePlacementFlags,
  type AdStoredSettings,
} from '@/lib/ads';
import { ADS_ENABLED } from '@/lib/monetization';

export type StoredAdSettingsResult = {
  settings: AdStoredSettings;
  persistenceAvailable: boolean;
};

type AdSettingsRow = {
  enabled: boolean | null;
  max_ads_per_session: number | null;
  min_seconds_between_ads: number | null;
  placements: unknown;
};

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function missingTable(error: { message?: string } | null | undefined) {
  const message = error?.message ?? '';
  return /ad_settings|relation .* does not exist|schema cache/i.test(message);
}

export function normalizeStoredAdSettings(row?: Partial<AdSettingsRow> | null): AdStoredSettings {
  return {
    enabled: typeof row?.enabled === 'boolean' ? row.enabled : DEFAULT_AD_SETTINGS.enabled,
    maxAdsPerSession: clampInteger(
      row?.max_ads_per_session,
      DEFAULT_AD_SETTINGS.maxAdsPerSession,
      1,
      10,
    ),
    minSecondsBetweenAds: clampInteger(
      row?.min_seconds_between_ads,
      DEFAULT_AD_SETTINGS.minSecondsBetweenAds,
      0,
      1800,
    ),
    placements: normalizePlacementFlags(row?.placements),
  };
}

export async function readStoredAdSettings(): Promise<StoredAdSettingsResult> {
  const { data, error } = await adminClient()
    .from('ad_settings')
    .select('enabled,max_ads_per_session,min_seconds_between_ads,placements')
    .eq('id', 'global')
    .maybeSingle();

  if (error) {
    if (missingTable(error)) {
      return {
        settings: DEFAULT_AD_SETTINGS,
        persistenceAvailable: false,
      };
    }
    throw error;
  }

  return {
    settings: normalizeStoredAdSettings(data as AdSettingsRow | null),
    persistenceAvailable: true,
  };
}

export async function readEffectiveAdSettings() {
  const stored = await readStoredAdSettings();
  return {
    ...stored,
    settings: {
      ...stored.settings,
      // Environment flag is the emergency kill switch. Runtime settings can
      // disable ads without a deploy, but cannot bypass a disabled env flag.
      enabled: ADS_ENABLED && stored.settings.enabled,
    },
  };
}
