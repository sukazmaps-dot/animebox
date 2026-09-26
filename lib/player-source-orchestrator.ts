import type {
  PlayerProviderKey,
  PlayerProviderPolicy,
  PlayerProviderRuntimeState,
  PlayerSourceOrchestratorPlan,
} from '@/types/player-source-policy';

export const ORCHESTRATOR_DISCOVERY_BUDGET_MS = 18_500;

const PROVIDER_DISCOVERY_TIMEOUT_MS: Record<PlayerProviderKey, number> = {
  direct: 5_500,
  kodik: 7_000,
  aniliberty: 9_500,
};

function timestamp(value: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function recommendedProviderDiscoveryTimeoutMs(
  provider: PlayerProviderKey,
) {
  return PROVIDER_DISCOVERY_TIMEOUT_MS[provider];
}

export function playerProviderHealthPenalty(input: {
  state: PlayerProviderRuntimeState;
  lastLatencyMs: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  nowMs?: number;
}) {
  let penalty =
    input.state === 'healthy'
      ? 0
      : input.state === 'unknown'
        ? 4
        : input.state === 'degraded'
          ? 16
          : 28;

  if (
    input.lastLatencyMs != null &&
    Number.isFinite(input.lastLatencyMs) &&
    input.lastLatencyMs > 1_200
  ) {
    penalty += Math.min(
      10,
      Math.ceil((input.lastLatencyMs - 1_200) / 800),
    );
  }

  const lastFailure = timestamp(input.lastFailureAt);
  const lastSuccess = timestamp(input.lastSuccessAt);
  const nowMs = input.nowMs ?? Date.now();

  if (
    lastFailure > lastSuccess &&
    nowMs - lastFailure < 15 * 60_000
  ) {
    penalty += 8;
  }

  return penalty;
}

export function rankPlayerProviderPolicies(
  providers: PlayerProviderPolicy[],
) {
  return [...providers].sort(
    (a, b) =>
      a.effectivePriority - b.effectivePriority ||
      a.priority - b.priority ||
      a.name.localeCompare(b.name),
  );
}

export function buildPlayerSourceOrchestratorPlan(
  providers: PlayerProviderPolicy[],
  copyrightBlocked: boolean,
): PlayerSourceOrchestratorPlan {
  const ranked = rankPlayerProviderPolicies(providers);
  const orderedProviders = ranked
    .filter((provider) => provider.enabled)
    .map((provider) => provider.key);

  return {
    version: 'source-orchestrator-v2',
    orderedProviders,
    maxProviderAttempts: Math.min(3, orderedProviders.length),
    discoveryBudgetMs: ORCHESTRATOR_DISCOVERY_BUDGET_MS,
    copyrightBlocked,
    allUnavailable: !copyrightBlocked && orderedProviders.length === 0,
  };
}


// Patch 18.7 — Core Final: every provider attempt must fit inside the
// remaining discovery budget. This prevents a late provider timeout from
// outliving the orchestrator deadline and leaving the page in a loading state.
export const ORCHESTRATOR_MIN_ATTEMPT_BUDGET_MS = 900;
export const ORCHESTRATOR_ATTEMPT_SAFETY_MARGIN_MS = 180;

export function remainingPlayerDiscoveryBudgetMs(input: {
  discoveryStartedAtMs: number;
  discoveryBudgetMs: number;
  nowMs: number;
}) {
  return Math.max(
    0,
    Math.round(
      input.discoveryBudgetMs -
        Math.max(0, input.nowMs - input.discoveryStartedAtMs),
    ),
  );
}

export function boundedProviderAttemptTimeoutMs(input: {
  recommendedTimeoutMs: number;
  remainingBudgetMs: number;
}) {
  if (input.remainingBudgetMs <= ORCHESTRATOR_MIN_ATTEMPT_BUDGET_MS) {
    return 0;
  }

  const usableBudget = Math.max(
    ORCHESTRATOR_MIN_ATTEMPT_BUDGET_MS,
    input.remainingBudgetMs - ORCHESTRATOR_ATTEMPT_SAFETY_MARGIN_MS,
  );

  return Math.max(
    ORCHESTRATOR_MIN_ATTEMPT_BUDGET_MS,
    Math.min(
      12_000,
      Math.max(ORCHESTRATOR_MIN_ATTEMPT_BUDGET_MS, input.recommendedTimeoutMs),
      usableBudget,
    ),
  );
}
