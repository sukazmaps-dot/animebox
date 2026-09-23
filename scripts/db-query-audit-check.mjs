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
  'supabase/migrations/20260923180500_db_query_index_audit_v1.sql',
);
const profileRoute = read('app/api/community/profile/route.ts');
const leaderboardRoute = read('app/api/community/leaderboard/route.ts');

for (const [label, needle] of [
  ['materialized user progress scan', 'user_progress as materialized'],
  ['single library aggregate', 'library_totals as'],
  ['single challenge activity aggregate', 'activity as ('],
  ['single streak aggregate', 'streak as ('],
  ['leaderboard heartbeat pre-aggregation', 'heartbeat_sessions as materialized'],
  ['archived leaderboard heartbeat pre-aggregation', 'finalize_leaderboard_season'],
  ['live comments partial index', 'comments_user_live_idx'],
  ['exact duplicate episode index removal', 'drop index if exists animebox_watch.watch_episodes_anime_idx'],
]) {
  if (!migration.includes(needle)) {
    failures.push(`DB audit: missing ${label}.`);
  }
}

if ((migration.match(/drop index/gi) ?? []).length !== 1) {
  failures.push(
    'DB audit: this patch may only drop the one proven exact-duplicate episode index.',
  );
}

if (!profileRoute.includes("client.rpc('my_community_profile')")) {
  failures.push('DB audit: profile must keep the consolidated profile RPC.');
}

if (!leaderboardRoute.includes("watch.rpc('leaderboard'")) {
  failures.push('DB audit: leaderboard route must keep the database RPC boundary.');
}

if (failures.length) {
  console.error('\n[AnimeBox DB Query Audit] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox DB Query Audit] query/index invariants passed.');
