import 'server-only';

import { adminClient } from '@/lib/community-server';
import { getWatchSummary } from '@/lib/watch-server';
import { getSponsorStatus } from '@/lib/sponsor-server';
import type { SponsorStatus } from '@/lib/sponsor';
import { publicIdentityRoleFor } from '@/lib/identity-server';
import type { PublicIdentityRole } from '@/lib/identity';
import { achievementIcon } from '@/lib/achievement-icons';
import { getUserEntitlements } from '@/lib/entitlements-server';
import {
  studioSettingsFromRow,
  type PremiumProfileTheme,
  type PremiumStudioSettings,
} from '@/lib/premium-studio';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicAchievement = {
  code: string;
  title: string;
  description: string;
  icon: string;
  earnedAt: string | null;
};

export type PublicProfileData = {
  id: string;
  username: string;
  bio: string | null;
  avatarUrl: string;
  bannerUrl: string | null;
  createdAt: string;
  ogNumber: number | null;
  sponsor: SponsorStatus | null;
  premium: boolean;
  premiumTheme: PremiumProfileTheme;
  premiumStudio: PremiumStudioSettings | null;
  role: PublicIdentityRole;
  stats: {
    episodes: number;
    titles: number;
    minutes: number;
    activeMs: number;
    comments: number;
  };
  achievements: PublicAchievement[];
};

type ProfileRow = {
  id: string;
  username: string | null;
  bio: string | null;
  avatar_path: string | null;
  banner_path: string | null;
  created_at: string;
};

type AchievementDefinition = {
  code: string;
  title: string;
  description: string;
  icon: string;
};

function toPublicStorageUrl(
  admin: ReturnType<typeof adminClient>,
  path: string | null,
) {
  if (!path) return null;

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  return (
    admin.storage.from('profile-media').getPublicUrl(path).data.publicUrl ||
    null
  );
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function achievementCode(row: Record<string, unknown>) {
  return (
    stringValue(row.code) ||
    stringValue(row.achievement_code) ||
    stringValue(row.achievement) ||
    null
  );
}

function achievementDate(row: Record<string, unknown>) {
  return (
    stringValue(row.earned_at) ||
    stringValue(row.created_at) ||
    stringValue(row.unlocked_at) ||
    null
  );
}

export async function getPublicProfile(
  userId: string,
): Promise<PublicProfileData | null> {
  if (!UUID_RE.test(userId)) return null;

  const admin = adminClient();

  const { data: profileData, error: profileError } = await admin
    .from('profiles')
    .select('id,username,bio,avatar_path,banner_path,created_at')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('Public profile lookup:', profileError);
    return null;
  }

  if (!profileData) return null;

  const profile = profileData as ProfileRow;

  const [
    libraryResult,
    commentsResult,
    awardsResult,
    definitionsResult,
    ogResult,
    watchSummary,
    sponsor,
    entitlements,
    premiumSettings,
  ] = await Promise.all([
    admin.from('anime_library').select('status').eq('user_id', userId),
    admin
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
    admin.from('user_achievements').select('*').eq('user_id', userId),
    admin
      .from('achievements')
      .select('code,title,description,icon')
      .order('threshold', { ascending: true }),
    admin
      .from('og_members')
      .select('og_number')
      .eq('user_id', userId)
      .maybeSingle(),
    getWatchSummary(userId),
    getSponsorStatus(userId),
    getUserEntitlements(userId).catch(() => null),
    admin
      .from('premium_profile_settings')
      .select('theme,primary_color,accent_color,text_color,glow_strength,border_style,avatar_path,banner_path,sync_player_theme')
      .eq('user_id', userId)
      .maybeSingle()
      .then((result) => (result.error ? null : result.data)),
  ]);

  if (libraryResult.error) {
    console.error('Public profile library stats:', libraryResult.error);
  }
  if (commentsResult.error) {
    console.error('Public profile comment stats:', commentsResult.error);
  }
  if (awardsResult.error) {
    console.error('Public profile awards:', awardsResult.error);
  }
  if (definitionsResult.error) {
    console.error('Public profile achievement definitions:', definitionsResult.error);
  }
  if (ogResult.error) {
    // Backward compatible until the OG migration is applied.
    console.error('Public profile OG badge:', ogResult.error);
  }

  const episodes = watchSummary.completedEpisodes;
  const comments = commentsResult.error ? 0 : commentsResult.count ?? 0;
  const library = libraryResult.error ? [] : libraryResult.data ?? [];
  const titles = library.filter((item) => item.status === 'completed').length;

  const earnedByCode = new Map<string, string | null>();

  for (const raw of awardsResult.error ? [] : awardsResult.data ?? []) {
    const row = raw as Record<string, unknown>;
    const code = achievementCode(row);
    if (!code) continue;
    earnedByCode.set(code, achievementDate(row));
  }

  const achievements: PublicAchievement[] = (
    definitionsResult.error ? [] : definitionsResult.data ?? []
  )
    .filter((item) => earnedByCode.has(item.code))
    .map((item) => {
      const definition = item as AchievementDefinition;
      return {
        code: definition.code,
        title: definition.title,
        description: definition.description,
        icon: achievementIcon(definition.code, definition.icon),
        earnedAt: earnedByCode.get(definition.code) ?? null,
      };
    });

  const studioSettings =
    entitlements?.premiumThemes && premiumSettings
      ? studioSettingsFromRow(premiumSettings as Record<string, unknown>)
      : null;

  const avatarUrl =
    toPublicStorageUrl(admin, studioSettings?.avatarPath || profile.avatar_path) ||
    '/default-avatar.webp';
  const bannerUrl = toPublicStorageUrl(
    admin,
    studioSettings?.bannerPath || profile.banner_path,
  );

  return {
    id: profile.id,
    username: profile.username?.trim() || 'Пользователь',
    bio: profile.bio?.trim() || null,
    avatarUrl,
    bannerUrl,
    createdAt: profile.created_at,
    ogNumber:
      !ogResult.error && typeof ogResult.data?.og_number === 'number'
        ? ogResult.data.og_number
        : null,
    sponsor,
    premium: Boolean(entitlements?.premiumBadge),
    premiumTheme: studioSettings?.theme ?? 'default',
    premiumStudio: studioSettings,
    role: publicIdentityRoleFor(userId),
    stats: {
      episodes,
      titles,
      minutes: Math.floor(watchSummary.activeMs / 60_000),
      activeMs: Math.floor(watchSummary.activeMs),
      comments,
    },
    achievements,
  };
}
