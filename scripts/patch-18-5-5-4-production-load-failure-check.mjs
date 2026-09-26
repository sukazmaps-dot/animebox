import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const resilience = read('lib/upstream-resilience-server.ts');
const fetchRetry = read('lib/fetch-retry.ts');
const sourceControl = read('lib/player-source-control.ts');
const lease = read('lib/runtime-refresh-lease-server.ts');
const policyTypes = read('types/player-source-policy.ts');
const kodikRoute = read('app/api/players/kodik/route.ts');
const directRoute = read('app/api/player/direct-source/route.ts');
const aniLibertyRoute = read('app/api/anilibria/route.ts');
const sourceAvailability = read('lib/source-availability.ts');
const catalogAvailability = read('lib/catalog-availability-server.ts');
const systemHealth = read('lib/system-health-server.ts');
const systemHealthTypes = read('lib/system-health.ts');
const dashboard = read('components/admin/SystemHealthDashboard.tsx');
const packageJson = JSON.parse(read('package.json'));

const failures = [];

function requireNeedles(label, source, needles) {
  for (const needle of needles) {
    if (!source.includes(needle)) {
      failures.push(`${label} missing: ${needle}`);
    }
  }
}

requireNeedles('upstream resilience', resilience, [
  "export type UpstreamKey",
  "'anilist'",
  "'shikimori'",
  "'kodik'",
  "'aniliberty'",
  "'direct'",
  'concurrency: 6',
  'concurrency: 5',
  'concurrency: 8',
  'concurrency: 4',
  'maxQueue: 36',
  'maxQueue: 30',
  'maxQueue: 40',
  'maxQueue: 28',
  'maxQueue: 20',
  "reason:",
  "'queue_full'",
  "'queue_timeout'",
  "'circuit_open'",
  "'aborted'",
  'rejectQueuedForOpen(key)',
  'failureThreshold',
  'openUntil',
  'halfOpenInFlight',
  'runWithUpstreamBudget',
  'getUpstreamRuntimeSnapshot',
]);

if (/maxQueue:\s*(?:Infinity|Number\.MAX_SAFE_INTEGER)/.test(resilience)) {
  failures.push('upstream resilience contains an effectively unbounded queue');
}

requireNeedles('bounded retry', fetchRetry, [
  'upstreamKeyForUrl(input)',
  'runWithUpstreamBudget(',
  'Math.min(3, Math.max(1, Math.round(attempts)))',
  'isUpstreamPressureError(error)',
  'throw error;',
]);

requireNeedles('distributed provider recovery', lease, [
  "'player_provider_half_open'",
]);
requireNeedles('provider policy recovery', policyTypes, [
  'halfOpenProbe: boolean',
]);
requireNeedles('provider recovery control', sourceControl, [
  'halfOpenProbe =',
  "runtime.state === 'unavailable'",
  'claimProviderHalfOpenProbe',
  "'player_provider_half_open'",
  'lease.acquired',
]);

for (const [label, source, provider] of [
  ['Kodik route', kodikRoute, 'kodik'],
  ['Direct route', directRoute, 'direct'],
  ['AniLiberty route', aniLibertyRoute, 'aniliberty'],
]) {
  requireNeedles(label, source, [
    'claimProviderHalfOpenProbe(',
    `'${provider}'`,
    "'provider_recovering'",
    "'Retry-After'",
  ]);
}

requireNeedles('Kodik overload path', kodikRoute, [
  'isUpstreamPressureError(error)',
  "'server_busy'",
  'upstreamPressureReason(error)',
]);
requireNeedles('Direct overload path', directRoute, [
  "result.reason === 'server_busy'",
  'if (!serverBusy)',
]);
requireNeedles('AniLiberty overload path', aniLibertyRoute, [
  'runWithUpstreamBudget(',
  'isUpstreamPressureError(error)',
  "reason = 'server_busy'",
  "if (reason !== 'server_busy')",
]);
requireNeedles('catalog source backpressure', sourceAvailability, [
  'runWithUpstreamBudget(',
  'isUpstreamPressureError(error)',
  "'unknown'",
  'Видеоисточник временно перегружен',
]);

