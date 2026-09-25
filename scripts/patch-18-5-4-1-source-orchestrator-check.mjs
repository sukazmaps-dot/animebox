import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const policyTypes = read('types/player-source-policy.ts');
const orchestrator = read('lib/player-source-orchestrator.ts');
const control = read('lib/player-source-control.ts');
const policyRoute = read('app/api/player/source-policy/route.ts');
const episodePage = read('components/AnimeEpisodePage.tsx');
const player = read('components/AnimePlayer.tsx');

const failures = [];

for (const needle of [
  "version: 'source-orchestrator-v2'",
  'orderedProviders: PlayerProviderKey[]',
  'maxProviderAttempts: number',
  'discoveryBudgetMs: number',
  'copyrightBlocked: boolean',
  'effectivePriority: number',
  'healthPenalty: number',
  'recommendedTimeoutMs: number',
]) {
  if (!policyTypes.includes(needle)) {
    failures.push(`source policy contract missing: ${needle}`);
  }
}

for (const needle of [
  'ORCHESTRATOR_DISCOVERY_BUDGET_MS = 18_500',
  'direct: 5_500',
  'kodik: 7_000',
  'aniliberty: 9_500',
  'playerProviderHealthPenalty',
  'rankPlayerProviderPolicies',
  'buildPlayerSourceOrchestratorPlan',
]) {
  if (!orchestrator.includes(needle)) {
    failures.push(`pure source orchestrator missing: ${needle}`);
  }
}

for (const needle of [
  'playerProviderHealthPenalty({',
  'effectivePriority: setting.priority + healthPenalty',
  'globalRestriction = await getPlaybackRestriction({',
  'buildPlayerSourceOrchestratorPlan(',
  'rankPlayerProviderPolicies(resolved)',
]) {
  if (!control.includes(needle)) {
    failures.push(`server source control missing orchestrator integration: ${needle}`);
  }
}

if (
  !policyRoute.includes("observeApiRoute('/api/player/source-policy'") ||
  !policyRoute.includes('getPlayerSourcePolicy({')
) {
  failures.push(
    'source-policy route is not observed or no longer uses the canonical policy',
  );
}

for (const needle of [
  'runProviderAttempt(',
  'warmFallbacks(',
  'attemptedProviders.add(provider)',
  'provider.recommendedTimeoutMs',
  'policy.orchestrator.orderedProviders',
  'policy.orchestrator.copyrightBlocked',
  'policy.orchestrator.allUnavailable',
  'discovery_budget_exhausted',
  'provider_timeout',
  'discoveryBudgetMs - discoveryElapsedMs',
]) {
  if (!episodePage.includes(needle)) {
    failures.push(`AnimeEpisodePage orchestration missing: ${needle}`);
  }
}

if (episodePage.includes('Promise.allSettled(\n          attempts.map')) {
  failures.push(
    'AnimeEpisodePage still performs parallel provider fan-out on the normal path',
  );
}

if (
  !episodePage.includes('let firstReadyIndex = -1') ||
  !episodePage.includes('let providerOrder: PlayerProviderKey[]')
) {
  failures.push(
    'AnimeEpisodePage does not retain first-ready and deterministic provider state',
  );
}

for (const needle of [
  'switchToFallback(',
  'PLAYER_READY_TIMEOUT_MS = 14_000',
  "trackPlayerEvent('player_source_fallback'",
  'recordSourceFailure(',
]) {
  if (!player.includes(needle)) {
    failures.push(`AnimePlayer runtime fallback regressed: ${needle}`);
  }
}

if (!failures.length) {
  try {
    const compiled = ts.transpileModule(orchestrator, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
    );

    const nowMs = Date.parse('2026-09-25T17:00:00.000Z');
    const healthy = runtime.playerProviderHealthPenalty({
      state: 'healthy',
      lastLatencyMs: 500,
      lastSuccessAt: '2026-09-25T16:59:00.000Z',
      lastFailureAt: null,
      nowMs,
    });
    const degraded = runtime.playerProviderHealthPenalty({
      state: 'degraded',
      lastLatencyMs: 500,
      lastSuccessAt: null,
      lastFailureAt: null,
      nowMs,
    });
    const slowUnknown = runtime.playerProviderHealthPenalty({
      state: 'unknown',
      lastLatencyMs: 2_800,
      lastSuccessAt: null,
      lastFailureAt: null,
      nowMs,
    });
    const recentFailure = runtime.playerProviderHealthPenalty({
      state: 'healthy',
      lastLatencyMs: 500,
      lastSuccessAt: '2026-09-25T16:30:00.000Z',
      lastFailureAt: '2026-09-25T16:58:00.000Z',
      nowMs,
    });

    if (healthy !== 0) {
      failures.push(`healthy low-latency provider penalty expected 0, got ${healthy}`);
    }
    if (degraded !== 16) {
      failures.push(`degraded provider penalty expected 16, got ${degraded}`);
    }
    if (slowUnknown !== 6) {
      failures.push(`slow unknown provider penalty expected 6, got ${slowUnknown}`);
    }
    if (recentFailure !== 8) {
      failures.push(`recent failure penalty expected 8, got ${recentFailure}`);
    }

    const provider = (key, priority, effectivePriority, enabled = true) => ({
      key,
      name: key,
      enabled,
      configuredEnabled: true,
      environmentReady: true,
      priority,
      effectivePriority,
      healthPenalty: effectivePriority - priority,
      recommendedTimeoutMs:
        runtime.recommendedProviderDiscoveryTimeoutMs(key),
      state: 'healthy',
      reason: '',
      failureThreshold: 3,
      cooldownSeconds: 180,
      cooldownUntil: null,
      lastLatencyMs: null,
      lastSuccessAt: null,
      lastFailureAt: null,
    });

    const policies = [
      provider('direct', 10, 34),
      provider('kodik', 20, 20),
      provider('aniliberty', 30, 30),
    ];
    const ranked = runtime.rankPlayerProviderPolicies(policies);
    if (ranked.map((item) => item.key).join(',') !== 'kodik,aniliberty,direct') {
      failures.push(
        `health-aware provider order is wrong: ${ranked.map((item) => item.key).join(',')}`,
      );
    }

    const plan = runtime.buildPlayerSourceOrchestratorPlan(
      [
        provider('direct', 10, 10, false),
        provider('kodik', 20, 20),
        provider('aniliberty', 30, 30),
      ],
      false,
    );

    if (
      plan.version !== 'source-orchestrator-v2' ||
      plan.orderedProviders.join(',') !== 'kodik,aniliberty' ||
      plan.maxProviderAttempts !== 2 ||
      plan.discoveryBudgetMs !== 18_500 ||
      plan.copyrightBlocked ||
      plan.allUnavailable
    ) {
      failures.push(
        `orchestrator plan matrix failed: ${JSON.stringify(plan)}`,
      );
    }

    const blocked = runtime.buildPlayerSourceOrchestratorPlan(
      [
        provider('direct', 10, 10, false),
        provider('kodik', 20, 20, false),
        provider('aniliberty', 30, 30, false),
      ],
      true,
    );
    if (!blocked.copyrightBlocked || blocked.allUnavailable) {
      failures.push(
        'copyright-blocked plan must remain distinct from ordinary provider outage',
      );
    }
  } catch (error) {
    failures.push(
      `orchestrator runtime matrix could not execute: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('\n[AnimeBox 18.5.4.1 Source Orchestrator] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log(
  '[AnimeBox 18.5.4.1 Source Orchestrator] health-aware ranking, bounded sequential discovery and runtime fallback matrix passed.',
);
