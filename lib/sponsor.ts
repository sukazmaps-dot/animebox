export type SponsorTier = 'supporter' | 'premium' | 'patron';

export type SponsorFrame = 'tier_default' | 'none' | SponsorTier;
export type SponsorNameStyle = 'tier_default' | 'none' | SponsorTier;
export type SponsorProfileTheme = 'default' | 'violet' | 'aurora' | 'royal';

export type SponsorPublicCosmetics = {
  selectedFrame: SponsorFrame;
  nameStyle: SponsorNameStyle;
  profileTheme: SponsorProfileTheme;
  badgeVisible: boolean;
};

export type SponsorPreferences = SponsorPublicCosmetics & {
  wallVisible: boolean;
  showStarAmount: boolean;
};

export type SponsorStatus = {
  tier: SponsorTier;
  totalStars: number;
  cosmetics?: SponsorPublicCosmetics;
};

export const SPONSOR_THRESHOLDS = {
  supporter: 25,
  premium: 100,
  patron: 250,
} as const;

export const SPONSOR_META: Record<
  SponsorTier,
  {
    label: string;
    shortLabel: string;
    description: string;
  }
> = {
  supporter: {
    label: 'Спонсор',
    shortLabel: 'Спонсор',
    description: 'Поддержал развитие AnimeBox',
  },
  premium: {
    label: 'Премиум-спонсор',
    shortLabel: 'Premium',
    description: 'Сильно поддержал развитие AnimeBox',
  },
  patron: {
    label: 'Меценат AnimeBox',
    shortLabel: 'Меценат',
    description: 'Один из главных спонсоров AnimeBox',
  },
};

export const DEFAULT_SPONSOR_PREFERENCES: SponsorPreferences = {
  selectedFrame: 'tier_default',
  nameStyle: 'tier_default',
  profileTheme: 'default',
  badgeVisible: true,
  wallVisible: false,
  showStarAmount: true,
};

const TIER_ORDER: SponsorTier[] = ['supporter', 'premium', 'patron'];

export function resolveSponsorTier(totalStars: number): SponsorTier | null {
  const stars = Math.max(0, Math.floor(Number(totalStars) || 0));

  if (stars >= SPONSOR_THRESHOLDS.patron) return 'patron';
  if (stars >= SPONSOR_THRESHOLDS.premium) return 'premium';
  if (stars >= SPONSOR_THRESHOLDS.supporter) return 'supporter';

  return null;
}

export function sponsorTierRank(tier: SponsorTier | null | undefined) {
  return tier ? TIER_ORDER.indexOf(tier) + 1 : 0;
}

export function allowedSponsorFrames(tier: SponsorTier | null): SponsorFrame[] {
  const base: SponsorFrame[] = ['tier_default', 'none'];
  if (!tier) return base;
  const rank = sponsorTierRank(tier);
  return [...base, ...TIER_ORDER.slice(0, rank)];
}

export function allowedSponsorNameStyles(tier: SponsorTier | null): SponsorNameStyle[] {
  const base: SponsorNameStyle[] = ['tier_default', 'none'];
  if (!tier) return base;
  const rank = sponsorTierRank(tier);
  return [...base, ...TIER_ORDER.slice(0, rank)];
}

export function allowedSponsorThemes(tier: SponsorTier | null): SponsorProfileTheme[] {
  if (!tier) return ['default'];
  if (tier === 'supporter') return ['default'];
  if (tier === 'premium') return ['default', 'violet', 'aurora'];
  return ['default', 'violet', 'aurora', 'royal'];
}

export function sponsorAdFree(tier: SponsorTier | null | undefined) {
  return sponsorTierRank(tier) >= sponsorTierRank('premium');
}

export function normalizeSponsorPreferences(
  value: Partial<SponsorPreferences> | null | undefined,
  tier: SponsorTier | null,
): SponsorPreferences {
  const merged: SponsorPreferences = {
    ...DEFAULT_SPONSOR_PREFERENCES,
    ...(value ?? {}),
  };

  const frames = allowedSponsorFrames(tier);
  const names = allowedSponsorNameStyles(tier);
  const themes = allowedSponsorThemes(tier);

  return {
    selectedFrame: frames.includes(merged.selectedFrame)
      ? merged.selectedFrame
      : 'tier_default',
    nameStyle: names.includes(merged.nameStyle)
      ? merged.nameStyle
      : 'tier_default',
    profileTheme: themes.includes(merged.profileTheme)
      ? merged.profileTheme
      : 'default',
    badgeVisible: Boolean(merged.badgeVisible),
    wallVisible: Boolean(merged.wallVisible),
    showStarAmount: Boolean(merged.showStarAmount),
  };
}

export function publicSponsorCosmetics(
  preferences: SponsorPreferences,
): SponsorPublicCosmetics {
  return {
    selectedFrame: preferences.selectedFrame,
    nameStyle: preferences.nameStyle,
    profileTheme: preferences.profileTheme,
    badgeVisible: preferences.badgeVisible,
  };
}

export function resolveSponsorFrame(
  tier: SponsorTier | null | undefined,
  selectedFrame: SponsorFrame | null | undefined,
): SponsorTier | null {
  if (!tier || selectedFrame === 'none') return null;
  if (!selectedFrame || selectedFrame === 'tier_default') return tier;
  return sponsorTierRank(selectedFrame) <= sponsorTierRank(tier)
    ? selectedFrame
    : tier;
}

export function resolveSponsorNameStyle(
  tier: SponsorTier | null | undefined,
  nameStyle: SponsorNameStyle | null | undefined,
): SponsorTier | 'none' | null {
  if (!tier) return null;
  if (nameStyle === 'none') return 'none';
  if (!nameStyle || nameStyle === 'tier_default') return tier;
  return sponsorTierRank(nameStyle) <= sponsorTierRank(tier)
    ? nameStyle
    : tier;
}

export function makeSponsorStatus(
  totalStars: number,
  cosmetics?: SponsorPublicCosmetics,
): SponsorStatus | null {
  const stars = Math.max(0, Math.floor(Number(totalStars) || 0));
  const tier = resolveSponsorTier(stars);

  return tier ? { tier, totalStars: stars, ...(cosmetics ? { cosmetics } : {}) } : null;
}