// Failure-shield changes must not weaken the verified-first catalogue policy.
requireNeedles('verified-first catalogue', catalogAvailability, [
  'const CONFIRMED_MISS_THRESHOLD = 3',
  "availabilityStatus = 'unknown'",
  'const wasEverPlayable = Boolean(',
  '!wasEverPlayable || consecutiveMisses >= CONFIRMED_MISS_THRESHOLD',
  "state === 'playable' || state === 'degraded'",
]);

requireNeedles('System Health upstream observability', systemHealth, [
  'getUpstreamRuntimeSnapshot',
  'upstreamCircuitOpen',
  'upstreamQueued',
  'upstreams,',
]);
requireNeedles('System Health upstream types', systemHealthTypes, [
  'SystemUpstreamRuntimeHealth',
  "circuit: 'closed' | 'open' | 'half-open'",
  'upstreams: SystemUpstreamRuntimeHealth[]',
  'upstreamCircuitOpen: number',
  'upstreamQueued: number',
]);
requireNeedles('System Health upstream UI', dashboard, [
  'Upstream circuits',
  'UPSTREAM SHIELD · THIS INSTANCE',
  'health.upstreams.map',
]);

if (
  packageJson.scripts?.['patch18-5-5-4:check'] !==
  'node scripts/patch-18-5-5-4-production-load-failure-check.mjs'
) {
  failures.push('package.json is missing patch18-5-5-4:check');
}

if (
  !String(packageJson.scripts?.prebuild ?? '').includes(
    'npm run patch18-5-5-4:check',
  )
) {
  failures.push('prebuild does not execute patch18-5-5-4:check');
}

