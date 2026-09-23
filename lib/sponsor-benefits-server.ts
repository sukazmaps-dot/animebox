import 'server-only';

import { adminClient } from '@/lib/community-server';
import {
  DEFAULT_SPONSOR_PREFERENCES,
  normalizeSponsorPreferences,
  publicSponsorCosmetics,
  resolveSponsorTier,
  sponsorAdFree,
  allowedSponsorFrames,
  allowedSponsorNameStyles,
  allowedSponsorThemes,
  type SponsorPreferences,
  type SponsorTier,
} from '@/lib/sponsor';

export type PreferenceRow = {
  user_id: string;
  selected_frame: string | null;
  name_style: string | null;
  profile_theme: string | null;
  badge_visible: boolean | null;
  wall_visible: boolean | null;
  show_star_amount: boolean | null;
};

function rowToPartial(row: PreferenceRow | null | undefined): Partial<SponsorPreferences> {
  if (!row) return DEFAULT_SPONSOR_PREFERENCES;
  return {
    selectedFrame: (row.selected_frame ?? 'tier_default') as SponsorPreferences['selectedFrame'],
    nameStyle: (row.name_style ?? 'tier_default') as SponsorPreferences['nameStyle'],
    profileTheme: (row.profile_theme ?? 'default') as SponsorPreferences['profileTheme'],
    badgeVisible: row.badge_visible ?? true,
    wallVisible: row.wall_visible ?? false,
    showStarAmount: row.show_star_amount ?? true,
  };
}

export async function getSponsorPreferenceRows(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  const result = new Map<string, PreferenceRow>();
  if (!ids.length) return result;

  const { data, error } = await adminClient()
    .from('sponsor_preferences')
    .select('user_id,selected_frame,name_style,profile_theme,badge_visible,wall_visible,show_star_amount')
    .in('user_id', ids);

  if (error) {
    // Backward compatible while the Stage 2.5 v3 migration is being deployed.
    if (error.code !== '42P01' && error.code !== 'PGRST205') {
      console.error('[Sponsor benefits] preferences lookup failed', error);
    }
    return result;
  }

  for (const row of (data ?? []) as PreferenceRow[]) {
    result.set(row.user_id, row);
  }
  return result;
}

export async function getSponsorPreferences(
  userId: string,
  totalStars: number,
): Promise<SponsorPreferences> {
  const tier = resolveSponsorTier(totalStars);
  const rows = await getSponsorPreferenceRows([userId]);
  return normalizeSponsorPreferences(rowToPartial(rows.get(userId)), tier);
}

export function sponsorPreferencesFromRow(
  row: PreferenceRow | null | undefined,
  tier: SponsorTier | null,
): SponsorPreferences {
  return normalizeSponsorPreferences(rowToPartial(row), tier);
}

export function sponsorBenefitsPayload(tier: SponsorTier | null) {
  return {
    adFree: sponsorAdFree(tier),
    frames: allowedSponsorFrames(tier),
    nameStyles: allowedSponsorNameStyles(tier),
    themes: allowedSponsorThemes(tier),
  };
}

export function sponsorPublicCosmeticsFromRow(
  row: PreferenceRow | null | undefined,
  tier: SponsorTier | null,
) {
  return publicSponsorCosmetics(sponsorPreferencesFromRow(row, tier));
}
