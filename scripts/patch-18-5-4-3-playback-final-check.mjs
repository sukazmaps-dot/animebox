import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const eventNames = read('lib/product-event-names.ts');
const episodePage = read('components/AnimeEpisodePage.tsx');
const player = read('components/AnimePlayer.tsx');
const telemetry = read('lib/playback-observability.ts');
const systemTypes = read('lib/system-health.ts');
const systemServer = read('lib/system-health-server.ts');
const dashboard = read('components/admin/SystemHealthDashboard.tsx');
const resumePolicy = read('lib/resume-integrity.ts');
const openingSafety = read('lib/episode-timeline-safety.ts');

const failures = [];

for (const eventName of [
  'player_discovery_plan',
  'player_discovery_attempt',
  'player_discovery_ready',
  'player_discovery_exhausted',
]) {
  if (!eventNames.includes(`'${eventName}'`)) {
    failures.push(`product event registry missing ${eventName}`);
  }
}

for (const needle of [
  "trackDiscoveryEvent(\n          'player_discovery_plan'",
  "'player_discovery_attempt'",
  "'player_discovery_ready'",
  "trackExhausted('all_providers_unavailable')",
  "trackExhausted('no_enabled_providers')",
  "phase: 'primary' | 'warm'",
  'attemptMs:',
  'firstSourceMs:',
  'discoveryBudgetMs - discoveryElapsedMs',
  'copyrightBlocked',
  "runProviderAttempt(provider, 'warm')",
]) {
  if (!episodePage.includes(needle)) {
    failures.push(`source discovery telemetry/invariant missing: ${needle}`);
  }
}

if (
  !player.includes('sourceDiscoveryStartedAtMs?: number | null') ||
  !player.includes('timeToPlayerReadyMs') ||
  !player.includes("trackPlayerEvent('player_source_ready'")
) {
  failures.push('AnimePlayer no longer measures end-to-end player readiness');
}

for (const needle of [
  'aggregatePlaybackTelemetry',
  'firstSourceP95Ms',
  'endToEndReadyP95Ms',
  'PlaybackProviderTelemetry',
  'normalizePlaybackProvider',
]) {
  if (!telemetry.includes(needle)) {
    failures.push(`playback aggregator missing: ${needle}`);
  }
}

for (const needle of [
  'discoveryPlans24h',
  'discoverySuccessRatePct',
  'endToEndReadyP95Ms',
  'PlaybackProviderObservability',
  'playbackRuntimeDegraded',
  'playbackRuntimeCritical',
]) {
  if (!systemTypes.includes(needle)) {
    failures.push(`System Health playback contract missing: ${needle}`);
  }
}

for (const needle of [
  ".in('event_name', [",
  "'player_discovery_attempt'",
  'aggregatePlaybackTelemetry(',
  'playbackTelemetry.plans24h >= 20',
  'discoveryExhaustionRatePct >= 10',
  'discoveryExhaustionRatePct >= 3',
  '(playbackTelemetry.endToEndReadyP95Ms ?? 0) >= 12_000',
  '(playbackTelemetry.firstSourceP95Ms ?? 0) >= 8_000',
]) {
  if (!systemServer.includes(needle)) {
    failures.push(`System Health playback aggregation missing: ${needle}`);
  }
}

for (const needle of [
  'PLAYBACK SLO · 24H',
  'Discovery success · 24h',
  'First source p95',
  'Player ready p95',
  'provider.discoveryTimeouts24h',
  'provider.endToEndReadyP95Ms',
]) {
  if (!dashboard.includes(needle)) {
    failures.push(`playback dashboard missing: ${needle}`);
  }
}

