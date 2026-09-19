import {
  ApiError,
  adminClient,
  failure,
  readBody,
  response,
  userClient,
} from '@/lib/community-server';
import { studioSettingsFromRow } from '@/lib/premium-studio';
import { resolveProfileAppearance } from '@/lib/profile-appearance';
import { getPublicIdentityRoles } from '@/lib/identity-server';
import { getSponsorStatuses } from '@/lib/sponsor-server';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_IDENTITIES = 8;

type ProfileIdentityRow = {
  id: string;
  username: string | null;
  avatar_path: string | null;
};

type PremiumSettingsRow = Record<string, unknown> & {
  user_id?: string;
};

type EntitlementRow = {
  user_id: string;
  entitlement: string;
};

function publicAvatarUrl(
  admin: ReturnType<typeof adminClient>,
  path: string | null,
) {
  if (!path) return '/default-avatar.webp';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;

  return (
    admin.storage.from('profile-media').getPublicUrl(path).data.publicUrl ||
    '/default-avatar.webp'
  );
}

export async function POST(request: Request) {
  try {
    // Watch Together requires an AnimeBox account. Keep this lookup private to
    // signed-in room participants even though the destination profile is public.
    await userClient();

    const body = await readBody(request);
    const rawUserIds = body.userIds;

    if (!Array.isArray(rawUserIds)) {
      throw new ApiError(400, 'Некорректный список участников.');
    }

    const userIds = [...new Set(rawUserIds)]
      .filter((value): value is string => typeof value === 'string' && UUID_RE.test(value))
      .slice(0, MAX_IDENTITIES);

    if (userIds.length === 0) {
      return response({ users: [] });
    }

    const admin = adminClient();
    const now = new Date().toISOString();
    const rolesByUser = getPublicIdentityRoles(userIds);

    const [profilesResult, premiumSettingsResult, entitlementsResult, sponsorStatuses] = await Promise.all([
      admin
        .from('profiles')
        .select('id,username,avatar_path')
        .in('id', userIds),
      admin
        .from('premium_profile_settings')
        .select('user_id,avatar_path,avatar_static_path,avatar_position_x,avatar_position_y,avatar_zoom')
        .in('user_id', userIds),
      admin
        .from('user_entitlements')
        .select('user_id,entitlement')
        .in('user_id', userIds)
        .in('entitlement', ['profileStudio', 'premiumThemes'])
        .eq('active', true)
        .lte('starts_at', now)
        .or(`expires_at.is.null,expires_at.gt.${now}`),
      getSponsorStatuses(userIds),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (premiumSettingsResult.error) throw premiumSettingsResult.error;
    if (entitlementsResult.error) throw entitlementsResult.error;

    const settingsByUser = new Map<string, PremiumSettingsRow>();
    for (const row of (premiumSettingsResult.data ?? []) as PremiumSettingsRow[]) {
      if (typeof row.user_id === 'string') settingsByUser.set(row.user_id, row);
    }

    const entitlementsByUser = new Map<string, Set<string>>();
    for (const row of (entitlementsResult.data ?? []) as EntitlementRow[]) {
      const values = entitlementsByUser.get(row.user_id) ?? new Set<string>();
      values.add(row.entitlement);
      entitlementsByUser.set(row.user_id, values);
    }

    const users = ((profilesResult.data ?? []) as ProfileIdentityRow[]).map((profile) => {
      const storedStudio = settingsByUser.get(profile.id);
      const studioSettings = storedStudio
        ? studioSettingsFromRow(storedStudio)
        : null;
      const entitlements = entitlementsByUser.get(profile.id);
      const premiumActive = Boolean(
        entitlements?.has('profileStudio') && entitlements?.has('premiumThemes'),
      );
      const appearance = resolveProfileAppearance({
        baseAvatarPath: profile.avatar_path,
        baseBannerPath: null,
        premiumStudio: studioSettings,
        premiumActive,
      });

      return {
        userId: profile.id,
        username: profile.username?.trim() || 'Пользователь',
        avatarUrl: publicAvatarUrl(admin, appearance.avatarPath),
        avatarTransform: appearance.avatarTransform,
        premium: premiumActive,
        role: rolesByUser.get(profile.id) ?? null,
        sponsor: sponsorStatuses.get(profile.id) ?? null,
      };
    });

    return response({ users });
  } catch (error) {
    return failure(error);
  }
}
