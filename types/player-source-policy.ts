export type PlayerProviderKey = 'direct' | 'kodik' | 'aniliberty';

export type PlayerProviderRuntimeState =
  | 'healthy'
  | 'degraded'
  | 'unavailable'
  | 'unknown';

export type PlayerProviderPolicy = {
  key: PlayerProviderKey;
  name: string;
  enabled: boolean;
  configuredEnabled: boolean;
  environmentReady: boolean;
  priority: number;
  effectivePriority: number;
  healthPenalty: number;
  recommendedTimeoutMs: number;
  halfOpenProbe: boolean;
  state: PlayerProviderRuntimeState;
  reason:
    | ''
    | 'admin_disabled'
    | 'environment_disabled'
    | 'copyright_restricted'
    | 'cooldown';
  failureThreshold: number;
  cooldownSeconds: number;
  cooldownUntil: string | null;
  lastLatencyMs: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
};

export type PlayerSourceOrchestratorPlan = {
  version: 'source-orchestrator-v2';
  orderedProviders: PlayerProviderKey[];
  maxProviderAttempts: number;
  discoveryBudgetMs: number;
  copyrightBlocked: boolean;
  allUnavailable: boolean;
};

export type PlayerSourcePolicyResponse = {
  ok: boolean;
  animeId: number;
  season: number | null;
  episode: number;
  providers: PlayerProviderPolicy[];
  orchestrator: PlayerSourceOrchestratorPlan;
};