if (!failures.length) {
  try {
    // This module is pure runtime logic apart from the Next "server-only"
    // sentinel. Strip only that sentinel so the actual queue/circuit code can
    // execute inside this Node regression check.
    const executableSource = resilience.replace(
      /import ['"]server-only['"];?\s*/,
      '',
    );
    const compiled = ts.transpileModule(executableSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
    );

    const urlMatrix = new Map([
      ['https://graphql.anilist.co', 'anilist'],
      ['https://shikimori.one/api/animes/1', 'shikimori'],
      ['https://kodik-api.com/search', 'kodik'],
      ['https://aniliberty.top/api/v1/releases', 'aniliberty'],
      ['https://api.anilibria.app/api/v1/releases', 'aniliberty'],
      ['https://api.alloha.tv/', 'direct'],
    ]);

    for (const [url, expected] of urlMatrix) {
      const actual = runtime.upstreamKeyForUrl(url);
      if (actual !== expected) {
        failures.push(`URL mapping failed for ${url}: ${actual} !== ${expected}`);
      }
    }

    // Healthy burst: all 30 operations must finish while never exceeding the
    // Shikimori per-instance concurrency budget of 5.
    let healthyActive = 0;
    let healthyMaxActive = 0;
    await Promise.all(
      Array.from({ length: 30 }, () =>
        runtime.runWithUpstreamBudget('shikimori', async () => {
          healthyActive += 1;
          healthyMaxActive = Math.max(healthyMaxActive, healthyActive);
          await new Promise((resolve) => setTimeout(resolve, 20));
          healthyActive -= 1;
          return 'ok';
        }),
      ),
    );

    if (healthyMaxActive > 5) {
      failures.push(
        `Shikimori concurrency escaped budget: max active ${healthyMaxActive}`,
      );
    }

    const shikimoriSnapshot = runtime
      .getUpstreamRuntimeSnapshot()
      .find((item) => item.key === 'shikimori');
    if (
      !shikimoriSnapshot ||
      shikimoriSnapshot.active !== 0 ||
      shikimoriSnapshot.queued !== 0 ||
      shikimoriSnapshot.rejected !== 0
    ) {
      failures.push(
        `healthy Shikimori burst did not drain cleanly: ${JSON.stringify(
          shikimoriSnapshot,
        )}`,
      );
    }

    // Overload burst: the direct-provider budget is 4 active + 20 queued.
    // Excess work must shed instead of creating an unbounded Promise backlog.
    let overloadActive = 0;
    let overloadMaxActive = 0;
    const overloadResults = await Promise.allSettled(
      Array.from({ length: 80 }, () =>
        runtime.runWithUpstreamBudget('direct', async () => {
          overloadActive += 1;
          overloadMaxActive = Math.max(overloadMaxActive, overloadActive);
          await new Promise((resolve) => setTimeout(resolve, 90));
          overloadActive -= 1;
          return 'ok';
        }),
      ),
    );

    const overloadRejected = overloadResults.filter(
      (item) => item.status === 'rejected',
    ).length;

    if (overloadMaxActive > 4) {
      failures.push(
        `Direct concurrency escaped budget: max active ${overloadMaxActive}`,
      );
    }
    if (overloadRejected < 1) {
      failures.push('Direct overload burst did not shed any excess work');
    }

    const directSnapshot = runtime
      .getUpstreamRuntimeSnapshot()
      .find((item) => item.key === 'direct');
    if (
      !directSnapshot ||
      directSnapshot.active !== 0 ||
      directSnapshot.queued !== 0 ||
      directSnapshot.rejected < 1
    ) {
      failures.push(
        `Direct overload queue did not drain safely: ${JSON.stringify(
          directSnapshot,
        )}`,
      );
    }

    // Four consecutive transient failures must open the AniList circuit.
    let circuitWorkCalls = 0;
    for (let index = 0; index < 4; index += 1) {
      await runtime.runWithUpstreamBudget(
        'anilist',
        async () => {
          circuitWorkCalls += 1;
          return { failed: true };
        },
        {
          isFailure: (value) => value.failed === true,
        },
      );
    }

    const aniListOpen = runtime
      .getUpstreamRuntimeSnapshot()
      .find((item) => item.key === 'anilist');

    if (!aniListOpen || aniListOpen.circuit !== 'open') {
      failures.push(
        `AniList circuit did not open after threshold: ${JSON.stringify(
          aniListOpen,
        )}`,
      );
    }

    let openReason = '';
    try {
      await runtime.runWithUpstreamBudget('anilist', async () => {
        circuitWorkCalls += 1;
        return 'should-not-run';
      });
    } catch (error) {
      openReason = runtime.upstreamPressureReason(error) ?? '';
    }

    if (openReason !== 'circuit_open') {
      failures.push(`open AniList circuit returned wrong reason: ${openReason}`);
    }
    if (circuitWorkCalls !== 4) {
      failures.push(
        `open AniList circuit still executed upstream work: ${circuitWorkCalls} calls`,
      );
    }

    // Caller cancellation is pressure, not provider health evidence.
    const controller = new AbortController();
    controller.abort();
    try {
      await runtime.runWithUpstreamBudget(
        'aniliberty',
        async () => 'unreachable',
        { signal: controller.signal, abortIsFailure: false },
      );
    } catch {
      // expected
    }

    const abortedSnapshot = runtime
      .getUpstreamRuntimeSnapshot()
      .find((item) => item.key === 'aniliberty');
    if (!abortedSnapshot || abortedSnapshot.consecutiveFailures !== 0) {
      failures.push(
        `caller abort polluted provider failures: ${JSON.stringify(
          abortedSnapshot,
        )}`,
      );
    }

    if (!failures.length) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            healthyBurst: {
              requests: 30,
              maxActive: healthyMaxActive,
              rejected: shikimoriSnapshot?.rejected ?? 0,
            },
            overloadBurst: {
              requests: 80,
              maxActive: overloadMaxActive,
              rejected: overloadRejected,
            },
            circuit: {
              upstream: 'anilist',
              workCallsBeforeOpen: circuitWorkCalls,
              state: aniListOpen?.circuit,
            },
          },
          null,
          2,
        ),
      );
    }
  } catch (error) {
    failures.push(
      `runtime load/failure matrix could not execute: ${
        error instanceof Error ? error.stack || error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('\n[AnimeBox 18.5.5.4 Production Load & Failure Shield] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log(
  '[AnimeBox 18.5.5.4 Production Load & Failure Shield] bounded queues, circuit breakers, distributed half-open recovery and verified-first degradation invariants passed.',
);
