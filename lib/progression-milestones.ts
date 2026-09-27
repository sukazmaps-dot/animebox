import type { ProfileProgression } from '@/lib/progression';

export type EvolutionFrameStage = 0 | 1 | 2 | 3 | 4;
export type PrestigeTier = 0 | 1;

export type ProgressionMilestoneDefinition = {
  level: 10 | 25 | 50 | 75 | 100;
  title: string;
  subtitle: string;
  frameStage: EvolutionFrameStage;
  asset: string;
  premiumHint: string;
};

export const PROGRESSION_MILESTONES: readonly ProgressionMilestoneDefinition[] = [
  {
    level: 10,
    title: 'Пробуждение',
    subtitle: 'Первая эволюция профиля',
    frameStage: 1,
    asset: '/brand/progression-v3/frame-stage-1.svg',
    premiumHint: 'Premium добавляет мягкую живую ауру, но не ускоряет XP.',
  },
  {
    level: 25,
    title: 'Вторая форма',
    subtitle: 'Профиль становится заметнее',
    frameStage: 2,
    asset: '/brand/progression-v3/frame-stage-2.svg',
    premiumHint: 'Premium усиливает motion и glow без gameplay-бонусов.',
  },
  {
    level: 50,
    title: 'Высшая форма',
    subtitle: 'Середина пути к престижу',
    frameStage: 3,
    asset: '/brand/progression-v3/frame-stage-3.svg',
    premiumHint: 'Premium оживляет декоративный слой рамки.',
  },
  {
    level: 75,
    title: 'Предельная форма',
    subtitle: 'Последняя ступень перед Prestige',
    frameStage: 4,
    asset: '/brand/progression-v3/frame-stage-4.svg',
    premiumHint: 'Premium добавляет более насыщенную атмосферу и свечение.',
  },
  {
    level: 100,
    title: 'Prestige I',
    subtitle: 'Максимальный уровень без сброса прогресса',
    frameStage: 4,
    asset: '/brand/progression-v3/frame-prestige.svg',
    premiumHint: 'Prestige одинаков для всех; Premium меняет только визуальную подачу.',
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
