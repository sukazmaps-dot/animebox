import 'server-only';

import { getProductionHealthSnapshot } from '@/lib/production-health-server';
import type {
  NotificationHealth,
  RequestPlatformHealth,
  RequestRouteHealth,
  SystemHealthSnapshot,
  SystemIncident,
  SystemJobHealth,
  SystemProviderHealth,
} from '@/lib/system-health';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

type ProviderSettingsRow = {
  provider_key: string;
  display_name: string;
  enabled: boolean;
  priority: number;
};

type ProviderRuntimeRow = {
  provider_key: string;
  state: string;
  consecutive_failures: number;
  consecutive_successes: number;
  last_latency_ms: number | null;
  last_error: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  cooldown_until: string | null;
};

type JobRunRow = {
  job_key: string;
  status: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  error_code: string | null;
  summary: Record<string, unknown> | null;
};

type IncidentRow = {
  id: string;
  fingerprint: string;
  service: string;
  severity: 'warning' | 'critical';
  status: 'open' | 'resolved';
  title: string;
  last_message: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  metadata: Record<string, unknown> | null;
};

type NotificationRow = {
  status: string;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  failed: number | null;
  duration_ms: number | null;
  last_error_code: string | null;
};

type RequestMetricRow = {
  bucket_start: string;
  route_key: string;
  method: string;
  samples: number | null;
  estimated_requests: number | null;
  server_errors: number | null;
  rate_limited: number | null;
  slow_requests: number | null;
  duration_sum_ms: number | null;
  max_duration_ms: number | null;
  latency_0_250: number | null;
  latency_250_500: number | null;
  latency_500_1000: number | null;
  latency_1000_2500: number | null;
  latency_2500_plus: number | null;
};

type RequestAggregate = {
  estimatedRequests: number;
  serverErrors: number;
  rateLimited: number;
  slowRequests: number;
  durationSumMs: number;
  maxDurationMs: number;
  latency: [number, number, number, number, number];
};

