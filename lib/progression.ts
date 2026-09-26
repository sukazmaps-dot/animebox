export type AchievementRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';

export type AchievementCategory =
  | 'watch'
  | 'collection'
  | 'time'
  | 'community'
  | 'genres';

export const ACHIEVEMENT_RARITY_LABELS: Record<AchievementRarity, string> = {
  common: 'Обычное',
  uncommon: 'Необычное',
  rare: 'Редкое',
  epic: 'Эпическое',
  legendary: 'Легендарное',
};

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  watch: 'Просмотр',
  collection: 'Коллекция',
  time: 'Время',
  community: 'Сообщество',
  genres: 'Жанры',
};

export const LEVEL_FRAME_KEYS = [
  'level-viewer',
  'level-explorer',
  'level-marathoner',
  'level-collector',
  'level-veteran',
  'level-legend',
  'level-master',
] as const;

export type LevelFrameKey = (typeof LEVEL_FRAME_KEYS)[number];

export type LevelMilestone = {
  level: number;
  rank: string;
  frameKey: LevelFrameKey | null;
  reward: string;
  premiumReward: string;
};

export const LEVEL_MILESTONES: readonly LevelMilestone[] = [
  {
    level: 1,
    rank: 'Новичок',
    frameKey: null,
    reward: 'Старт прогрессии AnimeBox',
    premiumReward: '+20% XP за новую активность',
  },
  {
    level: 5,
    rank: 'Зритель',
    frameKey: 'level-viewer',
    reward: 'Уровневая рамка «Зритель»',
    premiumReward: 'Анимация и живое свечение рамки',
  },
  {
    level: 10,
    rank: 'Исследователь',
    frameKey: 'level-explorer',
    reward: 'Уровневая рамка «Исследователь»',
    premiumReward: 'Анимация и живое свечение рамки',
  },
  {
    level: 15,
    rank: 'Марафонец',
    frameKey: 'level-marathoner',
    reward: 'Уровневая рамка «Марафонец»',
    premiumReward: 'Анимация и живое свечение рамки',
  },
  {
    level: 20,
    rank: 'Коллекционер',
    frameKey: 'level-collector',
    reward: 'Уровневая рамка «Коллекционер»',
    premiumReward: 'Анимация и живое свечение рамки',
  },
  {
    level: 30,
    rank: 'Ветеран',
    frameKey: 'level-veteran',
    reward: 'Уровневая рамка «Ветеран»',
    premiumReward: 'Анимация и живое свечение рамки',
  },
  {
    level: 40,
    rank: 'Легенда',
    frameKey: 'level-legend',
    reward: 'Уровневая рамка «Легенда»',
    premiumReward: 'Анимация и живое свечение рамки',
  },
  {
    level: 50,
    rank: 'AnimeBox Master',
    frameKey: 'level-master',
    reward: 'Финальная рамка AnimeBox Master',
    premiumReward: 'Максимальная анимация Master-рамки',
  },
] as const;

export type ProfileProgression = {
  totalXp: number;
  activityXp: number;
  premiumBonusXp: number;
  achievementXp: number;
  challengeXp: number;
  level: number;
  rank: string;
  rankKey:
    | 'newcomer'
    | 'viewer'
    | 'explorer'
    | 'marathoner'
    | 'collector'
    | 'veteran'
    | 'legend'
    | 'master';
  levelStartXp: number;
  nextLevelXp: number | null;
  levelProgressXp: number;
  levelSpanXp: number;
  progressPct: number;
  xpToNext: number;
  maxLevel: number;
  premiumBoostActive: boolean;
};

export const MAX_LEVEL = 50;

function safeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function xpForLevel(level: number) {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  const step = clamped - 1;

  // Smooth early progression with a gradually steeper late game.
  // Level 10 ~= 2.5k XP, level 20 ~= 9.1k XP, level 50 ~= 52.9k XP.
  return 100 * step + 20 * step * step;
}

export function rankForLevel(level: number) {
  if (level >= 50) return { key: 'master' as const, label: 'AnimeBox Master' };
  if (level >= 40) return { key: 'legend' as const, label: 'Легенда' };
  if (level >= 30) return { key: 'veteran' as const, label: 'Ветеран' };
  if (level >= 20) return { key: 'collector' as const, label: 'Коллекционер' };
  if (level >= 15) return { key: 'marathoner' as const, label: 'Марафонец' };
  if (level >= 10) return { key: 'explorer' as const, label: 'Исследователь' };
  if (level >= 5) return { key: 'viewer' as const, label: 'Зритель' };
  return { key: 'newcomer' as const, label: 'Новичок' };
}

export function isLevelFrameKey(value: unknown): value is LevelFrameKey {
  return (
    typeof value === 'string' &&
    (LEVEL_FRAME_KEYS as readonly string[]).includes(value)
  );
}

export function levelFrameMilestone(key: LevelFrameKey) {
  return LEVEL_MILESTONES.find((item) => item.frameKey === key) ?? null;
}

export function levelFrameLabel(key: LevelFrameKey) {
  return levelFrameMilestone(key)?.rank ?? 'Уровневая рамка';
}

export function unlockedLevelFrames(level: number) {
  const safeLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return LEVEL_MILESTONES.flatMap((item) =>
    item.frameKey && safeLevel >= item.level ? [item.frameKey] : [],
  );
}

export function progressionFromXp(totalXp: number) {
  const safeXp = safeNumber(totalXp);
  let level = 1;

  for (let candidate = 2; candidate <= MAX_LEVEL; candidate += 1) {
    if (safeXp < xpForLevel(candidate)) break;
    level = candidate;
  }

  const levelStartXp = xpForLevel(level);
  const nextLevelXp = level >= MAX_LEVEL ? null : xpForLevel(level + 1);
  const levelSpanXp =
    nextLevelXp == null ? 0 : Math.max(1, nextLevelXp - levelStartXp);
  const levelProgressXp =
    nextLevelXp == null
      ? 0
      : Math.max(0, Math.min(levelSpanXp, safeXp - levelStartXp));
  const progressPct =
    nextLevelXp == null
      ? 100
      : Math.round((levelProgressXp / levelSpanXp) * 100);
  const rank = rankForLevel(level);

  return {
    level,
    rank: rank.label,
    rankKey: rank.key,
    levelStartXp,
    nextLevelXp,
    levelProgressXp,
    levelSpanXp,
    progressPct,
    xpToNext: nextLevelXp == null ? 0 : Math.max(0, nextLevelXp - safeXp),
    maxLevel: MAX_LEVEL,
  };
}

export function normalizeProgression(
  raw: unknown,
  premiumBoostActive = false,
): ProfileProgression {
  const record =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const totalXp = safeNumber(record.total_xp ?? record.totalXp);
  const derived = progressionFromXp(totalXp);

  return {
    totalXp,
    activityXp: safeNumber(record.activity_xp ?? record.activityXp),
    premiumBonusXp: safeNumber(
      record.premium_bonus_xp ?? record.premiumBonusXp,
    ),
    achievementXp: safeNumber(
      record.achievement_xp ?? record.achievementXp,
    ),
    challengeXp: safeNumber(
      record.challenge_xp ?? record.challengeXp,
    ),
    ...derived,
    premiumBoostActive,
  };
}
