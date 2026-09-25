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
const watchRoute = read('app/api/watch/route.ts');
const watchServer = read('lib/watch-server.ts');
const communityServer = read('lib/community-server.ts');
const availabilityServer = read('lib/catalog-availability-server.ts');
const seoIndex = read('lib/seo-episode-index.ts');
const timeline = read('lib/episode-timeline-server.ts');
const migration = read(
  'supabase/migrations/20260923170000_supabase_hot_path_relief_v1.sql',
);
const scaleMigration = read(
  'supabase/migrations/20260925205500_scale_hot_paths_v1.sql',
);

for (const [label, source, needle] of [
  ['20s heartbeat cadence', watchClient, 'HEARTBEAT_INTERVAL_MS = 20_000'],
  ['heartbeat persistence floor', watchServer, 'MIN_HEARTBEAT_PERSIST_INTERVAL_MS = 2_000'],
  ['heartbeat lifecycle-only durable limits', watchRoute, "action === 'start' || action === 'end'"],
  ['watch session rate limit scope', watchRoute, "scope: 'watch_session_user'"],
  ['catalog read cache', communityServer, 'ANIME_CATALOG_READ_TTL_MS = 60_000'],
  ['availability read cache', availabilityServer, 'REGISTRY_READ_TTL_MS = 60_000'],
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
  ['comment reporter FK index', scaleMigration, 'comment_reports_reporter_id_idx'],
  ['comment resolver FK index', scaleMigration, 'comment_reports_resolved_by_idx'],
  ['favorite anime FK index', scaleMigration, 'profile_favorite_anime_anime_id_idx'],
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
