import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

function currentWeekStartUtc(now: Date) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay();
  const distanceFromMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - distanceFromMonday);
  return date;
}

function previousWeek(now: Date) {
  const end = currentWeekStartUtc(now);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);

  return {
    periodType: 'week' as const,
    periodKey: start.toISOString().slice(0, 10),
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };
}

function previousMonth(now: Date) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));

  return {
    periodType: 'month' as const,
    periodKey: start.toISOString().slice(0, 7),
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };
}

export async function finalizeRecentLeaderboardSeasons(now = new Date()) {
  const admin = createSupabaseAdmin();
  const periods = [previousWeek(now), previousMonth(now)];
  const results: unknown[] = [];

  for (const period of periods) {
    const { data, error } = await admin.rpc('finalize_leaderboard_season', {
      p_period_type: period.periodType,
      p_period_key: period.periodKey,
      p_starts_at: period.startsAt,
      p_ends_at: period.endsAt,
    });

    if (error) throw error;
    results.push(data);
  }

  return results;
}
