import type { ProfileProgression } from '@/lib/progression';

export type EvolutionFrameStage = 0 | 1 | 2 | 3 | 4;
export type PrestigeTier = 0 | 1;

export type ProgressionMilestoneDefinition = {
  level: 10 | 25 | 50 | 75 | 100;
  title: string;
  subtitle: string;
  frameStage: EvolutionFrameStage;
  asset: string;
  premiumAsset: string;
  premiumHint: string;
};

export const PROGRESSION_MILESTONES: readonly ProgressionMilestoneDefinition[] = [
  {
    level: 10,
    title: 'Identity',
    subtitle: 'Первая большая ступень — профиль получает собственную визуальную идентичность',
    frameStage: 1,
    asset: '/brand/frames/milestone/free/lv10-forbidden-relic.svg',
    premiumAsset: '/brand/frames/milestone/premium/lv10-forbidden-relic-premium.svg',
    premiumHint: 'Free — строгая матовая рамка. Premium — живая aura-анимация без бонуса к XP.',
  },
  {
    level: 25,
    title: 'Profile',
    subtitle: 'Оформление профиля переходит на следующую ступень',
    frameStage: 2,
    asset: '/brand/frames/milestone/free/lv25-flame-arc.svg',
    premiumAsset: '/brand/frames/milestone/premium/lv25-flame-arc-premium.svg',
    premiumHint: 'Free — статичная форма. Premium — animated flame arc, искры и glow.',
  },
  {
    level: 50,
    title: 'Veteran',
    subtitle: 'Профиль показывает долгий путь пользователя в AnimeBox',
    frameStage: 3,
    asset: '/brand/frames/milestone/free/lv50-crimson-sigil.svg',
    premiumAsset: '/brand/frames/milestone/premium/lv50-crimson-sigil-premium.svg',
    premiumHint: 'Free — матовая crimson-печать. Premium — живая sigil-анимация и спектральная аура.',
  },
  {
    level: 75,
    title: 'Elite',
    subtitle: 'Последняя долгосрочная ступень перед Prestige',
    frameStage: 4,
    asset: '/brand/frames/milestone/free/lv75-menacing-manga.svg',
    premiumAsset: '/brand/frames/milestone/premium/lv75-menacing-manga-premium.svg',
    premiumHint: 'Free — строгий manga-pressure. Premium — animated pressure, aura и более глубокий glow.',
  },
  {
    level: 100,
    title: 'Prestige',
    subtitle: 'Максимальный уровень без сброса прогресса — Prestige становится видимым',
    frameStage: 4,
    asset: '/brand/frames/milestone/free/lv100-absolute-prestige.svg',
    premiumAsset: '/brand/frames/milestone/premium/lv100-absolute-prestige-premium.svg',
    premiumHint: 'Prestige доступен всем. Premium добавляет максимальную animated-версию рамки и aura, но не ускоряет прогресс.',
  },
] as const;

export function evolutionFrameStageForLevel(level: number): EvolutionFrameStage {
  const safe = Math.max(1, Math.floor(Number(level) || 1));
  if (safe >= 75) return 4;
  if (safe >= 50) return 3;
  if (safe >= 25) return 2;
  if (safe >= 10) return 1;
  return 0;
}

export function prestigeTierForLevel(level: number): PrestigeTier {
  return Math.max(1, Math.floor(Number(level) || 1)) >= 100 ? 1 : 0;
}

export function nextProgressionMilestone(level: number) {
  const safe = Math.max(1, Math.floor(Number(level) || 1));
  return PROGRESSION_MILESTONES.find((item) => item.level > safe) ?? null;
}

export function progressionEvolutionState(
  progression: Pick<ProfileProgression, 'level'>,
  premium = false,
) {
  const level = Math.max(1, Math.floor(Number(progression.level) || 1));
  const frameStage = evolutionFrameStageForLevel(level);
  const prestigeTier = prestigeTierForLevel(level);
  const currentMilestone =
    [...PROGRESSION_MILESTONES].reverse().find((item) => level >= item.level) ?? null;
  const nextMilestone = nextProgressionMilestone(level);

  return {
    frameStage,
    prestigeTier,
    prestigeLabel: prestigeTier === 1 ? 'Prestige I' : null,
    premiumEvolutionEnabled: Boolean(premium && (frameStage > 0 || prestigeTier > 0)),
    currentMilestone,
    nextMilestone,
  };
}


export function evolutionFrameAsset(
  frameStage: EvolutionFrameStage,
  prestigeTier: PrestigeTier = 0,
) {
  if (prestigeTier >= 1) return '/brand/progression-v3/frame-prestige.svg';
  if (frameStage <= 0) return null;
  return `/brand/progression-v3/frame-stage-${frameStage}.svg`;
}


export function progressionMilestoneAsset(
  level: ProgressionMilestoneDefinition['level'],
  premium = false,
) {
  const milestone = PROGRESSION_MILESTONES.find((item) => item.level === level);
  if (!milestone) return null;
  return premium ? milestone.premiumAsset : milestone.asset;
}
