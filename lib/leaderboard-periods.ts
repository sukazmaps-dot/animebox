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

/** Each period type has its own historical horizon. A legacy empty month
 * must never manufacture weeks predating the site's weekly seasons. */
export function missingLeaderboardPeriods(
  existing: Array<{ period_type: string; period_key: string; starts_at: string }>,
  coveredFrom: string,
  now: Date,
): ClosedLeaderboardPeriod[] {
  const known = new Set(existing.map(row => `${row.period_type}:${row.period_key}`));
  return (['week', 'month'] as const).flatMap(type => {
    const first = existing.filter(row => row.period_type === type)
      .reduce((since, row) => !since || row.starts_at < since ? row.starts_at : since, '');
    const since = first || coveredFrom;
    return closedLeaderboardPeriods(new Date(since), now)
      .filter(period => period.periodType === type && !known.has(`${type}:${period.periodKey}`));
  }).sort((a, b) => a.endsAt.localeCompare(b.endsAt) || a.periodType.localeCompare(b.periodType));
}
