import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { materializeLeaderboardSeasonRewards } from '@/lib/leaderboard-rewards-server';
import { missingLeaderboardPeriods } from '@/lib/leaderboard-periods';

export async function finalizeRecentLeaderboardSeasons(now = new Date(), shouldStop = () => false) {
  const admin = createSupabaseAdmin();
  const { data: health, error: healthError } = await admin.rpc('leaderboard_data_health');
  if (healthError) throw healthError;
  const existing: Array<{ period_type: string; period_key: string; starts_at: string }> = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await admin.from('leaderboard_seasons')
      .select('period_type,period_key,starts_at').order('starts_at', { ascending: true }).range(offset, offset + 499);
    if (error) throw error;
    existing.push(...(data ?? []));
    if ((data ?? []).length < 500) break;
  }
  const coveredFrom = typeof health?.coveredFrom === 'string' ? health.coveredFrom : now.toISOString();
  const periods = missingLeaderboardPeriods(existing, coveredFrom, now);
  const results: unknown[] = [];
  for (const period of periods.slice(0, 6)) {
    if (shouldStop()) break;
    const { data, error } = await admin.rpc('finalize_leaderboard_season', {
      p_period_type: period.periodType, p_period_key: period.periodKey,
      p_starts_at: period.startsAt, p_ends_at: period.endsAt,
    });
    if (error) throw error;
    // Partial periods never create competitive rewards. Historical archives stay unchanged.
    if (data?.status === 'complete' && typeof data.season_id === 'string') {
      const rewards = await materializeLeaderboardSeasonRewards(data.season_id);
      results.push({ ...data, rewards });
    } else results.push(data);
  }
  // Retry materialization if a previous run finalized successfully but failed before rewards.
  if (!shouldStop()) {
    const { data: recent, error } = await admin.from('leaderboard_seasons')
      .select('id').eq('archive_status', 'complete').gte('ends_at', new Date(now.getTime() - 35 * 86400000).toISOString())
      .order('ends_at', { ascending: false }).limit(6);
    if (error) throw error;
    for (const season of recent ?? []) {
      if (shouldStop()) break;
      await materializeLeaderboardSeasonRewards(season.id);
    }
  }
  return results;
}
