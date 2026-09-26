export const SEASON_FRAME_KEYS = [
  'league-champion',
  'league-elite',
  'league-podium',
  'league-top10',
] as const;

export type SeasonFrameKey = (typeof SEASON_FRAME_KEYS)[number];
export type LeaderboardPeriodType = 'week' | 'month';
export type LeaderboardRewardKey =
  | 'weekly_champion'
  | 'weekly_runner_up'
  | 'weekly_podium'
  | 'weekly_top10'
  | 'monthly_champion'
  | 'monthly_runner_up'
  | 'monthly_podium'
  | 'monthly_top10';

export type LeaderboardRewardTier = {
  minPlace: number;
  maxPlace: number;
  rewardKey: LeaderboardRewardKey;
  premiumDays: number;
  frameDays: number;
  cosmeticKey: SeasonFrameKey;
  title: string;
  shortLabel: string;
};

export const WEEKLY_REWARD_TIERS: readonly LeaderboardRewardTier[] = [
  {
    minPlace: 1,
    maxPlace: 1,
    rewardKey: 'weekly_champion',
    premiumDays: 7,
    frameDays: 7,
    cosmeticKey: 'league-champion',
    title: 'Чемпион недели',
    shortLabel: '7 дней Premium + рамка чемпиона на 7 дней',
  },
  {
    minPlace: 2,
    maxPlace: 2,
    rewardKey: 'weekly_runner_up',
    premiumDays: 3,
    frameDays: 7,
    cosmeticKey: 'league-elite',
    title: 'Серебряный призёр недели',
    shortLabel: '3 дня Premium + элитная рамка на 7 дней',
  },
  {
    minPlace: 3,
    maxPlace: 3,
    rewardKey: 'weekly_podium',
    premiumDays: 1,
    frameDays: 7,
    cosmeticKey: 'league-podium',
    title: 'Бронзовый призёр недели',
    shortLabel: '1 день Premium + рамка призёра на 7 дней',
  },
  {
    minPlace: 4,
    maxPlace: 10,
    rewardKey: 'weekly_top10',
    premiumDays: 0,
    frameDays: 7,
    cosmeticKey: 'league-top10',
    title: 'Топ-10 недели',
    shortLabel: 'Рамка Топ-10 на 7 дней',
  },
] as const;

export const MONTHLY_REWARD_TIERS: readonly LeaderboardRewardTier[] = [
  {
    minPlace: 1,
    maxPlace: 1,
    rewardKey: 'monthly_champion',
    premiumDays: 0,
    frameDays: 30,
    cosmeticKey: 'league-champion',
    title: 'Чемпион месяца',
    shortLabel: 'Рамка чемпиона на 30 дней',
  },
  {
    minPlace: 2,
    maxPlace: 2,
    rewardKey: 'monthly_runner_up',
    premiumDays: 0,
    frameDays: 30,
    cosmeticKey: 'league-elite',
    title: 'Серебряный призёр месяца',
    shortLabel: 'Элитная рамка на 30 дней',
  },
  {
    minPlace: 3,
    maxPlace: 3,
    rewardKey: 'monthly_podium',
    premiumDays: 0,
    frameDays: 30,
    cosmeticKey: 'league-podium',
    title: 'Бронзовый призёр месяца',
    shortLabel: 'Рамка призёра на 30 дней',
  },
  {
    minPlace: 4,
    maxPlace: 10,
    rewardKey: 'monthly_top10',
    premiumDays: 0,
    frameDays: 30,
    cosmeticKey: 'league-top10',
    title: 'Топ-10 месяца',
    shortLabel: 'Рамка Топ-10 на 30 дней',
  },
] as const;

export function rewardTiersForPeriod(periodType: LeaderboardPeriodType) {
  return periodType === 'month' ? MONTHLY_REWARD_TIERS : WEEKLY_REWARD_TIERS;
}

export function rewardTierForPlace(
  place: number | null | undefined,
  periodType: LeaderboardPeriodType = 'week',
) {
  if (!Number.isFinite(Number(place))) return null;
  const normalized = Math.floor(Number(place));
  return rewardTiersForPeriod(periodType).find(
    (tier) => normalized >= tier.minPlace && normalized <= tier.maxPlace,
  ) ?? null;
}

export function isSeasonFrameKey(value: unknown): value is SeasonFrameKey {
  return typeof value === 'string' &&
    (SEASON_FRAME_KEYS as readonly string[]).includes(value);
}

export function currentLeaderboardWeekUtc(now = new Date()) {
  const startsAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = startsAt.getUTCDay();
  startsAt.setUTCDate(startsAt.getUTCDate() - ((day + 6) % 7));

  const endsAt = new Date(startsAt);
  endsAt.setUTCDate(endsAt.getUTCDate() + 7);

  return {
    periodType: 'week' as const,
    periodKey: startsAt.toISOString().slice(0, 10),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };
}

export function currentLeaderboardMonthUtc(now = new Date()) {
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    periodType: 'month' as const,
    periodKey: startsAt.toISOString().slice(0, 7),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };
}

export function seasonFrameLabel(key: SeasonFrameKey) {
  switch (key) {
    case 'league-champion':
      return 'Рамка чемпиона';
    case 'league-elite':
      return 'Элитная рамка';
    case 'league-podium':
      return 'Рамка призёра';
    case 'league-top10':
      return 'Рамка Топ-10';
  }
}

export function seasonFramePriority(key: SeasonFrameKey) {
  switch (key) {
    case 'league-champion': return 40;
    case 'league-elite': return 30;
    case 'league-podium': return 20;
    case 'league-top10': return 10;
  }
}
