import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read(
  'supabase/migrations/20260926093845_production_readiness_v1.sql',
);
const controls = read('lib/runtime-controls-server.ts');
const jobGuard = read('lib/operational-job-server.ts');
const lease = read('lib/runtime-refresh-lease-server.ts');
const readiness = read('lib/production-readiness-server.ts');
const productionHealth = read('lib/production-health.ts');
const productionHealthServer = read('lib/production-health-server.ts');
const systemHealth = read('lib/system-health-server.ts');
const systemHealthTypes = read('lib/system-health.ts');
const dashboard = read('components/admin/SystemHealthDashboard.tsx');
const adminControls = read('app/api/admin/system-health/controls/route.ts');
const recommendations = read('app/api/recommendations/route.ts');
const discovery = read('app/api/discovery/route.ts');
const watchParty = read('app/api/watch-party/rooms/route.ts');
const comments = read('app/api/comments/route.ts');
const maintenance = read('app/api/cron/production-maintenance/route.ts');
const catalogCron = read('app/api/cron/catalog-availability/route.ts');
const premiumCron = read('app/api/cron/premium-lifecycle/route.ts');
const boostyCron = read('app/api/cron/boosty-premium/route.ts');
const seoCron = read('app/api/cron/seo-anime-index/route.ts');
const notificationsCron = read('app/api/cron/episode-notifications/route.ts');
const observabilityGate = read('scripts/patch-18-5-3-observability-check.mjs');
const smartPlayerGate = read('scripts/smart-playback-video-seo-check.mjs');
const sitemapIndex = read('app/sitemap-index.xml/route.ts');
const vercel = JSON.parse(read('vercel.json'));
const pkg = JSON.parse(read('package.json'));

const failures = [];

function need(label, source, needles) {
  for (const needle of needles) {
    if (!source.includes(needle)) {
      failures.push(`${label} missing: ${needle}`);
    }
  }
}

need('production readiness migration', migration, [
  'create table if not exists public.system_runtime_controls',
  'alter table public.system_runtime_controls enable row level security',
  'from public, anon, authenticated, service_role',
  'grant select, insert, update',
  'system_runtime_controls_service_role_only',
  "'platform_mode'",
  "'brownout'",
  "'background_jobs'",
  'v_ttl integer := greatest(5, least(coalesce(p_ttl_seconds, 15), 120))',
  'create or replace function public.prune_animebox_operational_data',
  'security invoker',
  'system_request_metrics',
  'product_events',
  'runtime_refresh_leases',
  "'max_connections'",
  "'connection_pct'",
  'revoke execute on function public.animebox_production_health_snapshot()',
]);

for (const forbidden of [
  'grant select on table public.system_runtime_controls to anon',
  'grant select on table public.system_runtime_controls to authenticated',
]) {
  if (migration.toLowerCase().includes(forbidden)) {
    failures.push(`runtime controls exposed to browser role: ${forbidden}`);
  }
}

need('runtime controls', controls, [
  "export type PlatformRuntimeMode = 'normal' | 'brownout'",
  "'recommendations'",
  "'smart_discovery'",
  "'watch_together'",
  "'community_writes'",
  "'background_jobs'",
  'CACHE_TTL_MS = 5_000',
  'fail open',
  'localUpstreamPressure',
  'queued >= 20 || openCircuits >= 2',
  'runtimeFeatureDecision',
  'runtimeFeatureUnavailableResponse',
]);

need('admin runtime control API', adminControls, [
  "requireAdmin(['owner', 'admin'])",
  "requireAdminMutation(request, ['owner', 'admin'])",
  'runtime_control_updated',
  'setRuntimeControl',
  "'Cache-Control': 'private, no-store'",
]);

need('operational job guard', jobGuard, [
  "tryAcquireRuntimeRefreshLease(",
  "'system_job'",
  'features.background_jobs',
  "controls.mode === 'brownout'",
  'allowDuringBrownout',
  'budgetMs',
  'deadlineAt',
  'shouldStop',
  'releaseRuntimeRefreshLease',
]);

need('lease extension', lease, [
  "'system_job'",
  'MAX_LEASE_TTL_SECONDS = 120',
]);

need('retention service', readiness, [
  "'prune_animebox_operational_data'",
  'jobRetentionDays: input.jobRetentionDays ?? 30',
  'requestRetentionDays: input.requestRetentionDays ?? 30',
  'eventRetentionDays: input.eventRetentionDays ?? 180',
]);

need('recommendation brownout', recommendations, [
  "runtimeFeatureDecision(",
  "'recommendations'",
  'considerLocalPressure: true',
  'brownout ? 10 : DEFAULT_LIMIT',
  "page % 2 === 0 ? 'popularity' : 'ranked'",
  '!brownout',
  "X-AnimeBox-Degraded",
]);

