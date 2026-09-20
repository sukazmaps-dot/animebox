import 'server-only';

import type {
  PlayerHealthDashboard,
  PlayerHealthRange,
  PlayerProviderMetric,
  PlayerSurfaceMetric,
} from '@/lib/player-health';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

const PLAYER_EVENTS = [
  'player_source_selected',
  'player_source_ready',
  'player_source_failed',
  'player_source_switched',
  'player_started',
] as const;

const PAGE_SIZE = 1_000;
const MAX_EVENTS = 20_000;

type PlayerEventRow = {
  event_name: string;
  session_id: string | null;
  source: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ProviderAccumulator = {
  provider: string;
  selections: number;
  ready: number;
  failures: number;
  timeouts: number;
  confirmedStarts: number;
  automaticSelections: number;
  manualSelections: number;
  fallbackIns: number;
  readyMs: number[];
};

type SurfaceAccumulator = {
  surface: string;
  sessions: Set<string>;
  ready: number;
  failures: number;
  starts: number;
};

function text(value: unknown, fallback = 'unknown') {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : fallback;
}

function bool(value: unknown) {
  return value === true || value === 'true' || value === 1;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return Math.round(sorted[index]);
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}

async function loadPlayerEvents(rangeDays: PlayerHealthRange) {
  const admin = createSupabaseAdmin();
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1_000).toISOString();
  const rows: PlayerEventRow[] = [];

  for (let offset = 0; offset < MAX_EVENTS; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from('product_events')
      .select('event_name,session_id,source,entity_id,metadata,created_at')
      .in('event_name', [...PLAYER_EVENTS])
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data || []) as PlayerEventRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return {
    rows,
    truncated: rows.length >= MAX_EVENTS,
  };
}

