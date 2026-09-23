import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  const full = join(root, path);
  if (!existsSync(full)) {
    failures.push(`${path}: required file is missing.`);
    return '';
  }
  return readFileSync(full, 'utf8');
}

const migration = read(
  'supabase/migrations/20260923190000_profile_leaderboard_aggregation_v1.sql',
);
const profileRoute = read('app/api/community/profile/route.ts');
const leaderboardRoute = read('app/api/community/leaderboard/route.ts');
const watchServer = read('lib/watch-server.ts');
const avatarServer = read('lib/public-avatar-server.ts');

for (const [label, source, needle] of [
  ['title overview RPC', migration, 'animebox_watch.title_overview_rows'],
  ['profile bundle RPC', migration, 'public.my_community_profile_bundle'],
  ['leaderboard bundle RPC', migration, 'public.community_leaderboard_bundle'],
  ['profile challenges aggregation', migration, "'challenges', public.user_challenges_snapshot(uid)"],
  ['profile premium aggregation', migration, "'premium_badge', exists("],
  ['profile watch rows aggregation', migration, "'watch_overview_rows'"],
  ['leaderboard entitlement aggregation', migration, 'active_entitlements as'],
  ['watch overview RPC client', watchServer, "watch.rpc('title_overview_rows'"],
  ['watch RPC parser', watchServer, 'watchTitleOverviewsFromRpcRows'],
  ['profile single bundle call', profileRoute, "client.rpc('my_community_profile_bundle')"],
  ['leaderboard single bundle call', leaderboardRoute, "'community_leaderboard_bundle'"],
  ['preloaded appearance resolver', avatarServer, 'resolvePublicAppearancesFromPreloaded'],
]) {
  if (!source.includes(needle)) {
    failures.push(`Profile aggregation: missing ${label}.`);
  }
}

for (const forbidden of [
  'getUserEntitlements',
  'getUserChallengesSnapshot',
  'getTitleWatchOverviews',
]) {
  if (profileRoute.includes(forbidden)) {
    failures.push(
      `Profile aggregation: profile route still performs extra read through ${forbidden}.`,
    );
  }
}

for (const forbidden of [
  'getSponsorStatuses',
  'resolvePublicAppearances(',
  ".from('user_progression')",
]) {
  if (leaderboardRoute.includes(forbidden)) {
    failures.push(
      `Profile aggregation: leaderboard route still performs extra enrichment read through ${forbidden}.`,
    );
  }
}

if (failures.length) {
  console.error('\n[AnimeBox Profile Aggregation] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Profile Aggregation] RPC aggregation invariants passed.');