for (const [label, source, needle] of [
  ['runtime player timeout', player, 'PLAYER_READY_TIMEOUT_MS = 14_000'],
  ['runtime automatic fallback', player, 'switchToFallback('],
  ['source-switch resume', player, "'source_switch'"],
  ['mobile native selector', player, 'opacity-0 sm:hidden'],
  ['resume completion policy', resumePolicy, 'if (input.serverCompleted)'],
  ['near-end resume policy', resumePolicy, 'resumeEndGuardMs'],
  ['opening auto-skip safety', openingSafety, 'openingAutoSkipSafetyDecision'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label} regressed: ${needle}`);
  }
}

if (!failures.length) {
  try {
    const compiled = ts.transpileModule(telemetry, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
    );

    const rows = [
      {
        event_name: 'player_discovery_plan',
        source: 'orchestrator',
        metadata: { strategyVersion: 'source-orchestrator-v2' },
      },
      {
        event_name: 'player_discovery_plan',
        source: 'orchestrator',
        metadata: { strategyVersion: 'source-orchestrator-v2' },
      },
      {
        event_name: 'player_discovery_attempt',
        source: 'direct',
        metadata: {
          provider: 'direct',
          outcome: 'timeout',
          attemptMs: 5_500,
        },
      },
      {
        event_name: 'player_discovery_attempt',
        source: 'kodik',
        metadata: {
          provider: 'kodik',
          outcome: 'ready',
          attemptMs: 1_200,
        },
      },
      {
        event_name: 'player_discovery_attempt',
        source: 'aniliberty',
        metadata: {
          provider: 'aniliberty',
          outcome: 'unavailable',
          attemptMs: 2_400,
        },
      },
      {
        event_name: 'player_discovery_ready',
        source: 'kodik',
        metadata: {
          provider: 'kodik',
          firstSourceMs: 6_850,
        },
      },
      {
        event_name: 'player_discovery_ready',
        source: 'AnimeBox Direct',
        metadata: {
          provider: 'direct',
          firstSourceMs: 1_050,
        },
      },
      {
        event_name: 'player_source_ready',
        source: 'Kodik',
        metadata: {
          provider: 'Kodik',
          startupMs: 900,
          timeToPlayerReadyMs: 7_800,
        },
      },
      {
        event_name: 'player_source_ready',
        source: 'AnimeBox Direct',
        metadata: {
          provider: 'AnimeBox Direct',
          startupMs: 400,
          timeToPlayerReadyMs: 1_450,
        },
      },
      {
        event_name: 'player_source_failed',
        source: 'AnimeBox Direct',
        metadata: {
          provider: 'AnimeBox Direct',
          failureKind: 'timeout',
        },
      },
      {
        event_name: 'player_source_fallback',
        source: 'AnimeBox Direct',
        metadata: {
          fromProvider: 'AnimeBox Direct',
          toProvider: 'Kodik',
        },
      },
      {
        event_name: 'player_discovery_exhausted',
        source: 'orchestrator',
        metadata: {
          finalReason: 'provider_timeout',
        },
      },
    ];

    const aggregate = runtime.aggregatePlaybackTelemetry(rows);

    if (
      aggregate.plans24h !== 2 ||
      aggregate.attempts24h !== 3 ||
      aggregate.discoveryReady24h !== 2 ||
      aggregate.discoveryExhausted24h !== 1
    ) {
      failures.push(
        `playback aggregate counts are wrong: ${JSON.stringify(aggregate)}`,
      );
    }

    if (
      aggregate.firstSourceP50Ms !== 1_050 ||
      aggregate.firstSourceP95Ms !== 6_850 ||
      aggregate.playerReadyP50Ms !== 400 ||
      aggregate.playerReadyP95Ms !== 900 ||
      aggregate.endToEndReadyP50Ms !== 1_450 ||
      aggregate.endToEndReadyP95Ms !== 7_800
    ) {
      failures.push(
        `playback latency percentiles are wrong: ${JSON.stringify(aggregate)}`,
      );
    }

    const direct = aggregate.providers.find(
      (provider) => provider.providerKey === 'direct',
    );
    const kodik = aggregate.providers.find(
      (provider) => provider.providerKey === 'kodik',
    );

    if (
      !direct ||
      direct.attempts24h !== 1 ||
      direct.discoveryTimeouts24h !== 1 ||
      direct.playerReady24h !== 1 ||
      direct.runtimeFailures24h !== 1 ||
      direct.fallbacksFrom24h !== 1
    ) {
      failures.push(
        `direct provider attribution is wrong: ${JSON.stringify(direct)}`,
      );
    }

    if (
      !kodik ||
      kodik.attempts24h !== 1 ||
      kodik.discoveryReady24h !== 1 ||
      kodik.playerReady24h !== 1
    ) {
      failures.push(
        `kodik provider attribution is wrong: ${JSON.stringify(kodik)}`,
      );
    }

    if (
      runtime.normalizePlaybackProvider('AnimeBox Direct') !== 'direct' ||
      runtime.normalizePlaybackProvider('Внешний плеер') !== 'aniliberty'
    ) {
      failures.push('provider normalization matrix regressed');
    }
  } catch (error) {
    failures.push(
      `playback observability runtime matrix failed to execute: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('\n[AnimeBox 18.5.4.3 Playback Final] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log(
  '[AnimeBox 18.5.4.3 Playback Final] discovery telemetry, SLO aggregation and cross-layer player reliability matrix passed.',
);
