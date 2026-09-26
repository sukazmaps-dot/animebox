export type ProductionHealthSnapshot = {
  generatedAt: string | null;
  watch: {
    activeSessions: number;
    sessions1h: number;
    heartbeats5m: number;
    heartbeats1h: number;
  };
  watchParty: {
    activeRooms: number;
    activeParticipants: number;
    staleRooms: number;
    roomsCreated24h: number;
  };
  chat: {
    messages1h: number;
    messages24h: number;
  };
  analytics: {
    events1h: number;
    events24h: number;
  };
  rateLimit: {
    bucketRows: number;
    requests1h: number;
  };
  cron: {
    failed24h: number;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
  };
  database: {
    connections: number;
    maxConnections: number;
    connectionPct: number | null;
    cacheHitPct: number | null;
  };
};
