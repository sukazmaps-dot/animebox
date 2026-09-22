import 'server-only';

import { adminClient } from '@/lib/community-server';
import { getUserChallengesSnapshot } from '@/lib/challenges-server';
import { publicIdentityRoleFor } from '@/lib/identity-server';
import { resolveProfileAppearance } from '@/lib/profile-appearance';
import { normalizeProgression } from '@/lib/progression';
import { resolvePublicAppearances } from '@/lib/public-avatar-server';
import { getSponsorStatus } from '@/lib/sponsor-server';
import { isUuid } from '@/lib/uuid';

function publicStorageUrl(
  admin: ReturnType<typeof adminClient>,
  path: string | null | undefined,
) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return admin.storage.from('profile-media').getPublicUrl(path).data.publicUrl || null;
}

export async function getProfilePreview(userId: string) {
  if (!isUuid(userId)) return null;

  const admin = adminClient();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id,username,bio,avatar_path,banner_path,created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!profile) return null;

  const [appearanceMap, progressionResult, sponsor, challenges] = await Promise.all([
    resolvePublicAppearances([{
      id: profile.id,
      avatar_path: profile.avatar_path,
      banner_path: profile.banner_path,
    }]),
    admin
      .from('user_progression')
      .select('total_xp,activity_xp,premium_bonus_xp,achievement_xp,challenge_xp')
      .eq('user_id', userId)
      .maybeSingle(),
    getSponsorStatus(userId).catch(() => null),
    getUserChallengesSnapshot(userId).catch(() => null),
  ]);

  const resolved = appearanceMap.get(userId);
  if (!resolved) return null;

  const appearance = resolveProfileAppearance({
    baseAvatarPath: profile.avatar_path,
    baseBannerPath: profile.banner_path,
    premiumStudio: resolved.premiumStudio,
    premiumActive: resolved.premiumStudioActive,
    premiumMediaActive: resolved.premiumMediaActive,
  });

  // Keep static fallbacks available so mobile and reduced-motion users don't
  // pay the rendering cost of animated Premium media in every social surface.
  const lightweight = resolveProfileAppearance({
    baseAvatarPath: profile.avatar_path,
    baseBannerPath: profile.banner_path,
    premiumStudio: resolved.premiumStudio,
    premiumActive: resolved.premiumStudioActive,
    premiumMediaActive: false,
  });

  const username =
    typeof profile.username === 'string' && profile.username.trim()
      ? profile.username.trim()
      : 'Пользователь';

  const bio =
    typeof profile.bio === 'string' && profile.bio.trim()
      ? profile.bio.trim().slice(0, 180)
      : null;

  const progression = normalizeProgression(
    progressionResult.error ? null : progressionResult.data,
    resolved.premiumBadge,
  );

  return {
    id: profile.id,
    username,
    bio,
    createdAt: profile.created_at,
    avatarUrl:
      publicStorageUrl(admin, appearance.avatarPath) || '/default-avatar.webp',
    avatarStaticUrl:
      publicStorageUrl(admin, lightweight.avatarPath) || '/default-avatar.webp',
    bannerUrl: publicStorageUrl(admin, appearance.bannerPath),
    bannerStaticUrl: publicStorageUrl(admin, lightweight.bannerPath),
    avatarTransform: appearance.avatarTransform,
    bannerTransform: appearance.bannerTransform,
    premium: resolved.premiumBadge,
    premiumTheme: appearance.premiumStudio?.theme ?? 'default',
    primaryColor: appearance.premiumStudio?.primaryColor ?? '#101426',
    accentColor: appearance.premiumStudio?.accentColor ?? '#7C4DFF',
    textColor: appearance.premiumStudio?.textColor ?? '#F5F3FF',
    role: publicIdentityRoleFor(userId),
    sponsor,
    progression: {
      level: progression.level,
      rank: progression.rank,
      totalXp: progression.totalXp,
    },
    streak: {
      current: challenges?.streak.current ?? 0,
      longest: challenges?.streak.longest ?? 0,
      lastActiveDate: challenges?.streak.lastActiveDate ?? null,
      todayKey: challenges?.todayKey ?? '',
    },
  };
}
