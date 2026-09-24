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

export type SystemHealthSnapshot = {
  generatedAt: string;
  status: SystemHealthTone;
  production: ProductionHealthSnapshot;
  deployment: DeploymentHealth;
  providers: SystemProviderHealth[];
  jobs: SystemJobHealth[];
  incidents: SystemIncident[];
  notification: NotificationHealth | null;
  signals: {
    openCriticalIncidents: number;
    openWarningIncidents: number;
    unhealthyProviders: number;
    failedJobs24h: number;
    degradedJobs24h: number;
  };
};
