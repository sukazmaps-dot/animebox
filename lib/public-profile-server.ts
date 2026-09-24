import 'server-only';

import { adminClient } from '@/lib/community-server';
import { getSponsorStatus } from '@/lib/sponsor-server';
import type { SponsorStatus } from '@/lib/sponsor';
import { publicIdentityRoleFor } from '@/lib/identity-server';
import type { PublicIdentityRole } from '@/lib/identity';
import { achievementIcon } from '@/lib/achievement-icons';
import { getEffectiveUserEntitlements } from '@/lib/entitlements-server';
import {
  studioSettingsFromRow,
  type PremiumMediaTransform,
  type PremiumProfileTheme,
  type PremiumStudioSettings,
} from '@/lib/premium-studio';
import { resolveProfileAppearance } from '@/lib/profile-appearance';
import {
  normalizeProgression,
  type AchievementRarity,
  type ProfileProgression,
} from '@/lib/progression';
import type { SeasonPeriod } from '@/lib/seasons';
import { isUuid } from '@/lib/uuid';
import { getProfileWidgetsData } from '@/lib/profile-widgets-server';
import type { ProfileWidgetsData } from '@/types/profile-widgets';

export type PublicAchievement = {
  code: string;
  title: string;
  description: string;
  icon: string;
  earnedAt: string | null;
  rarity: AchievementRarity;
  xpReward: number;
};

export type PublicSeasonTitle = {
  place: number;
  periodType: SeasonPeriod;
  periodKey: string;
  startsAt: string;
  endsAt: string;
};

export type PublicProfileData = {
  id: string;
  username: string;
  bio: string | null;
  avatarUrl: string;
  avatarMobileUrl: string;
  bannerUrl: string | null;
  bannerMobileUrl: string | null;
  createdAt: string;
  ogNumber: number | null;
  sponsor: SponsorStatus | null;
  premium: boolean;
  premiumTheme: PremiumProfileTheme;
  premiumStudio: PremiumStudioSettings | null;
  avatarTransform: PremiumMediaTransform;
  bannerTransform: PremiumMediaTransform;
  role: PublicIdentityRole;
  progression: ProfileProgression;
  featuredAchievements: PublicAchievement[];
  seasonTitles: PublicSeasonTitle[];
  stats: {
    episodes: number;
    titles: number;
    minutes: number;
    activeMs: number;
    comments: number;
  };
  achievements: PublicAchievement[];
  widgets: ProfileWidgetsData;
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
  rarity: AchievementRarity;
  xp_reward: number;
};

