import 'server-only';

import { adminClient } from '@/lib/community-server';
import {
  resolveProfileAppearance,
  type ResolvedProfileAppearance,
} from '@/lib/profile-appearance';
import { studioSettingsFromRow } from '@/lib/premium-studio';

export type PublicAvatarBaseProfile = {
  id: string;
  avatar_path: string | null;
  banner_path?: string | null;
};

export type PublicResolvedAppearance = ResolvedProfileAppearance & {
  avatarUrl: string;
  bannerUrl: string | null;
  premiumBadge: boolean;
  premiumMediaActive: boolean;
  premiumStudioActive: boolean;
};

type EntitlementRow = {
  user_id: string;
  entitlement: string;
};

type PremiumSettingsRow = Record<string, unknown> & {
  user_id?: string;
};

export type PublicAppearancePreload = {
  premiumSettings?: Record<string, unknown> | null;
  entitlements?: readonly string[] | Set<string> | null;
};

function publicStorageUrl(
  admin: ReturnType<typeof adminClient>,
  path: string | null | undefined,
) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return null;
  return admin.storage.from('profile-media').getPublicUrl(path).data.publicUrl || null;
}

export function resolvePublicAppearancesFromPreloaded(
  profiles: readonly PublicAvatarBaseProfile[],
  preloadByUser: ReadonlyMap<string, PublicAppearancePreload>,
): Map<string, PublicResolvedAppearance> {
  const uniqueProfiles = [
    ...new Map(profiles.map((profile) => [profile.id, profile])).values(),
  ];
  const result = new Map<string, PublicResolvedAppearance>();
  if (!uniqueProfiles.length) return result;

  const admin = adminClient();

  for (const profile of uniqueProfiles) {
    const preload = preloadByUser.get(profile.id);
    const entitlements = new Set(
      preload?.entitlements instanceof Set
        ? [...preload.entitlements]
        : preload?.entitlements ?? [],
    );
    const premiumStudioActive =
      entitlements.has('profileStudio') &&
      entitlements.has('premiumThemes');
    const premiumMediaActive =
      entitlements.has('animatedAvatar') || premiumStudioActive;
    const studioSettings = preload?.premiumSettings
      ? studioSettingsFromRow(preload.premiumSettings)
      : null;

    const appearance = resolveProfileAppearance({
      baseAvatarPath: profile.avatar_path,
      baseBannerPath: profile.banner_path ?? null,
      premiumStudio: studioSettings,
      premiumActive: premiumStudioActive,
      premiumMediaActive,
    });

    result.set(profile.id, {
      ...appearance,
      avatarUrl:
        publicStorageUrl(admin, appearance.avatarPath) || '/default-avatar.webp',
      bannerUrl: publicStorageUrl(admin, appearance.bannerPath),
      premiumBadge: entitlements.has('premiumBadge'),
      premiumMediaActive,
      premiumStudioActive,
    });
  }

  return result;
}

/**
 * Batch-resolves the single public AnimeBox appearance for a group of users.
 *
 * Priority:
 * 1) active Premium media (animated/original);
 * 2) stored static Premium WEBP fallback;
 * 3) ordinary profile media;
 * 4) default avatar / no banner.
 *
 * Keep this helper as the public identity source for chat, comments,
 * leaderboards and Watch Together so every surface shows the same avatar.
 */
export async function resolvePublicAppearances(
  profiles: readonly PublicAvatarBaseProfile[],
): Promise<Map<string, PublicResolvedAppearance>> {
  const uniqueProfiles = [...new Map(profiles.map((profile) => [profile.id, profile])).values()];
  const ids = uniqueProfiles.map((profile) => profile.id);
  const result = new Map<string, PublicResolvedAppearance>();

  if (!ids.length) return result;

  const admin = adminClient();
  const now = new Date().toISOString();

  const [settingsResult, entitlementsResult] = await Promise.all([
    admin
      .from('premium_profile_settings')
      .select(
        'user_id,theme,primary_color,accent_color,text_color,glow_strength,border_style,avatar_path,avatar_static_path,avatar_position_x,avatar_position_y,avatar_zoom,banner_path,banner_static_path,banner_position_x,banner_position_y,banner_zoom,sync_player_theme',
      )
      .in('user_id', ids),
    admin
      .from('user_entitlements')
      .select('user_id,entitlement')
      .in('user_id', ids)
      .in('entitlement', ['premiumBadge', 'profileStudio', 'premiumThemes', 'animatedAvatar'])
      .eq('active', true)
      .lte('starts_at', now)
      .or(`expires_at.is.null,expires_at.gt.${now}`),
  ]);

  if (settingsResult.error) {
    console.error('[Public appearance] Premium settings:', settingsResult.error);
  }
  if (entitlementsResult.error) {
    console.error('[Public appearance] Entitlements:', entitlementsResult.error);
  }

  const settingsByUser = new Map<string, PremiumSettingsRow>();
  for (const row of settingsResult.error ? [] : settingsResult.data ?? []) {
    if (typeof row.user_id !== 'string') continue;
    settingsByUser.set(row.user_id, row as PremiumSettingsRow);
  }

  const entitlementsByUser = new Map<string, Set<string>>();
  for (const row of (entitlementsResult.error ? [] : entitlementsResult.data ?? []) as EntitlementRow[]) {
    const set = entitlementsByUser.get(row.user_id) ?? new Set<string>();
    set.add(row.entitlement);
    entitlementsByUser.set(row.user_id, set);
  }

  const preloadByUser = new Map<string, PublicAppearancePreload>();
  for (const profile of uniqueProfiles) {
    preloadByUser.set(profile.id, {
      premiumSettings: settingsByUser.get(profile.id) ?? null,
      entitlements: entitlementsByUser.get(profile.id) ?? [],
    });
  }

  return resolvePublicAppearancesFromPreloaded(
    uniqueProfiles,
    preloadByUser,
  );
}
