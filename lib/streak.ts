export type StreakTier =
  | 'inactive'
  | 'warm'
  | 'active'
  | 'hot'
  | 'blazing'
  | 'legendary';

const MILESTONES = [1, 3, 7, 14, 30, 60, 100] as const;

export function streakTier(current: number): StreakTier {
  const days = Math.max(0, Math.floor(current || 0));
  if (days <= 0) return 'inactive';
  if (days <= 2) return 'warm';
  if (days <= 6) return 'active';
  if (days <= 13) return 'hot';
  if (days <= 29) return 'blazing';
  return 'legendary';
}

export function streakTierLabel(current: number) {
  const tier = streakTier(current);
  if (tier === 'inactive') return 'Не начата';
  if (tier === 'warm') return 'Разогрев';
  if (tier === 'active') return 'Стабильно';
  if (tier === 'hot') return 'Горит';
  if (tier === 'blazing') return 'Пылает';
  return 'Легендарная';
}

export function streakDays(value: number) {
  const days = Math.max(0, Math.floor(value || 0));
  const mod10 = days % 10;
  const mod100 = days % 100;

  if (mod10 === 1 && mod100 !== 11) return `${days} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${days} дня`;
  }
  return `${days} дней`;
}

export function streakMilestone(current: number) {
  const days = Math.max(0, Math.floor(current || 0));
  const found = MILESTONES.find((target) => target > days);
  const target =
    found ??
    Math.max(120, Math.ceil((days + 1) / 30) * 30);

  const progress = Math.min(1, days / Math.max(1, target));
  const filledSegments =
    days <= 0 ? 0 : Math.max(1, Math.min(7, Math.ceil(progress * 7)));

  return {
    target,
    progress,
    percent: Math.round(progress * 100),
    filledSegments,
  };
}

export function streakActiveToday(
  lastActiveDate: string | null | undefined,
  todayKey: string | null | undefined,
) {
  if (!lastActiveDate || !todayKey) return false;
  return lastActiveDate.slice(0, 10) === todayKey.slice(0, 10);
}

export function streakHint({
  current,
  activeToday,
}: {
  current: number;
  activeToday: boolean;
}) {
  if (current <= 0) {
    return '10 минут подтверждённого просмотра запустят серию.';
  }
  if (activeToday) {
    return 'Сегодня уже засчитано — серия в безопасности.';
  }
  return 'Посмотри 10 минут сегодня, чтобы сохранить серию.';
}