function toPublicStorageUrl(
  admin: ReturnType<typeof adminClient>,
  path: string | null,
) {
  if (!path) return null;

  if (/^https?:\/\//i.test(path)) return null;

  return (
    admin.storage.from('profile-media').getPublicUrl(path).data.publicUrl ||
    null
  );
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
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
  if (!isUuid(userId)) return null;

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
    metricsResult,
    awardsResult,
    definitionsResult,
    ogResult,
    sponsor,
    entitlements,
    premiumSettings,
    progressionResult,
    featuredResult,
    seasonEntriesResult,
    widgets,
  ] = await Promise.all([
    admin.rpc('community_metrics', { p_user: userId }),
    admin.from('user_achievements').select('*').eq('user_id', userId),
    admin
      .from('achievements')
      .select('code,title,description,icon,rarity,xp_reward')
      .order('threshold', { ascending: true }),
    admin
      .from('og_members')
      .select('og_number')
      .eq('user_id', userId)
      .maybeSingle(),
    getSponsorStatus(userId),
    getEffectiveUserEntitlements(userId).catch(() => null),
    admin
      .from('premium_profile_settings')
      .select('theme,primary_color,accent_color,text_color,glow_strength,border_style,avatar_path,avatar_static_path,avatar_position_x,avatar_position_y,avatar_zoom,banner_path,banner_static_path,banner_position_x,banner_position_y,banner_zoom,sync_player_theme')
      .eq('user_id', userId)
      .maybeSingle()
      .then((result) => (result.error ? null : result.data)),
    admin
      .from('user_progression')
      .select('total_xp,activity_xp,premium_bonus_xp,achievement_xp,challenge_xp')
      .eq('user_id', userId)
      .maybeSingle(),
    admin
      .from('profile_featured_achievements')
      .select('achievement_code,position')
      .eq('user_id', userId)
      .order('position', { ascending: true }),
    admin
      .from('leaderboard_season_entries')
      .select('season_id,place')
      .eq('user_id', userId)
      .lte('place', 3),
    getProfileWidgetsData(userId),
  ]);

  if (metricsResult.error) {
    console.error('Public profile watch metrics:', metricsResult.error);
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

  const metrics =
    !metricsResult.error &&
    metricsResult.data &&
    typeof metricsResult.data === 'object' &&
    !Array.isArray(metricsResult.data)
      ? (metricsResult.data as Record<string, unknown>)
      : {};

  const episodes = numberValue(metrics.episodes);
  const titles = numberValue(metrics.titles);
  const comments = numberValue(metrics.comments);
  const activeMs = numberValue(metrics.active_ms);

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
        rarity: definition.rarity,
        xpReward: Number(definition.xp_reward ?? 0),
      };
    });

  const achievementByCode = new Map(
    achievements.map((achievement) => [achievement.code, achievement] as const),
  );

  const featuredAchievements = (
    featuredResult.error ? [] : featuredResult.data ?? []
  )
    .map((row) => achievementByCode.get(row.achievement_code))
    .filter((item): item is PublicAchievement => Boolean(item));

  const seasonEntryRows = seasonEntriesResult.error
    ? []
    : seasonEntriesResult.data ?? [];
  const seasonIds = [
    ...new Set(seasonEntryRows.map((row) => row.season_id)),
  ];

  let seasonTitles: PublicSeasonTitle[] = [];

  if (seasonIds.length) {
    const { data: seasons, error: seasonsError } = await admin
      .from('leaderboard_seasons')
      .select('id,period_type,period_key,starts_at,ends_at')
      .in('id', seasonIds);

    if (seasonsError) {
      console.error('Public profile season titles:', seasonsError);
    } else {
      const seasonById = new Map(
        (seasons ?? []).map((season) => [season.id, season] as const),
      );

      seasonTitles = seasonEntryRows
        .map((entry) => {
          const season = seasonById.get(entry.season_id);
          if (!season) return null;

          return {
            place: Number(entry.place),
            periodType: season.period_type as SeasonPeriod,
            periodKey: season.period_key,
            startsAt: season.starts_at,
            endsAt: season.ends_at,
          };
        })
        .filter((item): item is PublicSeasonTitle => Boolean(item))
        .sort(
          (a, b) =>
            Date.parse(b.endsAt) - Date.parse(a.endsAt) ||
            a.place - b.place,
        )
        .slice(0, 4);
    }
  }

  const storedStudioSettings = premiumSettings
    ? studioSettingsFromRow(premiumSettings as Record<string, unknown>)
    : null;
  const premiumActive = Boolean(entitlements?.premiumThemes && entitlements?.profileStudio);
  const premiumMediaActive = Boolean(entitlements?.animatedAvatar || premiumActive);
  const appearance = resolveProfileAppearance({
    baseAvatarPath: profile.avatar_path,
    baseBannerPath: profile.banner_path,
    premiumStudio: storedStudioSettings,
    premiumActive,
    premiumMediaActive,
  });
  const mobileAppearance = resolveProfileAppearance({
    baseAvatarPath: profile.avatar_path,
    baseBannerPath: profile.banner_path,
    premiumStudio: storedStudioSettings,
    premiumActive,
    premiumMediaActive: false,
  });

  const avatarUrl =
    toPublicStorageUrl(admin, appearance.avatarPath) || '/default-avatar.webp';
  const avatarMobileUrl =
    toPublicStorageUrl(admin, mobileAppearance.avatarPath) || '/default-avatar.webp';
  const bannerUrl = toPublicStorageUrl(admin, appearance.bannerPath);
  const bannerMobileUrl = toPublicStorageUrl(admin, mobileAppearance.bannerPath);

  return {
    id: profile.id,
    username: profile.username?.trim() || 'Пользователь',
    bio: profile.bio?.trim() || null,
    avatarUrl,
    avatarMobileUrl,
    bannerUrl,
    bannerMobileUrl,
    createdAt: profile.created_at,
    ogNumber:
      !ogResult.error && typeof ogResult.data?.og_number === 'number'
        ? ogResult.data.og_number
        : null,
    sponsor,
    premium: Boolean(entitlements?.premiumBadge),
    premiumTheme: appearance.premiumStudio?.theme ?? 'default',
    premiumStudio: appearance.premiumStudio,
    avatarTransform: appearance.avatarTransform,
    bannerTransform: appearance.bannerTransform,
    role: publicIdentityRoleFor(userId),
    progression: normalizeProgression(
      progressionResult.error ? null : progressionResult.data,
      Boolean(entitlements?.premiumBadge),
    ),
    featuredAchievements,
    seasonTitles,
    stats: {
      episodes,
      titles,
      minutes: Math.floor(activeMs / 60_000),
      activeMs: Math.floor(activeMs),
      comments,
    },
    achievements,
    widgets,
  };
}
