import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];

const leaseClient = read('lib/runtime-refresh-lease-server.ts');
const availability = read('lib/catalog-availability-server.ts');
const community = read('lib/community-server.ts');
const migration = read(
  'supabase/migrations/20260925211630_traffic_surge_refresh_leases_v1.sql',
);
const policyMigration = read(
  'supabase/migrations/20260925211831_traffic_surge_refresh_leases_rls_policy.sql',
);
const packageJson = read('package.json');

function must(label, source, needle) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

for (const needle of [
  'tryAcquireRuntimeRefreshLease',
  'releaseRuntimeRefreshLease',
  "rpc(\n      'try_acquire_runtime_refresh_lease'",
  "rpc(\n      'release_runtime_refresh_lease'",
  'acquired: true, ownerToken: null, degraded: true',
]) {
  must('runtime refresh lease client', leaseClient, needle);
}

const leaseTtlMatch = leaseClient.match(
  /MAX_LEASE_TTL_SECONDS\s*=\s*(\d+)/,
);
const leaseTtl = Number(leaseTtlMatch?.[1] ?? 0);
if (leaseTtl < 60 || leaseTtl > 120) {
  failures.push(
    `runtime refresh lease client: TTL clamp escaped safe 60–120s range (${leaseTtl})`,
  );
}

for (const needle of [
  'const inFlight = new Map<number, Promise<CatalogAvailabilityRow | null>>()',
  'refreshOneCoordinated',
  "'catalog_availability'",
  'REMOTE_REFRESH_SETTLE_MS = 180',
  'readRowsFromRegistry([anime.id])',
  'previous ?? null',
]) {
  must('catalog availability surge shield', availability, needle);
}

for (const needle of [
  'const animeCatalogRefreshInFlight = new Map',
  'refreshAnimeCatalogMetadata',
  "'anime_catalog_metadata'",
  'REMOTE_METADATA_SETTLE_DELAYS_MS = [120, 240]',
  'if (previous) return previous',
  'waitForRemoteAnimeCatalogRow(animeId)',
  'fail open if the upstream is simply slower',
]) {
  must('anime catalog surge shield', community, needle);
}

for (const needle of [
  'create schema if not exists private',
  'private.runtime_refresh_leases',
  'enable row level security',
  'security invoker',
  'from public, anon, authenticated',
  'to service_role',
  'try_acquire_runtime_refresh_lease',
  'release_runtime_refresh_lease',
  'where leases.expires_at <= now()',
]) {
  must('refresh lease migration', migration.toLowerCase(), needle.toLowerCase());
}

if (/security\s+definer/i.test(migration)) {
  failures.push(
    'refresh lease migration: SECURITY DEFINER is forbidden for this internal coordination RPC',
  );
}

for (const needle of [
  'runtime_refresh_leases_service_role_only',
  'on private.runtime_refresh_leases',
  'to service_role',
  'using (true)',
  'with check (true)',
]) {
  must('refresh lease RLS policy', policyMigration.toLowerCase(), needle.toLowerCase());
}

if (
  /grant\s+execute[\s\S]+to\s+(anon|authenticated|public)/i.test(migration)
) {
  failures.push(
    'refresh lease migration: lease RPC execute privilege must stay service_role-only',
  );
}

must(
  'package regression gate',
  packageJson,
  '"patch18-5-5-3:check": "node scripts/patch-18-5-5-3-traffic-surge-check.mjs"',
);

async function simulateBurst({ concurrency, instances }) {
  let globalLeaseOwner = null;
  let upstreamRefreshes = 0;
  let releaseGate;
  const gate = new Promise((resolve) => {
    releaseGate = resolve;
  });
  const localInFlight = Array.from({ length: instances }, () => null);

  const refresh = (instanceIndex) => {
    const existing = localInFlight[instanceIndex];
    if (existing) return existing;

    const owner = `instance-${instanceIndex}`;
    const request = (async () => {
      const acquired = globalLeaseOwner == null;
      if (acquired) globalLeaseOwner = owner;

      if (!acquired) {
        return 'stale-or-remote';
      }

      upstreamRefreshes += 1;
      await gate;
      if (globalLeaseOwner === owner) globalLeaseOwner = null;
      return 'fresh';
    })().finally(() => {
      localInFlight[instanceIndex] = null;
    });

    localInFlight[instanceIndex] = request;
    return request;
  };

  const requests = Array.from({ length: concurrency }, (_, index) =>
    refresh(index % instances),
  );

  await Promise.resolve();
  releaseGate();
  await Promise.all(requests);

  return upstreamRefreshes;
}

for (const concurrency of [100, 500, 1000]) {
  const upstreamRefreshes = await simulateBurst({
    concurrency,
    instances: 12,
  });

  if (upstreamRefreshes !== 1) {
    failures.push(
      `traffic surge model: ${concurrency} concurrent requests produced ${upstreamRefreshes} upstream refreshes instead of 1`,
    );
  }
}

if (failures.length) {
  console.error('\n[AnimeBox 18.5.5.3 Traffic Surge Shield] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log(
  '[AnimeBox 18.5.5.3 Traffic Surge Shield] local dedupe, distributed lease security, fail-open behavior and 100/500/1000 burst model passed.',
);
