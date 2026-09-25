import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const policyTypes = read('types/player-source-policy.ts');
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
  "direct: 5_500",
  "kodik: 7_000",
  "aniliberty: 9_500",
  'providerHealthPenalty(',
  'effectivePriority: setting.priority + healthPenalty',
  'globalRestriction = await getPlaybackRestriction({',
  "version: 'source-orchestrator-v2'",
]) {
  if (!control.includes(needle)) {
    failures.push(`server source orchestrator missing: ${needle}`);
  }
}

if (
  !policyRoute.includes("observeApiRoute('/api/player/source-policy'") ||
  !policyRoute.includes('getPlayerSourcePolicy({')
) {
  failures.push('source-policy route is not observed or no longer uses the canonical policy');
}

for (const needle of [
  'runProviderAttempt(',
  'warmFallbacks(',
  'provider.recommendedTimeoutMs',
  'policy.orchestrator.orderedProviders',
  'policy.orchestrator.copyrightBlocked',
  'policy.orchestrator.allUnavailable',
  'discovery_budget_exhausted',
  'provider_timeout',
]) {
  if (!episodePage.includes(needle)) {
    failures.push(`AnimeEpisodePage orchestration missing: ${needle}`);
  }
}

if (episodePage.includes('Promise.allSettled(\n          attempts.map')) {
  failures.push('AnimeEpisodePage still performs parallel provider fan-out on the normal path');
}

if (
  !episodePage.includes('const firstReadyIndex = -1') &&
  !episodePage.includes('let firstReadyIndex = -1')
) {
  failures.push('AnimeEpisodePage does not track first playable provider');
}

if (
  !episodePage.includes("providerOrder: PlayerProviderKey[]") &&
  !episodePage.includes('let providerOrder: PlayerProviderKey[]')
) {
  failures.push('AnimeEpisodePage does not retain deterministic provider order');
}

for (const needle of [
  'switchToFallback(',
  'PLAYER_READY_TIMEOUT_MS = 14_000',
  "trackPlayerEvent('player_source_fallback'",
  "recordSourceFailure(",
]) {
  if (!player.includes(needle)) {
    failures.push(`AnimePlayer runtime fallback regressed: ${needle}`);
  }
}

if (failures.length) {
  console.error('\n[AnimeBox 18.5.4.1 Source Orchestrator] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log(
  '[AnimeBox 18.5.4.1 Source Orchestrator] health-aware plan, bounded sequential discovery and runtime fallback invariants passed.',
);
