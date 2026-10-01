export type SearchLatencySummary = {
  samples: number;
  p50Ms: number | null;
  p75Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};

export type SearchPerformanceSnapshot = {
  generatedAt: string;
  periodHours: number;
  status: 'healthy' | 'warning' | 'critical';
  firstResult: SearchLatencySummary;
  enrichment: SearchLatencySummary;
  suggestions: SearchLatencySummary;
  instantServer: SearchLatencySummary;
  instantDelivery: SearchLatencySummary;
  firstResultSources: {
    instant: number;
    authoritative: number;
    discovery: number;
    instantSharePct: number | null;
  };
  instantCache: {
    memory: number;
    network: number;
    memorySharePct: number | null;
  };
  index: {
    searchDocuments: number | null;
    catalogDocuments: number | null;
    coveragePct: number | null;
    latestIndexedAt: string | null;
  };
  latestSampleAt: string | null;
};
