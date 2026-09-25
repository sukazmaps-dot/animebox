export type PlaybackTelemetryRow = {
  event_name: string;
  source: string | null;
  metadata: Record<string, unknown> | null;
};

export type PlaybackProviderTelemetry = {
  providerKey: string;
  attempts24h: number;
  discoveryReady24h: number;
  discoveryTimeouts24h: number;
  discoveryUnavailable24h: number;
  attemptP95Ms: number | null;
  playerReady24h: number;
  playerReadyP95Ms: number | null;
  endToEndReadyP95Ms: number | null;
  runtimeFailures24h: number;
  fallbacksFrom24h: number;
};

export type PlaybackTelemetryAggregate = {
  plans24h: number;
  attempts24h: number;
  discoveryReady24h: number;
  discoveryExhausted24h: number;
  firstSourceP50Ms: number | null;
  firstSourceP95Ms: number | null;
  playerReadyP50Ms: number | null;
  playerReadyP95Ms: number | null;
  endToEndReadyP50Ms: number | null;
  endToEndReadyP95Ms: number | null;
  providers: PlaybackProviderTelemetry[];
};

type MutableProviderTelemetry = {
  attempts24h: number;
  discoveryReady24h: number;
  discoveryTimeouts24h: number;
  discoveryUnavailable24h: number;
  attemptMs: number[];
  playerReady24h: number;
  playerReadyMs: number[];
  endToEndReadyMs: number[];
  runtimeFailures24h: number;
  fallbacksFrom24h: number;
};

const MAX_TIMING_MS = 120_000;

function metadata(row: PlaybackTelemetryRow) {
  return row.metadata && typeof row.metadata === 'object'
    ? row.metadata
    : {};
}

function boundedTiming(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.min(MAX_TIMING_MS, Math.round(parsed));
}

function compactProvider(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizePlaybackProvider(value: unknown) {
  const provider = compactProvider(value);
  if (!provider) return 'unknown';
  if (provider === 'direct' || provider.includes('animebox direct')) {
    return 'direct';
  }
  if (provider === 'kodik' || provider.includes('kodik')) {
    return 'kodik';
  }
  if (
    provider === 'aniliberty' ||
    provider.includes('aniliberty') ||
    provider.includes('anilibria') ||
    provider.includes('внешний плеер')
  ) {
    return 'aniliberty';
  }
  return provider.slice(0, 48);
}

function providerFromRow(row: PlaybackTelemetryRow) {
  const meta = metadata(row);
  return normalizePlaybackProvider(
    meta.provider ??
      meta.fromProvider ??
      row.source,
  );
}

export function percentile(
  values: number[],
  quantile: number,
): number | null {
  const clean = values
    .map(boundedTiming)
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);

  if (!clean.length) return null;

  const q = Math.min(1, Math.max(0, quantile));
  const index = Math.min(
    clean.length - 1,
    Math.max(0, Math.ceil(q * clean.length) - 1),
  );
  return clean[index] ?? null;
}

function mutableProvider(
  map: Map<string, MutableProviderTelemetry>,
  key: string,
) {
  const existing = map.get(key);
  if (existing) return existing;

  const created: MutableProviderTelemetry = {
    attempts24h: 0,
    discoveryReady24h: 0,
    discoveryTimeouts24h: 0,
    discoveryUnavailable24h: 0,
    attemptMs: [],
    playerReady24h: 0,
    playerReadyMs: [],
    endToEndReadyMs: [],
    runtimeFailures24h: 0,
    fallbacksFrom24h: 0,
  };
  map.set(key, created);
  return created;
}

