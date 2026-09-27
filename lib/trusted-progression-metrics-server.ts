import 'server-only';

import { adminClient } from '@/lib/community-server';

export type TrustedProgressionMetrics = {
  episodes: number;
  titles: number;
  minutes: number;
  watch_minutes: number;
  active_ms: number;
  shonen_titles: number;
  romance_titles: number;
  action_titles: number;
  fantasy_titles: number;
  comedy_titles: number;
  comments: number;
  longest_streak: number;
};

function safeMetric(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

export async function getTrustedProgressionMetrics(
  userId: string,
): Promise<TrustedProgressionMetrics | null> {
  const admin = adminClient();
  const { data, error } = await admin.rpc('trusted_progression_metrics', {
    p_user: userId,
  });

  if (error) {
    // Rollout is migration-safe: application code may reach production a few
    // seconds before Postgres schema refresh completes.
    if (
      /trusted_progression_metrics|schema cache|PGRST202|function/i.test(
        error.message,
      )
    ) {
      console.warn('[progression] trusted metrics RPC unavailable:', error.message);
      return null;
    }
    throw error;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;

  return {
    episodes: safeMetric(row.episodes),
    titles: safeMetric(row.titles),
    minutes: safeMetric(row.minutes),
    watch_minutes: safeMetric(row.watch_minutes),
    active_ms: safeMetric(row.active_ms),
    shonen_titles: safeMetric(row.shonen_titles),
    romance_titles: safeMetric(row.romance_titles),
    action_titles: safeMetric(row.action_titles),
    fantasy_titles: safeMetric(row.fantasy_titles),
    comedy_titles: safeMetric(row.comedy_titles),
    comments: safeMetric(row.comments),
    longest_streak: safeMetric(row.longest_streak),
  };
}
