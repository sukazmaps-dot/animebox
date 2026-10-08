import type { ConfigurationIssue } from '@/lib/deployment-readiness';

export type ReliabilityProbe = {
  service: string;
  state: 'healthy' | 'attention' | 'unavailable' | 'not_configured';
  code: string;
  elapsedMs: number;
  action: string;
};

export type ReliabilitySnapshot = {
  checkedAt: string;
  release: { version: string; sha: string | null };
  configuration: ConfigurationIssue[];
  probes: ReliabilityProbe[];
};