export function aggregatePlaybackTelemetry(
  rows: PlaybackTelemetryRow[],
): PlaybackTelemetryAggregate {
  let plans24h = 0;
  let attempts24h = 0;
  let discoveryReady24h = 0;
  let discoveryExhausted24h = 0;

  const firstSourceMs: number[] = [];
  const playerReadyMs: number[] = [];
  const endToEndReadyMs: number[] = [];
  const providers = new Map<string, MutableProviderTelemetry>();

  for (const row of rows) {
    const meta = metadata(row);

    if (row.event_name === 'player_discovery_plan') {
      plans24h += 1;
      continue;
    }

    if (row.event_name === 'player_discovery_attempt') {
      attempts24h += 1;
      const provider = providerFromRow(row);
      const metrics = mutableProvider(providers, provider);
      metrics.attempts24h += 1;

      const attemptMs = boundedTiming(meta.attemptMs);
      if (attemptMs != null) metrics.attemptMs.push(attemptMs);

      const outcome =
        typeof meta.outcome === 'string' ? meta.outcome : '';
      if (outcome === 'timeout') {
        metrics.discoveryTimeouts24h += 1;
      } else if (
        outcome === 'unavailable' ||
        outcome === 'aborted'
      ) {
        metrics.discoveryUnavailable24h += 1;
      } else if (outcome === 'ready') {
        metrics.discoveryReady24h += 1;
      }
      continue;
    }

    if (row.event_name === 'player_discovery_ready') {
      discoveryReady24h += 1;
      const provider = providerFromRow(row);
      mutableProvider(providers, provider);
      const firstMs = boundedTiming(meta.firstSourceMs);
      if (firstMs != null) firstSourceMs.push(firstMs);
      continue;
    }

    if (row.event_name === 'player_discovery_exhausted') {
      discoveryExhausted24h += 1;
      continue;
    }

    if (row.event_name === 'player_source_ready') {
      const provider = providerFromRow(row);
      const metrics = mutableProvider(providers, provider);
      metrics.playerReady24h += 1;

      const startupMs = boundedTiming(meta.startupMs);
      if (startupMs != null) {
        metrics.playerReadyMs.push(startupMs);
        playerReadyMs.push(startupMs);
      }

      const totalMs = boundedTiming(meta.timeToPlayerReadyMs);
      if (totalMs != null) {
        metrics.endToEndReadyMs.push(totalMs);
        endToEndReadyMs.push(totalMs);
      }
      continue;
    }

    if (row.event_name === 'player_source_failed') {
      const provider = providerFromRow(row);
      mutableProvider(providers, provider).runtimeFailures24h += 1;
      continue;
    }

    if (row.event_name === 'player_source_fallback') {
      const provider = providerFromRow(row);
      mutableProvider(providers, provider).fallbacksFrom24h += 1;
    }
  }

  const providerRows = [...providers.entries()]
    .map(([providerKey, metrics]): PlaybackProviderTelemetry => ({
      providerKey,
      attempts24h: metrics.attempts24h,
      discoveryReady24h: metrics.discoveryReady24h,
      discoveryTimeouts24h: metrics.discoveryTimeouts24h,
      discoveryUnavailable24h: metrics.discoveryUnavailable24h,
      attemptP95Ms: percentile(metrics.attemptMs, 0.95),
      playerReady24h: metrics.playerReady24h,
      playerReadyP95Ms: percentile(metrics.playerReadyMs, 0.95),
      endToEndReadyP95Ms: percentile(metrics.endToEndReadyMs, 0.95),
      runtimeFailures24h: metrics.runtimeFailures24h,
      fallbacksFrom24h: metrics.fallbacksFrom24h,
    }))
    .sort(
      (a, b) =>
        b.attempts24h - a.attempts24h ||
        b.playerReady24h - a.playerReady24h ||
        a.providerKey.localeCompare(b.providerKey),
    );

  return {
    plans24h,
    attempts24h,
    discoveryReady24h,
    discoveryExhausted24h,
    firstSourceP50Ms: percentile(firstSourceMs, 0.5),
    firstSourceP95Ms: percentile(firstSourceMs, 0.95),
    playerReadyP50Ms: percentile(playerReadyMs, 0.5),
    playerReadyP95Ms: percentile(playerReadyMs, 0.95),
    endToEndReadyP50Ms: percentile(endToEndReadyMs, 0.5),
    endToEndReadyP95Ms: percentile(endToEndReadyMs, 0.95),
    providers: providerRows,
  };
}
