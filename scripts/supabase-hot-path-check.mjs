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

const watchClient = read('components/useWatchSession.ts');
const watchServer = read('lib/watch-server.ts');
const seoIndex = read('lib/seo-episode-index.ts');
const timeline = read('lib/episode-timeline-server.ts');
const migration = read(
  'supabase/migrations/20260923170000_supabase_hot_path_relief_v1.sql',
);

for (const [label, source, needle] of [
  ['20s heartbeat cadence', watchClient, 'HEARTBEAT_INTERVAL_MS = 20_000'],
  ['conditional title writes', watchServer, 'titleNeedsWrite'],
  ['conditional episode writes', watchServer, 'episodeNeedsWrite'],
  ['SEO confirmation TTL', seoIndex, 'SEO_CONFIRM_TTL_MS'],
  ['SEO conditional upserts', seoIndex, 'confirmationStale'],
  ['timeline verification TTL', seoIndex, 'PLAYER_VERIFY_TTL_MS'],
  ['direct player URL read-before-write', timeline, "select('video_player_url,video_verified_at')"],
  ['product event full unique index', migration, 'on public.product_events (dedupe_key)'],
  ['challenge FK covering index', migration, 'user_challenge_completions_challenge_code_idx'],
  ['watch retention function', migration, 'cleanup_animebox_watch_hot_data'],
  ['watch retention schedule', migration, 'animebox-watch-hot-data-cleanup'],
]) {
  if (!source.includes(needle)) {
    failures.push(`Supabase hot path: missing ${label}.`);
  }
}

if (migration.includes('where (dedupe_key is not null)')) {
  failures.push(
    'Supabase hot path: product_events dedupe index must not remain partial.',
  );
}

if (watchClient.includes('HEARTBEAT_INTERVAL_MS = 10_000')) {
  failures.push('Supabase hot path: legacy 10s heartbeat cadence remains.');
}

if (failures.length) {
  console.error('\n[AnimeBox Supabase Hot Path] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Supabase Hot Path] invariants passed.');