need('discovery shedding', discovery, [
  "'smart_discovery'",
  'disableInBrownout: true',
  'considerLocalPressure: true',
  'runtimeFeatureUnavailableResponse',
  'snapshot.features.background_jobs',
]);

need('Watch Together shedding', watchParty, [
  "'watch_together'",
  'disableInBrownout: true',
  'rooms: []',
  'runtimeFeatureUnavailableResponse',
]);

need('community write shedding', comments, [
  "'community_writes'",
  'disableInBrownout: true',
  'runtimeFeatureUnavailableResponse',
]);

const guardedCrons = new Map([
  ['catalog', catalogCron],
  ['premium', premiumCron],
  ['boosty', boostyCron],
  ['seo', seoCron],
  ['notifications', notificationsCron],
  ['maintenance', maintenance],
]);

for (const [label, source] of guardedCrons) {
  need(`${label} cron guard`, source, [
    'beginOperationalJob(',
    'permit.allowed',
    'permit.release()',
  ]);
}

need('maintenance cron', maintenance, [
  "createSystemJobObserver('production-maintenance'",
  'allowDuringBrownout: true',
  'pruneOperationalData()',
  'cleanupWatchPartyRooms()',
  'cleanupApiRateBuckets()',
  'Promise.allSettled',
]);

for (const [path, schedule] of [
  ['/api/cron/production-maintenance', '17 5 * * *'],
  ['/api/cron/catalog-availability', '13 * * * *'],
  ['/api/cron/seo-anime-index', '53 4 * * *'],
]) {
  if (
    !vercel.crons?.some(
      (item) => item.path === path && item.schedule === schedule,
    )
  ) {
    failures.push(`Vercel cron schedule missing/changed: ${path} @ ${schedule}`);
  }
}

need('production health headroom type', productionHealth, [
  'maxConnections: number',
  'connectionPct: number | null',
]);
need('production health mapping', productionHealthServer, [
  'maxConnections: finite(database.max_connections)',
  'connectionPct:',
  'database.connection_pct',
]);

need('capacity model', systemHealth, [
  'CAPACITY_THRESHOLDS',
  'databaseDegradedPct: 70',
  'databaseCriticalPct: 85',
  'upstreamQueueDegraded: 10',
  'upstreamQueueCritical: 25',
  'buildCapacityHealth',
  'databaseHeadroomPct',
  'brownoutRecommended',
  'getRuntimeControlSnapshot',
]);

need('capacity/control health types', systemHealthTypes, [
  'SystemRuntimeControlHealth',
  'SystemCapacityHealth',
  'controls: SystemRuntimeControlHealth',
  'capacity: SystemCapacityHealth',
  'brownoutActive: boolean',
  'brownoutRecommended: boolean',
]);

need('System Health control UI', dashboard, [
  'PRODUCTION READINESS · 18.5.6',
  'CAPACITY & BROWNOUT',
  'EMERGENCY CONTROL PLANE',
  '/api/admin/system-health/controls',
  'health.capacity.databaseHeadroomPct',
  'health.controls.controls.map',
]);

// Compatibility regression: 18.5.5 moved video sitemap discovery behind a
// sitemap index. Older smart-player verification must accept that architecture.
if (
  !smartPlayerGate.includes('videoSitemapExposedViaIndex') ||
  !smartPlayerGate.includes("sitemapIndex.includes('/video-sitemap.xml')") ||
  !sitemapIndex.includes('/video-sitemap.xml')
) {
  failures.push('video SEO regression gate is not sitemap-index aware');
}

// Compatibility regression: 18.5.6 moves request telemetry retention out of
// the catalog refresh job into isolated production maintenance.
if (
  !observabilityGate.includes('productionMaintenanceRetention') ||
  !observabilityGate.includes('/api/cron/production-maintenance') ||
  !observabilityGate.includes('pruneOperationalData()')
) {
  failures.push('18.5.3 observability gate still assumes catalog-owned retention');
}

if (
  pkg.scripts?.['patch18-5-6:check'] !==
  'node scripts/patch-18-5-6-production-readiness-check.mjs'
) {
  failures.push('package.json is missing patch18-5-6:check');
}

if (
  !String(pkg.scripts?.prebuild ?? '').includes('npm run patch18-5-6:check')
) {
  failures.push('prebuild does not execute patch18-5-6:check');
}

if (failures.length) {
  console.error('\n[AnimeBox 18.5.6 Production Readiness] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      runtimeControls: 6,
      brownout: true,
      localPressureBrownout: true,
      guardedCrons: guardedCrons.size,
      distributedJobLeaseSeconds: 90,
      dbHeadroom: true,
      isolatedMaintenance: true,
    },
    null,
    2,
  ),
);
console.log(
  '[AnimeBox 18.5.6 Production Readiness] control-plane, brownout, cron-lock, retention and capacity invariants passed.',
);