export async function getPlayerHealthDashboard(days: number): Promise<PlayerHealthDashboard> {
  const rangeDays: PlayerHealthRange = days === 7 ? 7 : 30;
  const { rows, truncated } = await loadPlayerEvents(rangeDays);

  const sessions = new Set<string>();
  const sourceReadyMs: number[] = [];
  const clickToPlayMs: number[] = [];
  const providers = new Map<string, ProviderAccumulator>();
  const surfaces = new Map<string, SurfaceAccumulator>();
  const automaticSwitches: Array<{
    sessionId: string;
    entityId: string | null;
    toProvider: string;
    createdAt: number;
    succeeded: boolean;
  }> = [];

  let sourceSelections = 0;
  let readyEvents = 0;
  let failedEvents = 0;
  let timeouts = 0;
  let confirmedStarts = 0;

  function providerAccumulator(name: string) {
    const key = text(name, 'Unknown');
    const existing = providers.get(key);
    if (existing) return existing;

    const created: ProviderAccumulator = {
      provider: key,
      selections: 0,
      ready: 0,
      failures: 0,
      timeouts: 0,
      confirmedStarts: 0,
      automaticSelections: 0,
      manualSelections: 0,
      fallbackIns: 0,
      readyMs: [],
    };
    providers.set(key, created);
    return created;
  }

  function surfaceAccumulator(name: string) {
    const key = text(name, 'web');
    const existing = surfaces.get(key);
    if (existing) return existing;
    const created: SurfaceAccumulator = {
      surface: key,
      sessions: new Set<string>(),
      ready: 0,
      failures: 0,
      starts: 0,
    };
    surfaces.set(key, created);
    return created;
  }

  for (const row of rows) {
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata
      : {};
    const provider = text(metadata.provider ?? row.source, 'Unknown');
    const surface = text(metadata.surface, 'web');
    const sessionId = text(row.session_id, `anon:${row.created_at}:${row.entity_id || ''}`);
    const providerMetric = providerAccumulator(provider);
    const surfaceMetric = surfaceAccumulator(surface);

    sessions.add(sessionId);
    surfaceMetric.sessions.add(sessionId);

    if (row.event_name === 'player_source_selected') {
      sourceSelections += 1;
      providerMetric.selections += 1;
      const reason = text(metadata.selectionReason, 'initial');
      if (reason === 'manual' || reason === 'manual_preference') providerMetric.manualSelections += 1;
      if (reason === 'auto' || reason === 'auto_score' || reason === 'initial_auto') {
        providerMetric.automaticSelections += 1;
      }
      continue;
    }

    if (row.event_name === 'player_source_ready') {
      readyEvents += 1;
      providerMetric.ready += 1;
      surfaceMetric.ready += 1;
      const startupMs = number(metadata.startupMs);
      if (startupMs != null) {
        providerMetric.readyMs.push(startupMs);
        sourceReadyMs.push(startupMs);
      }

      const createdAt = Date.parse(row.created_at);
      for (let index = automaticSwitches.length - 1; index >= 0; index -= 1) {
        const fallback = automaticSwitches[index];
        if (fallback.succeeded) continue;
        if (
          fallback.sessionId !== sessionId ||
          fallback.entityId !== row.entity_id ||
          fallback.toProvider !== provider
        ) continue;
        if (createdAt < fallback.createdAt || createdAt - fallback.createdAt > 60_000) continue;
        fallback.succeeded = true;
        break;
      }
      continue;
    }

    if (row.event_name === 'player_source_failed') {
      failedEvents += 1;
      providerMetric.failures += 1;
      surfaceMetric.failures += 1;
      if (text(metadata.failureKind, '') === 'timeout') {
        timeouts += 1;
        providerMetric.timeouts += 1;
      }
      continue;
    }

    if (row.event_name === 'player_source_switched') {
      const automatic = bool(metadata.automatic);
      const toProvider = text(metadata.toProvider, provider);
      if (automatic) {
        providerAccumulator(toProvider).fallbackIns += 1;
        automaticSwitches.push({
          sessionId,
          entityId: row.entity_id,
          toProvider,
          createdAt: Date.parse(row.created_at),
          succeeded: false,
        });
      }
      continue;
    }

    if (row.event_name === 'player_started') {
      confirmedStarts += 1;
      providerMetric.confirmedStarts += 1;
      surfaceMetric.starts += 1;
      const clickToPlay = number(metadata.clickToPlayMs);
      if (clickToPlay != null) clickToPlayMs.push(clickToPlay);
    }
  }

  const fallbackSuccesses = automaticSwitches.filter((item) => item.succeeded).length;
  const attemptsResolved = readyEvents + failedEvents;

  const providerRows: PlayerProviderMetric[] = [...providers.values()]
    .map((item) => ({
      provider: item.provider,
      selections: item.selections,
      ready: item.ready,
      failures: item.failures,
      timeouts: item.timeouts,
      confirmedStarts: item.confirmedStarts,
      automaticSelections: item.automaticSelections,
      manualSelections: item.manualSelections,
      fallbackIns: item.fallbackIns,
      successRate: rate(item.ready, item.ready + item.failures),
      medianReadyMs: percentile(item.readyMs, 50),
      p95ReadyMs: percentile(item.readyMs, 95),
    }))
    .sort((a, b) => b.selections - a.selections || b.ready - a.ready);

  const surfaceRows: PlayerSurfaceMetric[] = [...surfaces.values()]
    .map((item) => ({
      surface: item.surface,
      sessions: item.sessions.size,
      ready: item.ready,
      failures: item.failures,
      starts: item.starts,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  return {
    rangeDays,
    generatedAt: new Date().toISOString(),
    dataSince: rows[0]?.created_at ?? null,
    sampledEvents: rows.length,
    truncated,
    kpis: {
      sessions: sessions.size,
      sourceSelections,
      readyEvents,
      failedEvents,
      timeouts,
      confirmedStarts,
      automaticSwitches: automaticSwitches.length,
      fallbackSuccesses,
      sourceSuccessRate: rate(readyEvents, attemptsResolved),
      fallbackSuccessRate: rate(fallbackSuccesses, automaticSwitches.length),
      medianSourceReadyMs: percentile(sourceReadyMs, 50),
      p95SourceReadyMs: percentile(sourceReadyMs, 95),
      medianClickToPlayMs: percentile(clickToPlayMs, 50),
      p95ClickToPlayMs: percentile(clickToPlayMs, 95),
    },
    providers: providerRows,
    surfaces: surfaceRows,
  };
}
