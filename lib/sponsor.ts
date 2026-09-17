export type SponsorTier = 'supporter' | 'premium' | 'patron';

export type SponsorStatus = {
  tier: SponsorTier;
  totalStars: number;
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

export function resolveSponsorTier(totalStars: number): SponsorTier | null {
  const stars = Math.max(0, Math.floor(Number(totalStars) || 0));

  if (stars >= SPONSOR_THRESHOLDS.patron) return 'patron';
  if (stars >= SPONSOR_THRESHOLDS.premium) return 'premium';
  if (stars >= SPONSOR_THRESHOLDS.supporter) return 'supporter';

  return null;
}

export function makeSponsorStatus(totalStars: number): SponsorStatus | null {
  const stars = Math.max(0, Math.floor(Number(totalStars) || 0));
  const tier = resolveSponsorTier(stars);

  return tier ? { tier, totalStars: stars } : null;
}
