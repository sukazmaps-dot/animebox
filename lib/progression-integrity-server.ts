import 'server-only';

import { adminClient } from '@/lib/community-server';

function countOrZero(value: number | null | undefined) {
  return Math.max(0, Number(value ?? 0));
}

export async function getProgressionIntegritySnapshot() {
  const admin = adminClient();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();

  const [
    progressionUsers,
    progressionEvents,
    trustedEpisodeEvents,
    trustAssessments,
    highRiskAssessments,
    challengeEvents,
    achievementUnlocks,
  ] = await Promise.all([
    admin.from('user_progression').select('user_id', { count: 'exact', head: true }),
    admin
      .from('progression_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since7d),
    admin
      .from('product_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_name', 'trusted_episode_completed')
      .gte('created_at', since7d),
    admin
      .from('product_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_name', 'watch_trust_assessed')
      .gte('created_at', since7d),
    admin
      .from('product_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_name', 'watch_trust_assessed')
      .contains('metadata', { state: 'high_risk' })
      .gte('created_at', since7d),
    admin
      .from('challenge_activity_events')
      .select('event_key', { count: 'exact', head: true })
      .gte('created_at', since7d),
    admin
      .from('user_achievements')
      .select('achievement_code', { count: 'exact', head: true })
      .gte('earned_at', since7d),
  ]);

  for (const result of [
    progressionUsers,
    progressionEvents,
    trustedEpisodeEvents,
    trustAssessments,
    highRiskAssessments,
    challengeEvents,
    achievementUnlocks,
  ]) {
    if (result.error) throw result.error;
  }

  let baselineRows = 0;
  let baselineReady = true;
  const baseline = await admin
    .from('progression_trust_baselines')
    .select('user_id', { count: 'exact', head: true });

  if (baseline.error) {
    if (/progression_trust_baselines|schema cache|relation/i.test(baseline.error.message)) {
      baselineReady = false;
    } else {
      throw baseline.error;
    }
  } else {
    baselineRows = countOrZero(baseline.count);
  }

  return {
    generatedAt: new Date().toISOString(),
    window: '7d',
    migration: {
      trustedBaselineReady: baselineReady,
      baselineRows,
    },
    progressionUsers: countOrZero(progressionUsers.count),
    progressionEvents7d: countOrZero(progressionEvents.count),
    trustedEpisodeEvents7d: countOrZero(trustedEpisodeEvents.count),
    trustAssessments7d: countOrZero(trustAssessments.count),
    highRiskAssessments7d: countOrZero(highRiskAssessments.count),
    challengeEvents7d: countOrZero(challengeEvents.count),
    achievementUnlocks7d: countOrZero(achievementUnlocks.count),
  };
}
