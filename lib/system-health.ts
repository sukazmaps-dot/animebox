import type { ProductionHealthSnapshot } from '@/lib/production-health';

export type SystemHealthTone = 'healthy' | 'degraded' | 'critical';

export type SystemProviderHealth = {
  key: string;
  name: string;
  enabled: boolean;
  priority: number;
  state: string;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastLatencyMs: number | null;
  lastError: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  cooldownUntil: string | null;
};

export type SystemJobHealth = {
  jobKey: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  errorCode: string | null;
  summary: Record<string, unknown>;
};

export type SystemIncident = {
  id: string;
  fingerprint: string;
  service: string;
  severity: 'warning' | 'critical';
  status: 'open' | 'resolved';
  title: string;
  lastMessage: string | null;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  metadata: Record<string, unknown>;
};

export type NotificationHealth = {
  status: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  failed: number;
  durationMs: number | null;
  lastErrorCode: string | null;
};

export type DeploymentHealth = {
  environment: string;
  gitSha: string | null;
  gitBranch: string | null;
  region: string | null;
};

export type PlaybackPlatformHealth = {
  starts24h: number;
  sourceFailures24h: number;
  fallbacks24h: number;
  sourceExhausted24h: number;
  resumes24h: number;
  completions24h: number;
  wtDriftCorrections24h: number;
  fallbackRatePct: number | null;
  exhaustionRatePct: number | null;
};

export type RequestRouteHealth = {
  routeKey: string;
  method: string;
  estimatedRequests24h: number;
  serverErrors24h: number;
  errorRate24hPct: number | null;
  rateLimited24h: number;
  slowRequests24h: number;
  averageMs24h: number | null;
  p95Ms24h: number | null;
  p99Ms24h: number | null;
  maxDurationMs24h: number | null;
};

export type RequestPlatformHealth = {
  available: boolean;
  estimatedRequests1h: number;
  estimatedRequests24h: number;
  serverErrors1h: number;
  serverErrors24h: number;
  errorRate1hPct: number | null;
  errorRate24hPct: number | null;
  rateLimited1h: number;
  rateLimited24h: number;
  slowRequests1h: number;
  slowRequests24h: number;
  averageMs1h: number | null;
  averageMs24h: number | null;
  p95Ms1h: number | null;
  p95Ms24h: number | null;
  p99Ms1h: number | null;
  p99Ms24h: number | null;
  maxDurationMs24h: number | null;
  routes: RequestRouteHealth[];
};

export type DependencyProbeHealth = {
  state: 'healthy' | 'degraded' | 'unknown';
  latencyMs: number | null;
};

export type MediaEdgeHealth = DependencyProbeHealth & {
  configured: boolean;
  protocol: string | null;
  r2: boolean | null;
};

export type SystemDependenciesHealth = {
  supabase: DependencyProbeHealth;
  mediaEdge: MediaEdgeHealth;
};

export type SystemHealthSnapshot = {
  generatedAt: string;
  status: SystemHealthTone;
  production: ProductionHealthSnapshot;
  deployment: DeploymentHealth;
  providers: SystemProviderHealth[];
  jobs: SystemJobHealth[];
  incidents: SystemIncident[];
  notification: NotificationHealth | null;
  playback: PlaybackPlatformHealth;
  requests: RequestPlatformHealth;
  dependencies: SystemDependenciesHealth;
  signals: {
    openCriticalIncidents: number;
    openWarningIncidents: number;
    unhealthyProviders: number;
    failedJobs24h: number;
    degradedJobs24h: number;
    requestRuntimeDegraded: boolean;
    requestRuntimeCritical: boolean;
    dependencyWarnings: number;
  };
};
