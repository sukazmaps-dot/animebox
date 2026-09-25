import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read(
  'supabase/migrations/20260925152000_production_observability_v2.sql',
);
const helper = read('lib/request-observability-server.ts');
const healthServer = read('lib/system-health-server.ts');
const healthTypes = read('lib/system-health.ts');
const dashboard = read('components/admin/SystemHealthDashboard.tsx');
const cron = read('app/api/cron/catalog-availability/route.ts');

const routes = new Map([
  ['app/api/anime/route.ts', '/api/anime'],
  ['app/api/recommendations/route.ts', '/api/recommendations'],
  ['app/api/discovery/route.ts', '/api/discovery'],
  ['app/api/players/kodik/route.ts', '/api/players/kodik'],
  ['app/api/anilibria/route.ts', '/api/anilibria'],
  ['app/api/player/direct-source/route.ts', '/api/player/direct-source'],
]);

const failures = [];

for (const needle of [
  'create table if not exists public.system_request_metrics',
  'create or replace function public.record_system_request_metric',
  'create or replace function public.prune_system_request_metrics',
  'alter table public.system_request_metrics enable row level security',
  'grant select, insert, update, delete on table public.system_request_metrics to service_role',
  'latency_2500_plus',
]) {
  if (!migration.includes(needle)) {
    failures.push(`request telemetry migration missing: ${needle}`);
  }
}

for (const forbidden of [
  'ip_address',
  'query_string',
  'request_body',
  'user_id',
]) {
  if (migration.includes(forbidden)) {
    failures.push(`request telemetry stores forbidden raw field: ${forbidden}`);
  }
}

if (
  !helper.includes('SUCCESS_SAMPLE_RATE = 8') ||
  !helper.includes('SLOW_REQUEST_MS = 1_500') ||
  !helper.includes("input.statusCode === 429") ||
  !helper.includes("service: 'api-runtime'") ||
  !helper.includes('x-animebox-request-id') ||
  !helper.includes('Request telemetry is deliberately fail-open')
) {
  failures.push('request observability helper lost sampling/request-id/fail-open semantics');
}

for (const [path, routeKey] of routes) {
  const source = read(path);
  if (
    !source.includes('observeApiRoute') ||
    !source.includes(`observeApiRoute('${routeKey}'`)
  ) {
    failures.push(`${path}: critical route is not observed as ${routeKey}`);
  }
}

if (
  !healthServer.includes("from('system_request_metrics')") ||
  !healthServer.includes('requestHealthFromRows') ||
  !healthServer.includes('errorRate1hPct') ||
  !healthServer.includes('p95Ms1h') ||
  !healthServer.includes('p99Ms1h') ||
  !healthServer.includes('probeSupabase') ||
  !healthServer.includes('probeMediaEdge') ||
  !healthServer.includes("protocol === 'variants-v3'")
) {
  failures.push('System Health server does not aggregate API runtime telemetry');
}

if (
  !healthTypes.includes('RequestPlatformHealth') ||
  !healthTypes.includes('RequestRouteHealth') ||
  !healthTypes.includes('SystemDependenciesHealth') ||
  !dashboard.includes('API RUNTIME · 1H') ||
  !dashboard.includes('DEPENDENCIES') ||
  !dashboard.includes('health.requests.routes')
) {
  failures.push('System Health UI/types do not expose request telemetry');
}

if (
  !cron.includes('pruneSystemRequestMetrics(30)') ||
  !cron.includes('prunedRequestMetrics')
) {
  failures.push('daily catalog cron does not prune request telemetry');
}

if (failures.length) {
  console.error('\n[AnimeBox 18.5.3 Observability] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log(
  '[AnimeBox 18.5.3 Observability] bounded request telemetry, incident correlation and retention invariants passed.',
);
