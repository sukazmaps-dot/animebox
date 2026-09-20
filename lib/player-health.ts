export type PlayerHealthRange = 7 | 30;

export type PlayerHealthKpis = {
  sessions: number;
  sourceSelections: number;
  readyEvents: number;
  failedEvents: number;
  timeouts: number;
  confirmedStarts: number;
  automaticSwitches: number;
  fallbackSuccesses: number;
  sourceSuccessRate: number;
  fallbackSuccessRate: number;
  medianSourceReadyMs: number | null;
  p95SourceReadyMs: number | null;
  medianClickToPlayMs: number | null;
  p95ClickToPlayMs: number | null;
};

export type PlayerProviderMetric = {
  provider: string;
  selections: number;
  ready: number;
  failures: number;
  timeouts: number;
  confirmedStarts: number;
  automaticSelections: number;
  manualSelections: number;
  fallbackIns: number;
  successRate: number;
  medianReadyMs: number | null;
  p95ReadyMs: number | null;
};

export type PlayerSurfaceMetric = {
  surface: string;
  sessions: number;
  ready: number;
  failures: number;
  starts: number;
};

export type PlayerHealthDashboard = {
  rangeDays: PlayerHealthRange;
  generatedAt: string;
  dataSince: string | null;
  sampledEvents: number;
  truncated: boolean;
  kpis: PlayerHealthKpis;
  providers: PlayerProviderMetric[];
  surfaces: PlayerSurfaceMetric[];
};
