import fs from 'node:fs';

const watchRoute = fs.readFileSync('app/api/watch/route.ts', 'utf8');
const pipeline = fs.readFileSync('lib/trusted-progression-pipeline-server.ts', 'utf8');
const metricsServer = fs.readFileSync('lib/trusted-progression-metrics-server.ts', 'utf8');
const profileRoute = fs.readFileSync('app/api/community/profile/route.ts', 'utf8');
const communityClient = fs.readFileSync('lib/community-client.ts', 'utf8');
const achievements = fs.readFileSync('components/AchievementsClient.tsx', 'utf8');
const journeyPage = fs.readFileSync('app/achievements/journey/page.tsx', 'utf8');
const journeyClient = fs.readFileSync('components/AchievementJourneyClient.tsx', 'utf8');
const progressionAudit = fs.readFileSync('app/api/admin/progression-integrity/route.ts', 'utf8');
const migration = fs.readFileSync(
  'supabase/migrations/20260928010000_patch20_trusted_progression_v1.sql',
  'utf8',
);
const leagueMigration = fs.readFileSync(
  'supabase/migrations/20260928011000_patch20_trusted_league_v1.sql',
  'utf8',
);

const failures = [];

if (
  !watchRoute.includes('applyTrustedEpisodeCompletion') ||
  !watchRoute.includes('applyTrustedWatchSessionEnd') ||
  watchRoute.includes("reason: 'episode_completed'") ||
  watchRoute.includes("reason: 'watch_session_end'")
) {
  failures.push('watch route still bypasses trusted progression pipeline');
}

if (
  !pipeline.includes("eventName: 'trusted_episode_completed'") ||
  !pipeline.includes('syncUserChallenges({') ||
  !pipeline.includes('syncUserProgression({') ||
  !pipeline.includes("reason: 'trusted_episode_completed'") ||
  !pipeline.includes("reason: 'trusted_watch_session_end'")
) {
  failures.push('trusted progression event pipeline contract is incomplete');
}

if (
  !migration.includes('create table if not exists public.progression_trust_baselines') ||
  !migration.includes('base_credited_episodes') ||
  !migration.includes('base_active_ms') ||
  !migration.includes('e.created_at >= b.captured_at') ||
  !migration.includes('pe.created_at >= b.captured_at') ||
  !migration.includes('metrics := public.trusted_progression_metrics(p_user)') ||
  !migration.includes('premium_bonus_now') ||
  !migration.includes('grant execute on function public.sync_user_progression') ||
  migration.includes('metrics := public.community_metrics(p_user)')
) {
  failures.push('trusted progression SQL baseline or RPC replacement is incomplete');
}

if (
  !leagueMigration.includes("coalesce(pe.metadata->>'state', '') = 'high_risk'") ||
  !leagueMigration.includes('row_number() over') ||
  leagueMigration.indexOf("coalesce(pe.metadata->>'state', '') = 'high_risk'") >
    leagueMigration.indexOf('row_number() over')
) {
  failures.push('trusted League does not quarantine before ranking');
}

if (
  !metricsServer.includes("admin.rpc('trusted_progression_metrics'") ||
  !profileRoute.includes('getTrustedProgressionMetrics(user.id)') ||
  !communityClient.includes('rewardStats: {') ||
  !achievements.includes('data.rewardStats ?? data.stats')
) {
  failures.push('achievement UI is not using trusted reward metrics');
}

if (
  !journeyPage.includes('AchievementJourneyClient') ||
  !journeyClient.includes('ANIMEBOX JOURNEY') ||
  !journeyClient.includes('Trusted progression') ||
  !journeyClient.includes('profile.rewardStats ?? profile.stats')
) {
  failures.push('Journey route is missing trusted progression integration');
}

if (
  !progressionAudit.includes("requireAdmin(['owner', 'admin'])") ||
  !progressionAudit.includes('getProgressionIntegritySnapshot')
) {
  failures.push('progression integrity diagnostics are missing or unprotected');
}

if (failures.length) {
  console.error('Patch 20.0 Trust + Progression + Achievements check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: Patch 20.0 trusted progression, League, achievements and Journey');
