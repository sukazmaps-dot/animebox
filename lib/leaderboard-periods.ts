export type ClosedLeaderboardPeriod = {
  periodType: 'week' | 'month'; periodKey: string; startsAt: string; endsAt: string;
};

/** UTC, half-open periods; never include the ongoing week/month. */
export function closedLeaderboardPeriods(since: Date, now: Date): ClosedLeaderboardPeriod[] {
  if (!Number.isFinite(since.getTime()) || !Number.isFinite(now.getTime()) || since > now) return [];
  const result: ClosedLeaderboardPeriod[] = [];
  for (const type of ['week', 'month'] as const) {
    const start = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), type === 'month' ? 1 : since.getUTCDate()));
    if (type === 'week') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
    // Bounded history prevents an accidental ancient start producing huge work.
    for (let n = 0; n < 1200; n++) {
      const end = new Date(start);
      if (type === 'week') end.setUTCDate(end.getUTCDate() + 7);
      else end.setUTCMonth(end.getUTCMonth() + 1);
      if (end > now) break;
      result.push({ periodType: type, periodKey: start.toISOString().slice(0, type === 'week' ? 10 : 7), startsAt: start.toISOString(), endsAt: end.toISOString() });
      start.setTime(end.getTime());
    }
  }
  return result.sort((a, b) => a.endsAt.localeCompare(b.endsAt) || a.periodType.localeCompare(b.periodType));
}
