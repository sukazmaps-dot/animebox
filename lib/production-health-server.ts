import 'server-only';

import { adminClient } from '@/lib/community-server';

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
    cacheHitPct: number | null;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nullableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function getProductionHealthSnapshot(): Promise<ProductionHealthSnapshot> {
  const admin = adminClient();
  const { data, error } = await admin.rpc(
    'animebox_production_health_snapshot',
  );

  if (error) throw error;

  const root = asRecord(data);
  const watch = asRecord(root.watch);
  const watchParty = asRecord(root.watch_party);
  const chat = asRecord(root.chat);
  const analytics = asRecord(root.analytics);
  const rateLimit = asRecord(root.rate_limit);
  const cron = asRecord(root.cron);
  const database = asRecord(root.database);

  return {
    generatedAt: nullableText(root.generated_at),
    watch: {
      activeSessions: finite(watch.active_sessions),
      sessions1h: finite(watch.sessions_1h),
      heartbeats5m: finite(watch.heartbeats_5m),
      heartbeats1h: finite(watch.heartbeats_1h),
    },
    watchParty: {
      activeRooms: finite(watchParty.active_rooms),
      activeParticipants: finite(watchParty.active_participants),
      staleRooms: finite(watchParty.stale_rooms),
      roomsCreated24h: finite(watchParty.rooms_created_24h),
    },
    chat: {
      messages1h: finite(chat.messages_1h),
      messages24h: finite(chat.messages_24h),
    },
    analytics: {
      events1h: finite(analytics.events_1h),
      events24h: finite(analytics.events_24h),
    },
    rateLimit: {
      bucketRows: finite(rateLimit.bucket_rows),
      requests1h: finite(rateLimit.requests_1h),
    },
    cron: {
      failed24h: finite(cron.failed_24h),
      lastSuccessAt: nullableText(cron.last_success_at),
      lastFailureAt: nullableText(cron.last_failure_at),
    },
    database: {
      connections: finite(database.connections),
      cacheHitPct:
        database.cache_hit_pct == null
          ? null
          : finite(database.cache_hit_pct),
    },
  };
}
