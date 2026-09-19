import {
  ApiError,
  adminClient,
  failure,
  readBody,
  response,
  userClient,
} from '@/lib/community-server';
import { resolvePublicAppearances } from '@/lib/public-avatar-server';
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
    const rolesByUser = getPublicIdentityRoles(userIds);

    const [profilesResult, sponsorStatuses] = await Promise.all([
      admin
        .from('profiles')
        .select('id,username,avatar_path')
        .in('id', userIds),
      getSponsorStatuses(userIds),
    ]);

    if (profilesResult.error) throw profilesResult.error;

    const profiles = (profilesResult.data ?? []) as ProfileIdentityRow[];
    const appearanceByUser = await resolvePublicAppearances(
      profiles.map((profile) => ({
        id: profile.id,
        avatar_path: profile.avatar_path,
      })),
    );

    const users = profiles.map((profile) => {
      const appearance = appearanceByUser.get(profile.id);

      return {
        userId: profile.id,
        username: profile.username?.trim() || 'Пользователь',
        avatarUrl: appearance?.avatarUrl ?? '/default-avatar.webp',
        avatarTransform: appearance?.avatarTransform ?? { x: 50, y: 50, zoom: 1 },
        premium: appearance?.premiumBadge ?? false,
        role: rolesByUser.get(profile.id) ?? null,
        sponsor: sponsorStatuses.get(profile.id) ?? null,
      };
    });

    return response({ users });
  } catch (error) {
    return failure(error);
  }
}
