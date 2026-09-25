import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read(
  'supabase/migrations/20260924182609_core_platform_observability_v1.sql',
);
const observability = read('lib/system-observability-server.ts');
const healthServer = read('lib/system-health-server.ts');
const healthRoute = read('app/api/admin/system-health/route.ts');
const dashboard = read('components/admin/SystemHealthDashboard.tsx');
const incidentRoute = read(
  'app/api/admin/system-health/incidents/[incidentId]/resolve/route.ts',
);
const sourceControl = read('lib/player-source-control.ts');

const cronPaths = [
  'app/api/cron/catalog-availability/route.ts',
  'app/api/cron/boosty-premium/route.ts',
  'app/api/cron/donatepay-sync/route.ts',
  'app/api/cron/episode-notifications/route.ts',
  'app/api/cron/leaderboard-seasons/route.ts',
  'app/api/cron/premium-lifecycle/route.ts',
  'app/api/cron/star-reconciliation/route.ts',
];

const failures = [];

for (const needle of [
  'create table if not exists public.system_job_runs',
  'create table if not exists public.system_incidents',
  'create or replace function public.report_system_incident',
  'create or replace function public.resolve_system_incident',
  'alter table public.system_job_runs enable row level security',
  'alter table public.system_incidents enable row level security',
  'grant select, insert, update, delete on table public.system_job_runs to service_role',
]) {
  if (!migration.includes(needle)) {
    failures.push(`observability migration missing: ${needle}`);
  }
}

if (
  !observability.includes('Observability is fail-open') ||
  !observability.includes('createSystemJobObserver') ||
  !observability.includes("status: 'failed'") ||
  !observability.includes("status: 'degraded'")
) {
  failures.push('system observability helper lost fail-open job/incident semantics');
}

for (const path of cronPaths) {
  const source = read(path);
  if (!source.includes('createSystemJobObserver')) {
    failures.push(`${path}: cron is not connected to the system job journal`);
  }
}

if (
  !sourceControl.includes('fingerprint:') ||
  !sourceControl.includes("service: 'player-provider'") ||
  !sourceControl.includes('resolveSystemIncident') ||
  !sourceControl.includes('reportSystemIncident')
) {
  failures.push('player provider runtime is not connected to incident lifecycle');
}

if (
  !healthServer.includes("from('system_job_runs')") ||
  !healthServer.includes("from('system_incidents')") ||
  !healthServer.includes("from('player_provider_runtime')") ||
  !healthServer.includes("from('notification_service_health')") ||
  !healthServer.includes("'player_source_fallback'") ||
  !healthServer.includes("'player_source_exhausted'") ||
  !healthServer.includes("'player_resume_applied'")
) {
  failures.push('System Health server lost one or more production/watch signal sources');
}

if (
  !healthRoute.includes("requireAdmin(['owner', 'admin'])") ||
  !dashboard.includes('/api/admin/system-health') ||
  !(
    dashboard.includes('WATCH PLATFORM · 17.6') ||
    dashboard.includes('PRODUCTION OBSERVABILITY · 18.5.3')
  )
) {
  failures.push('admin System Health surface is not protected/wired');
}

if (
  !incidentRoute.includes('requireAdminMutation') ||
  !incidentRoute.includes('writeAdminAudit') ||
  !incidentRoute.includes("action: 'system_incident_resolved'") ||
  !incidentRoute.includes('assertBrowserMutationRequest')
) {
  failures.push('incident resolution lost admin mutation/audit protection');
}

if (failures.length) {
  console.error('[AnimeBox Core Platform 17.5] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  '[AnimeBox Core Platform 17.5] observability, incidents, jobs and provider health invariants passed.',
);
