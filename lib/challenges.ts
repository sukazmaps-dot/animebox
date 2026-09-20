export type ChallengeMetric =
  | 'active_minutes'
  | 'completed_episodes'
  | 'active_days';

export type ChallengeItem = {
  code: string;
  title: string;
  description: string;
  metric: ChallengeMetric;
  goal: number;
  progress: number;
  xpReward: number;
  completedAt: string | null;
};

export type ChallengeStreak = {
  current: number;
  longest: number;
  lastActiveDate: string | null;
};

export type ChallengeSnapshot = {
  todayKey: string;
  weekKey: string;
  streak: ChallengeStreak;
  daily: ChallengeItem[];
  weekly: ChallengeItem[];
};

function safeNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function challengeItem(raw: unknown): ChallengeItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const metric = String(row.metric || '') as ChallengeMetric;

  if (!['active_minutes', 'completed_episodes', 'active_days'].includes(metric)) {
    return null;
  }

  const code = typeof row.code === 'string' ? row.code : '';
  const title = typeof row.title === 'string' ? row.title : '';
  const description = typeof row.description === 'string' ? row.description : '';

  if (!code || !title) return null;

  return {
    code,
    title,
    description,
    metric,
    goal: Math.max(1, safeNumber(row.goal)),
    progress: safeNumber(row.progress),
    xpReward: safeNumber(row.xp_reward ?? row.xpReward),
    completedAt:
      typeof row.completed_at === 'string'
        ? row.completed_at
        : typeof row.completedAt === 'string'
          ? row.completedAt
          : null,
  };
}

export function normalizeChallengeSnapshot(raw: unknown): ChallengeSnapshot {
  const row =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const streakRaw =
    row.streak && typeof row.streak === 'object' && !Array.isArray(row.streak)
      ? (row.streak as Record<string, unknown>)
      : {};

  return {
    todayKey:
      typeof row.today_key === 'string'
        ? row.today_key
        : typeof row.todayKey === 'string'
          ? row.todayKey
          : '',
    weekKey:
      typeof row.week_key === 'string'
        ? row.week_key
        : typeof row.weekKey === 'string'
          ? row.weekKey
          : '',
    streak: {
      current: safeNumber(streakRaw.current),
      longest: safeNumber(streakRaw.longest),
      lastActiveDate:
        typeof streakRaw.last_active_date === 'string'
          ? streakRaw.last_active_date
          : typeof streakRaw.lastActiveDate === 'string'
            ? streakRaw.lastActiveDate
            : null,
    },
    daily: (Array.isArray(row.daily) ? row.daily : [])
      .map(challengeItem)
      .filter((item): item is ChallengeItem => Boolean(item)),
    weekly: (Array.isArray(row.weekly) ? row.weekly : [])
      .map(challengeItem)
      .filter((item): item is ChallengeItem => Boolean(item)),
  };
}

export function challengeMetricLabel(metric: ChallengeMetric) {
  if (metric === 'active_minutes') return 'мин';
  if (metric === 'completed_episodes') return 'серий';
  return 'дней';
}

export function challengePercent(challenge: ChallengeItem) {
  return Math.min(
    100,
    Math.round((challenge.progress / Math.max(1, challenge.goal)) * 100),
  );
}