function finite(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function providerRows(
  settings: ProviderSettingsRow[],
  runtime: ProviderRuntimeRow[],
): SystemProviderHealth[] {
  const runtimeByKey = new Map(
    runtime.map((item) => [item.provider_key, item]),
  );

  return settings
    .map((item) => {
      const health = runtimeByKey.get(item.provider_key);
      return {
        key: item.provider_key,
        name: item.display_name,
        enabled: item.enabled,
        priority: finite(item.priority),
        state: health?.state ?? 'unknown',
        consecutiveFailures: finite(health?.consecutive_failures),
        consecutiveSuccesses: finite(health?.consecutive_successes),
        lastLatencyMs: nullableNumber(health?.last_latency_ms),
        lastError: health?.last_error ?? null,
        lastSuccessAt: health?.last_success_at ?? null,
        lastFailureAt: health?.last_failure_at ?? null,
        cooldownUntil: health?.cooldown_until ?? null,
      };
    })
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

function latestJobs(rows: JobRunRow[]): SystemJobHealth[] {
  const seen = new Set<string>();
  const jobs: SystemJobHealth[] = [];

  for (const row of rows) {
    if (seen.has(row.job_key)) continue;
    seen.add(row.job_key);
    jobs.push({
      jobKey: row.job_key,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      durationMs: finite(row.duration_ms),
      errorCode: row.error_code,
      summary: row.summary ?? {},
    });
  }

  return jobs;
}

function incidentRows(rows: IncidentRow[]): SystemIncident[] {
  return rows.map((row) => ({
    id: row.id,
    fingerprint: row.fingerprint,
    service: row.service,
    severity: row.severity,
    status: row.status,
    title: row.title,
    lastMessage: row.last_message,
    occurrenceCount: finite(row.occurrence_count),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    resolvedAt: row.resolved_at,
    metadata: row.metadata ?? {},
  }));
}

function notificationHealth(row: NotificationRow | null): NotificationHealth | null {
  if (!row) return null;
  return {
    status: row.status,
    lastRunAt: row.last_run_at,
    lastSuccessAt: row.last_success_at,
    lastErrorAt: row.last_error_at,
    failed: finite(row.failed),
    durationMs: nullableNumber(row.duration_ms),
    lastErrorCode: row.last_error_code,
  };
}

function emptyRequestAggregate(): RequestAggregate {
  return {
    estimatedRequests: 0,
    serverErrors: 0,
    rateLimited: 0,
    slowRequests: 0,
    durationSumMs: 0,
    maxDurationMs: 0,
    latency: [0, 0, 0, 0, 0],
  };
}

function addRequestMetric(target: RequestAggregate, row: RequestMetricRow) {
  target.estimatedRequests += finite(row.estimated_requests);
  target.serverErrors += finite(row.server_errors);
  target.rateLimited += finite(row.rate_limited);
  target.slowRequests += finite(row.slow_requests);
  target.durationSumMs += finite(row.duration_sum_ms);
  target.maxDurationMs = Math.max(
    target.maxDurationMs,
    finite(row.max_duration_ms),
  );
  target.latency[0] += finite(row.latency_0_250);
  target.latency[1] += finite(row.latency_250_500);
  target.latency[2] += finite(row.latency_500_1000);
  target.latency[3] += finite(row.latency_1000_2500);
  target.latency[4] += finite(row.latency_2500_plus);
}

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function averageMs(aggregate: RequestAggregate) {
  if (aggregate.estimatedRequests <= 0) return null;
  return Math.round(
    aggregate.durationSumMs / aggregate.estimatedRequests,
  );
}

function p95Ms(aggregate: RequestAggregate) {
  const total = aggregate.latency.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;

  const threshold = total * 0.95;
  const bounds = [250, 500, 1_000, 2_500];
  let cumulative = 0;

  for (let index = 0; index < aggregate.latency.length; index += 1) {
    cumulative += aggregate.latency[index];
    if (cumulative < threshold) continue;
    if (index < bounds.length) return bounds[index];
    return Math.max(2_500, aggregate.maxDurationMs);
  }

  return aggregate.maxDurationMs || null;
}

function requestRouteHealth(
  routeKey: string,
  method: string,
  aggregate: RequestAggregate,
): RequestRouteHealth {
  return {
    routeKey,
    method,
    estimatedRequests24h: aggregate.estimatedRequests,
    serverErrors24h: aggregate.serverErrors,
    errorRate24hPct: percent(
      aggregate.serverErrors,
      aggregate.estimatedRequests,
    ),
    rateLimited24h: aggregate.rateLimited,
    slowRequests24h: aggregate.slowRequests,
    averageMs24h: averageMs(aggregate),
    p95Ms24h: p95Ms(aggregate),
    maxDurationMs24h:
      aggregate.estimatedRequests > 0 ? aggregate.maxDurationMs : null,
  };
}

function requestHealthFromRows(
  rows: RequestMetricRow[],
  available: boolean,
): RequestPlatformHealth {
  const oneHourAgo = Date.now() - 60 * 60 * 1_000;
  const aggregate1h = emptyRequestAggregate();
  const aggregate24h = emptyRequestAggregate();
  const byRoute = new Map<string, RequestAggregate>();

  for (const row of rows) {
    addRequestMetric(aggregate24h, row);

    const bucketTime = new Date(row.bucket_start).getTime();
    if (Number.isFinite(bucketTime) && bucketTime >= oneHourAgo) {
      addRequestMetric(aggregate1h, row);
    }

    const routeMapKey = `${row.method} ${row.route_key}`;
    const routeAggregate = byRoute.get(routeMapKey) ?? emptyRequestAggregate();
    addRequestMetric(routeAggregate, row);
    byRoute.set(routeMapKey, routeAggregate);
  }

  const routes = [...byRoute.entries()]
    .map(([key, aggregate]) => {
      const space = key.indexOf(' ');
      const method = space >= 0 ? key.slice(0, space) : 'GET';
      const routeKey = space >= 0 ? key.slice(space + 1) : key;
      return requestRouteHealth(routeKey, method, aggregate);
    })
    .sort(
      (a, b) =>
        b.serverErrors24h - a.serverErrors24h ||
        (b.p95Ms24h ?? 0) - (a.p95Ms24h ?? 0) ||
        b.estimatedRequests24h - a.estimatedRequests24h,
    )
    .slice(0, 12);

  return {
    available,
    estimatedRequests1h: aggregate1h.estimatedRequests,
    estimatedRequests24h: aggregate24h.estimatedRequests,
    serverErrors1h: aggregate1h.serverErrors,
    serverErrors24h: aggregate24h.serverErrors,
    errorRate1hPct: percent(
      aggregate1h.serverErrors,
      aggregate1h.estimatedRequests,
    ),
    errorRate24hPct: percent(
      aggregate24h.serverErrors,
      aggregate24h.estimatedRequests,
    ),
    rateLimited1h: aggregate1h.rateLimited,
    rateLimited24h: aggregate24h.rateLimited,
    slowRequests1h: aggregate1h.slowRequests,
    slowRequests24h: aggregate24h.slowRequests,
    averageMs1h: averageMs(aggregate1h),
    averageMs24h: averageMs(aggregate24h),
    p95Ms1h: p95Ms(aggregate1h),
    p95Ms24h: p95Ms(aggregate24h),
    maxDurationMs24h:
      aggregate24h.estimatedRequests > 0
        ? aggregate24h.maxDurationMs
        : null,
    routes,
  };
}

export async function getSystemHealthSnapshot(): Promise<SystemHealthSnapshot> {
  const admin = createSupabaseAdmin();
  const productionPromise = getProductionHealthSnapshot();

  const playbackSince = new Date(
    Date.now() - 24 * 60 * 60 * 1_000,
  ).toISOString();

  const [
    settingsResult,
    runtimeResult,
    jobRunsResult,
    incidentsResult,
    notificationResult,
    playerStartsResult,
    playerFailuresResult,
    playerFallbacksResult,
    playerExhaustedResult,
    playerResumesResult,
    playerCompletionsResult,
    wtDriftResult,
    requestMetricsResult,
  ] = await Promise.all([
    admin
      .from('player_provider_settings')
      .select('provider_key,display_name,enabled,priority')
      .order('priority', { ascending: true }),
    admin
      .from('player_provider_runtime')
      .select(
        'provider_key,state,consecutive_failures,consecutive_successes,last_latency_ms,last_error,last_success_at,last_failure_at,cooldown_until',
      ),
    admin
      .from('system_job_runs')
      .select(
        'job_key,status,started_at,finished_at,duration_ms,error_code,summary',
      )
      .gte(
        'finished_at',
        new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString(),
      )
      .order('finished_at', { ascending: false })
      .limit(500),
    admin
      .from('system_incidents')
      .select(
        'id,fingerprint,service,severity,status,title,last_message,occurrence_count,first_seen_at,last_seen_at,resolved_at,metadata',
      )
      .eq('status', 'open')
      .order('last_seen_at', { ascending: false })
      .limit(50),
    admin
      .from('notification_service_health')
      .select(
        'status,last_run_at,last_success_at,last_error_at,failed,duration_ms,last_error_code',
      )
      .limit(1)
      .maybeSingle(),
    admin
      .from('product_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_name', 'player_started')
      .gte('created_at', playbackSince),
    admin
      .from('product_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_name', 'player_source_failed')
      .gte('created_at', playbackSince),
    admin
      .from('product_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_name', 'player_source_fallback')
      .gte('created_at', playbackSince),
    admin
      .from('product_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_name', 'player_source_exhausted')
      .gte('created_at', playbackSince),
    admin
      .from('product_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_name', 'player_resume_applied')
      .gte('created_at', playbackSince),
    admin
      .from('product_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_name', 'player_completed')
      .gte('created_at', playbackSince),
    admin
      .from('product_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_name', 'watch_party_sync_drift')
      .gte('created_at', playbackSince),
    admin
      .from('system_request_metrics')
      .select(
        'bucket_start,route_key,method,samples,estimated_requests,server_errors,rate_limited,slow_requests,duration_sum_ms,max_duration_ms,latency_0_250,latency_250_500,latency_500_1000,latency_1000_2500,latency_2500_plus',
      )
      .gte('bucket_start', playbackSince)
      .order('bucket_start', { ascending: false })
      .limit(10_000),
  ]);

  const production = await productionPromise;

  const providers = settingsResult.error || runtimeResult.error
    ? []
    : providerRows(
        (settingsResult.data ?? []) as ProviderSettingsRow[],
        (runtimeResult.data ?? []) as ProviderRuntimeRow[],
      );

  const rawJobRuns = jobRunsResult.error
    ? []
    : ((jobRunsResult.data ?? []) as JobRunRow[]);
  const jobs = latestJobs(rawJobRuns);

  const incidents = incidentsResult.error
    ? []
    : incidentRows((incidentsResult.data ?? []) as IncidentRow[]);

  const notification = notificationResult.error
    ? null
    : notificationHealth(notificationResult.data as NotificationRow | null);

  const requests = requestHealthFromRows(
    requestMetricsResult.error
      ? []
      : ((requestMetricsResult.data ?? []) as RequestMetricRow[]),
    !requestMetricsResult.error,
  );

  const playbackCount = (
    result: { count: number | null; error: unknown },
  ) => result.error ? 0 : Math.max(0, Number(result.count ?? 0));

  const starts24h = playbackCount(playerStartsResult);
  const sourceFailures24h = playbackCount(playerFailuresResult);
  const fallbacks24h = playbackCount(playerFallbacksResult);
  const sourceExhausted24h = playbackCount(playerExhaustedResult);
  const resumes24h = playbackCount(playerResumesResult);
  const completions24h = playbackCount(playerCompletionsResult);
  const wtDriftCorrections24h = playbackCount(wtDriftResult);
  const fallbackRatePct =
    starts24h > 0
      ? Math.round((fallbacks24h / starts24h) * 10_000) / 100
      : null;
  const exhaustionRatePct =
    starts24h > 0
      ? Math.round((sourceExhausted24h / starts24h) * 10_000) / 100
      : null;

  const openCriticalIncidents = incidents.filter(
    (item) => item.severity === 'critical',
  ).length;
  const openWarningIncidents = incidents.filter(
    (item) => item.severity === 'warning',
  ).length;
  const unhealthyProviders = providers.filter(
    (item) =>
      item.enabled &&
      item.state !== 'healthy' &&
      item.state !== 'closed' &&
      item.state !== 'unknown',
  ).length;
  const failedJobs24h = rawJobRuns.filter(
    (item) => item.status === 'failed',
  ).length;
  const degradedJobs24h = rawJobRuns.filter(
    (item) => item.status === 'degraded',
  ).length;

  const enoughRequestTraffic = requests.estimatedRequests1h >= 20;
  const requestRuntimeCritical =
    requests.available &&
    enoughRequestTraffic &&
    (requests.errorRate1hPct ?? 0) >= 5;
  const requestRuntimeDegraded =
    requests.available &&
    (
      (
        enoughRequestTraffic &&
        (
          (requests.errorRate1hPct ?? 0) >= 2 ||
          (requests.p95Ms1h ?? 0) >= 2_500
        )
      ) ||
      requests.rateLimited1h >= 10
    );

  const status =
    openCriticalIncidents > 0 || requestRuntimeCritical
      ? 'critical'
      : openWarningIncidents > 0 ||
          unhealthyProviders > 0 ||
          failedJobs24h > 0 ||
          degradedJobs24h > 0 ||
          production.cron.failed24h > 0 ||
          requestRuntimeDegraded
        ? 'degraded'
        : 'healthy';

  return {
    generatedAt: new Date().toISOString(),
    status,
    production,
    deployment: {
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
      gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      gitBranch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      region: process.env.VERCEL_REGION ?? null,
    },
    providers,
    jobs,
    incidents,
    notification,
    playback: {
      starts24h,
      sourceFailures24h,
      fallbacks24h,
      sourceExhausted24h,
      resumes24h,
      completions24h,
      wtDriftCorrections24h,
      fallbackRatePct,
      exhaustionRatePct,
    },
    requests,
    signals: {
      openCriticalIncidents,
      openWarningIncidents,
      unhealthyProviders,
      failedJobs24h,
      degradedJobs24h,
      requestRuntimeDegraded,
      requestRuntimeCritical,
    },
  };
}
