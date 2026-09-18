import type { PremiumStudioSettings } from '@/lib/premium-studio';

export type ResolvedProfileAppearance = {
  avatarPath: string | null;
  bannerPath: string | null;
  premiumActive: boolean;
  premiumStudio: PremiumStudioSettings | null;
  avatarSource: 'premium-animated' | 'premium-static' | 'base' | 'default';
  bannerSource: 'premium-animated' | 'premium-static' | 'base' | 'none';
};

/**
 * One appearance resolver for AnimeBox.
 *
 * Premium is a visual layer above the base profile, not a second profile.
 * - active Premium: animated/custom Premium media wins;
 * - expired Premium: the static WebP fallback remains visible;
 * - Premium-only palette/effects are never applied after entitlement expiry.
 */
export function resolveProfileAppearance({
  baseAvatarPath,
  baseBannerPath,
  premiumStudio,
  premiumActive,
}: {
  baseAvatarPath: string | null | undefined;
  baseBannerPath: string | null | undefined;
  premiumStudio: PremiumStudioSettings | null | undefined;
  premiumActive: boolean;
}): ResolvedProfileAppearance {
  const baseAvatar = baseAvatarPath || null;
  const baseBanner = baseBannerPath || null;

  let avatarPath: string | null = baseAvatar;
  let avatarSource: ResolvedProfileAppearance['avatarSource'] = baseAvatar ? 'base' : 'default';
  let bannerPath: string | null = baseBanner;
  let bannerSource: ResolvedProfileAppearance['bannerSource'] = baseBanner ? 'base' : 'none';

  if (premiumStudio) {
    if (premiumActive && premiumStudio.avatarPath) {
      avatarPath = premiumStudio.avatarPath;
      avatarSource = 'premium-animated';
    } else if (premiumStudio.avatarStaticPath) {
      avatarPath = premiumStudio.avatarStaticPath;
      avatarSource = 'premium-static';
    }

    if (premiumActive && premiumStudio.bannerPath) {
      bannerPath = premiumStudio.bannerPath;
      bannerSource = 'premium-animated';
    } else if (premiumStudio.bannerStaticPath) {
      bannerPath = premiumStudio.bannerStaticPath;
      bannerSource = 'premium-static';
    }
  }

  return {
    avatarPath,
    bannerPath,
    premiumActive,
    premiumStudio: premiumActive ? premiumStudio ?? null : null,
    avatarSource,
    bannerSource,
  };
}
