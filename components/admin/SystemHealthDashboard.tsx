'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  SystemHealthSnapshot,
  SystemHealthTone,
} from '@/lib/system-health';

import styles from './SystemHealthDashboard.module.css';

type ApiResponse = {
  ok?: boolean;
  health?: SystemHealthSnapshot;
  error?: string;
};

function number(value: unknown, digits = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '0';
  return parsed.toLocaleString('ru-RU', {
    maximumFractionDigits: digits,
  });
}

function time(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('ru-RU')
    : '—';
}

function duration(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value < 1_000) return `${Math.round(value)} ms`;
  return `${(value / 1_000).toLocaleString('ru-RU', {
    maximumFractionDigits: 1,
  })} s`;
}

function statusCopy(status: SystemHealthTone) {
  if (status === 'critical') return 'Требуется вмешательство';
  if (status === 'degraded') return 'Есть деградация';
  return 'Система работает штатно';
}

function shortSha(value: string | null) {
  return value ? value.slice(0, 8) : 'local';
}

export default function SystemHealthDashboard() {
  const [health, setHealth] = useState<SystemHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolvingIncidentId, setResolvingIncidentId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/system-health', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok || !payload.health) {
        throw new Error(
          payload.error === 'system_health_migration_required'
            ? 'Миграция Core Platform ещё не применена.'
            : 'System Health недоступен.',
        );
      }

      setHealth(payload.health);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'System Health недоступен.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) void load();
    });

    return () => {
      cancelled = true;
    };
  }, [load]);

  const jobs = useMemo(
    () => health?.jobs ?? [],
    [health?.jobs],
  );

  const resolveIncident = useCallback(async (incidentId: string) => {
    if (resolvingIncidentId) return;

    setResolvingIncidentId(incidentId);
    setError('');

    try {
      const response = await fetch(
        `/api/admin/system-health/incidents/${encodeURIComponent(incidentId)}/resolve`,
        {
          method: 'POST',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        },
      );

      if (!response.ok) {
        throw new Error('Не удалось закрыть инцидент.');
      }

      await load();
    } catch (resolveError) {
      setError(
        resolveError instanceof Error
          ? resolveError.message
          : 'Не удалось закрыть инцидент.',
      );
    } finally {
      setResolvingIncidentId(null);
    }
  }, [load, resolvingIncidentId]);

  return (
    <section className={styles.dashboard} aria-label="AnimeBox System Health">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>SEO INDEX QUALITY · 18.5.5.5</span>
          <h1>System Health</h1>
          <p>
            Единый production-снимок: API, база и полный playback journey —
            source discovery, player ready, fallback, провайдеры, фоновые задачи
            и инциденты с request id.
          </p>
          {health && (
            <small>
              {health.deployment.environment} · {health.deployment.gitBranch ?? 'branch?'}
              {' · '}
              {shortSha(health.deployment.gitSha)}
              {' · '}
              {health.deployment.region ?? 'region?'}
              {' · '}снимок {time(health.generatedAt)}
            </small>
          )}
        </div>

        <button
          type="button"
          className={styles.refresh}
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? 'Обновляем…' : 'Обновить'}
        </button>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {loading && !health && (
        <div className={styles.loading}>Собираем состояние платформы…</div>
      )}

      {health && (
        <>
          <section
            className={styles.overall}
            data-tone={health.status}
          >
            <div>
              <span className={styles.statusDot} aria-hidden="true" />
              <div>
                <small>ОБЩИЙ СТАТУС</small>
                <strong>{statusCopy(health.status)}</strong>
              </div>
            </div>
            <p>
              {health.signals.openCriticalIncidents} critical ·{' '}
              {health.signals.openWarningIncidents} warning ·{' '}
              {health.signals.unhealthyProviders} provider alerts
              {' · '}
              {health.requests.available
                ? `${number(health.requests.errorRate1hPct ?? 0, 2)}% API 5xx / 1h`
                : 'API telemetry pending'}
              {' · '}
              {health.signals.playbackRuntimeCritical
                ? 'playback critical'
                : health.signals.playbackRuntimeDegraded
                  ? 'playback degraded'
                  : 'playback nominal'}
              {' · '}
              {health.signals.dependencyWarnings} dependency warnings
            </p>
          </section>

          <div className={styles.kpis}>
            <article>
              <span>Watch сейчас</span>
              <strong>{number(health.production.watch.activeSessions)}</strong>
              <small>{number(health.production.watch.sessions1h)} сессий / час</small>
            </article>
            <article>
              <span>WT комнаты</span>
              <strong>{number(health.production.watchParty.activeRooms)}</strong>
              <small>{number(health.production.watchParty.activeParticipants)} участников</small>
            </article>
            <article>
              <span>DB cache hit</span>
              <strong>
                {health.production.database.cacheHitPct == null
                  ? '—'
                  : `${number(health.production.database.cacheHitPct, 2)}%`}
              </strong>
              <small>{number(health.production.database.connections)} подключений</small>
            </article>
            <article>
              <span>Job failures · 24h</span>
              <strong>{number(health.signals.failedJobs24h)}</strong>
              <small>{number(health.signals.degradedJobs24h)} degraded</small>
            </article>
            <article>
              <span>Open incidents</span>
              <strong>
                {number(
                  health.signals.openCriticalIncidents +
                    health.signals.openWarningIncidents,
                )}
              </strong>
              <small>{number(health.signals.openCriticalIncidents)} critical</small>
            </article>
            <article>
              <span>Fallback rate · 24h</span>
              <strong>
                {health.playback.fallbackRatePct == null
                  ? '—'
                  : `${number(health.playback.fallbackRatePct, 2)}%`}
              </strong>
              <small>
                {number(health.playback.fallbacks24h)} переключений ·{' '}
                {number(health.playback.starts24h)} стартов
              </small>
            </article>
            <article>
              <span>Discovery success · 24h</span>
              <strong>
                {health.playback.discoverySuccessRatePct == null
                  ? '—'
                  : `${number(health.playback.discoverySuccessRatePct, 2)}%`}
              </strong>
              <small>
                {number(health.playback.discoveryReady24h)} ready ·{' '}
                {number(health.playback.discoveryPlans24h)} plans
              </small>
            </article>
            <article>
              <span>First source p95</span>
              <strong>{duration(health.playback.firstSourceP95Ms)}</strong>
              <small>
                p50 {duration(health.playback.firstSourceP50Ms)} ·{' '}
                {number(health.playback.discoveryAttempts24h)} attempts
              </small>
            </article>
            <article>
              <span>Player ready p95</span>
              <strong>{duration(health.playback.endToEndReadyP95Ms)}</strong>
              <small>
                source mount p95 {duration(health.playback.playerReadyP95Ms)}
              </small>
            </article>
            <article>
              <span>API requests · 1h</span>
              <strong>
                {health.requests.available
                  ? number(health.requests.estimatedRequests1h)
                  : '—'}
              </strong>
              <small>
                {health.requests.available
                  ? `${number(health.requests.estimatedRequests24h)} / 24h · sampled`
                  : 'ожидаем migration v2'}
              </small>
            </article>
            <article>
              <span>API 5xx · 1h</span>
              <strong>
                {health.requests.available
                  ? `${number(health.requests.errorRate1hPct ?? 0, 2)}%`
                  : '—'}
              </strong>
              <small>
                {health.requests.available
                  ? `${number(health.requests.serverErrors1h)} errors · ${number(health.requests.rateLimited1h)} rate limited`
                  : 'telemetry unavailable'}
              </small>
            </article>
            <article>
              <span>API p95 · 1h</span>
              <strong>
                {health.requests.available
                  ? duration(health.requests.p95Ms1h)
                  : '—'}
              </strong>
              <small>
                {health.requests.available
                  ? `${number(health.requests.slowRequests1h)} slow · p99 ${duration(health.requests.p99Ms1h)}`
                  : 'telemetry unavailable'}
              </small>
            </article>
            <article>
              <span>Upstream circuits</span>
              <strong>{number(health.signals.upstreamCircuitOpen)}</strong>
              <small>{number(health.upstreams.length)} upstream budgets</small>
            </article>
            <article>
              <span>Upstream queue</span>
              <strong>{number(health.signals.upstreamQueued)}</strong>
              <small>this server instance</small>
            </article>
            <article>
              <span>SEO titles</span>
              <strong>
                {health.seo.available ? number(health.seo.animeIndexable) : '—'}
              </strong>
              <small>
                {health.seo.available
                  ? `${number(health.seo.animeNoindex)} quality-noindex`
                  : 'registry unavailable'}
              </small>
            </article>
            <article>
              <span>SEO stale</span>
              <strong>
                {health.seo.available
                  ? number(health.seo.animeStale + health.seo.episodeStale)
                  : '—'}
              </strong>
              <small>
                {health.seo.available
                  ? `${number(health.seo.animeStale)} titles · ${number(health.seo.episodeStale)} episodes`
                  : 'registry unavailable'}
              </small>
            </article>
          </div>

          <div className={styles.grid}>
            <section className={`${styles.panel} ${styles.widePanel}`}>
              <div className={styles.panelHead}>
                <div>
                  <span>API RUNTIME · 1H / 24H</span>
                  <strong>Latency, errors & rate limiting</strong>
                </div>
                <small>
                  {health.requests.available
                    ? `p95 ${duration(health.requests.p95Ms24h)} · p99 ${duration(health.requests.p99Ms24h)}`
                    : 'migration v2 pending'}
                </small>
              </div>

              {!health.requests.available ? (
                <div className={styles.empty}>
                  Request telemetry ещё не доступна. Основной System Health
                  продолжает работать fail-open.
                </div>
              ) : (
                <>
                  <dl className={styles.metrics}>
                    <div>
                      <dt>Estimated requests · 24h</dt>
                      <dd>{number(health.requests.estimatedRequests24h)}</dd>
                    </div>
                    <div>
                      <dt>Server errors · 24h</dt>
                      <dd>
                        {number(health.requests.serverErrors24h)}
                        {' · '}
                        {number(health.requests.errorRate24hPct ?? 0, 2)}%
                      </dd>
                    </div>
                    <div>
                      <dt>Rate limited · 24h</dt>
                      <dd>{number(health.requests.rateLimited24h)}</dd>
                    </div>
                    <div>
                      <dt>Slow requests · 24h</dt>
                      <dd>{number(health.requests.slowRequests24h)}</dd>
                    </div>
                    <div>
                      <dt>Max observed · 24h</dt>
                      <dd>{duration(health.requests.maxDurationMs24h)}</dd>
                    </div>
                  </dl>

                  <div className={styles.routeList}>
                    {health.requests.routes.length ? health.requests.routes.map((route) => (
                      <div
                        className={styles.routeRow}
                        key={`${route.method}:${route.routeKey}`}
                      >
                        <div>
                          <strong>{route.method} {route.routeKey}</strong>
                          <small>
                            {number(route.estimatedRequests24h)} req · avg{' '}
                            {duration(route.averageMs24h)}
                          </small>
                        </div>
                        <div className={styles.routeMeta}>
                          <small>
                            5xx {number(route.serverErrors24h)}
                            {' · '}
                            {number(route.errorRate24hPct ?? 0, 2)}%
                          </small>
                          <small>p95 {duration(route.p95Ms24h)}</small>
                          <small>p99 {duration(route.p99Ms24h)}</small>
                          <small>slow {number(route.slowRequests24h)}</small>
                          <small>429 {number(route.rateLimited24h)}</small>
                          <small>max {duration(route.maxDurationMs24h)}</small>
                        </div>
                      </div>
                    )) : (
                      <div className={styles.empty}>
                        Метрики появятся после первых запросов к наблюдаемым API.
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span>DEPENDENCIES</span>
                  <strong>Supabase & media edge</strong>
                </div>
                <small>{health.signals.dependencyWarnings} warnings</small>
              </div>

              <dl className={styles.metrics}>
                <div>
                  <dt>Supabase</dt>
                  <dd>
                    {health.dependencies.supabase.state}
                    {' · '}
                    {duration(health.dependencies.supabase.latencyMs)}
                  </dd>
                </div>
                <div>
                  <dt>Media edge</dt>
                  <dd>
                    {health.dependencies.mediaEdge.configured
                      ? `${health.dependencies.mediaEdge.state} · ${duration(health.dependencies.mediaEdge.latencyMs)}`
                      : 'not configured'}
                  </dd>
                </div>
                <div>
                  <dt>Media protocol</dt>
                  <dd>{health.dependencies.mediaEdge.protocol ?? '—'}</dd>
                </div>
                <div>
                  <dt>Media R2</dt>
                  <dd>
                    {health.dependencies.mediaEdge.r2 == null
                      ? '—'
                      : health.dependencies.mediaEdge.r2
                        ? 'connected'
                        : 'missing'}
                  </dd>
                </div>
              </dl>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span>SEO INDEX</span>
                  <strong>Canonical crawl inventory</strong>
                </div>
                <small>
                  {health.seo.available
                    ? `verified ${time(health.seo.lastAnimeVerifiedAt)}`
                    : 'registry unavailable'}
                </small>
              </div>

              <dl className={styles.metrics}>
                <div>
                  <dt>Indexable titles</dt>
                  <dd>{health.seo.available ? number(health.seo.animeIndexable) : '—'}</dd>
                </div>
                <div>
                  <dt>Quality noindex</dt>
                  <dd>{health.seo.available ? number(health.seo.animeNoindex) : '—'}</dd>
                </div>
                <div>
                  <dt>Stale titles</dt>
                  <dd>{health.seo.available ? number(health.seo.animeStale) : '—'}</dd>
                </div>
                <div>
                  <dt>Indexable episodes</dt>
                  <dd>{health.seo.available ? number(health.seo.episodeIndexable) : '—'}</dd>
                </div>
                <div>
                  <dt>Stale episodes</dt>
                  <dd>{health.seo.available ? number(health.seo.episodeStale) : '—'}</dd>
                </div>
                <div>
                  <dt>Video sitemap entries</dt>
                  <dd>{health.seo.available ? number(health.seo.videoEntries) : '—'}</dd>
                </div>
              </dl>
            </section>

            <section className={`${styles.panel} ${styles.widePanel}`}>
              <div className={styles.panelHead}>
                <div>
                  <span>UPSTREAM SHIELD · THIS INSTANCE</span>
                  <strong>Concurrency, queue & circuit breaker</strong>
                </div>
                <small>
                  {number(health.signals.upstreamCircuitOpen)} circuit ·{' '}
                  {number(health.signals.upstreamQueued)} queued
                </small>
              </div>

              <div className={styles.routeList}>
                {health.upstreams.map((upstream) => (
                  <div className={styles.routeRow} key={upstream.key}>
                    <div>
                      <strong>{upstream.key}</strong>
                      <small>
                        {number(upstream.active)}/{number(upstream.concurrency)} active ·{' '}
                        {number(upstream.queued)}/{number(upstream.maxQueue)} queued
                      </small>
                    </div>
                    <div className={styles.routeMeta}>
                      <small>circuit {upstream.circuit}</small>
                      <small>{number(upstream.consecutiveFailures)} failures</small>
                      <small>{number(upstream.rejected)} shed</small>
                      <small>{number(upstream.accepted)} accepted</small>
                      <small>{number(upstream.circuitOpened)} opens</small>
                      <small>
                        {upstream.openUntil ? `until ${time(upstream.openUntil)}` : 'ready'}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className={`${styles.panel} ${styles.widePanel}`}>
              <div className={styles.panelHead}>
                <div>
                  <span>PLAYBACK SLO · 24H</span>
                  <strong>Discovery → source → player ready</strong>
                </div>
                <small>
                  {health.playback.discoverySuccessRatePct == null
                    ? 'ожидаем новые telemetry events'
                    : `${number(health.playback.discoverySuccessRatePct, 2)}% discovery success`}
                </small>
              </div>

              <dl className={styles.metrics}>
                <div>
                  <dt>Discovery plans</dt>
                  <dd>{number(health.playback.discoveryPlans24h)}</dd>
                </div>
                <div>
                  <dt>Provider attempts</dt>
                  <dd>{number(health.playback.discoveryAttempts24h)}</dd>
                </div>
                <div>
                  <dt>First source ready</dt>
                  <dd>{number(health.playback.discoveryReady24h)}</dd>
                </div>
                <div>
                  <dt>Discovery exhausted</dt>
                  <dd>{number(health.playback.discoveryExhausted24h)}</dd>
                </div>
                <div>
                  <dt>First source p50 / p95</dt>
                  <dd>
                    {duration(health.playback.firstSourceP50Ms)}
                    {' / '}
                    {duration(health.playback.firstSourceP95Ms)}
                  </dd>
                </div>
                <div>
                  <dt>Source mount p50 / p95</dt>
                  <dd>
                    {duration(health.playback.playerReadyP50Ms)}
                    {' / '}
                    {duration(health.playback.playerReadyP95Ms)}
                  </dd>
                </div>
                <div>
                  <dt>End-to-end ready p50 / p95</dt>
                  <dd>
                    {duration(health.playback.endToEndReadyP50Ms)}
                    {' / '}
                    {duration(health.playback.endToEndReadyP95Ms)}
                  </dd>
                </div>
                <div>
                  <dt>Runtime failures / fallback</dt>
                  <dd>
                    {number(health.playback.sourceFailures24h)}
                    {' / '}
                    {number(health.playback.fallbacks24h)}
                  </dd>
                </div>
                <div>
                  <dt>Runtime exhausted</dt>
                  <dd>
                    {number(health.playback.sourceExhausted24h)}
                    {health.playback.exhaustionRatePct == null
                      ? ''
                      : ` · ${number(health.playback.exhaustionRatePct, 2)}%`}
                  </dd>
                </div>
                <div>
                  <dt>Confirmed starts / completions</dt>
                  <dd>
                    {number(health.playback.starts24h)}
                    {' / '}
                    {number(health.playback.completions24h)}
                  </dd>
                </div>
              </dl>

              <div className={styles.routeList}>
                {health.playback.providers.length ? (
                  health.playback.providers.map((provider) => (
                    <div
                      className={styles.routeRow}
                      key={provider.providerKey}
                    >
                      <div>
                        <strong>{provider.providerKey}</strong>
                        <small>
                          {number(provider.attempts24h)} discovery attempts ·{' '}
                          {number(provider.playerReady24h)} player ready
                        </small>
                      </div>
                      <div className={styles.routeMeta}>
                        <small>
                          discovery ready {number(provider.discoveryReady24h)}
                        </small>
                        <small>
                          timeout {number(provider.discoveryTimeouts24h)}
                        </small>
                        <small>
                          unavailable {number(provider.discoveryUnavailable24h)}
                        </small>
                        <small>
                          attempt p95 {duration(provider.attemptP95Ms)}
                        </small>
                        <small>
                          mount p95 {duration(provider.playerReadyP95Ms)}
                        </small>
                        <small>
                          total p95 {duration(provider.endToEndReadyP95Ms)}
                        </small>
                        <small>
                          runtime failures {number(provider.runtimeFailures24h)}
                        </small>
                        <small>
                          fallback from {number(provider.fallbacksFrom24h)}
                        </small>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.empty}>
                    Новые playback telemetry появятся после запусков плеера на
                    версии 18.5.4.3.
                  </div>
                )}
              </div>

              <small>
                Resume {number(health.playback.resumes24h)} · WT drift{' '}
                {number(health.playback.wtDriftCorrections24h)}
              </small>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span>PROVIDERS</span>
                  <strong>Player runtime</strong>
                </div>
                <small>{health.providers.length} источников</small>
              </div>

              <div className={styles.rows}>
                {health.providers.length ? health.providers.map((provider) => (
                  <div className={styles.providerRow} key={provider.key}>
                    <div>
                      <strong>{provider.name}</strong>
                      <small>
                        priority {provider.priority}
                        {!provider.enabled ? ' · disabled' : ''}
                      </small>
                    </div>
                    <span data-state={provider.state}>
                      {provider.state}
                    </span>
                    <div className={styles.providerMeta}>
                      <small>{duration(provider.lastLatencyMs)}</small>
                      <small>{provider.consecutiveFailures} failures</small>
                    </div>
                  </div>
                )) : (
                  <div className={styles.empty}>Нет runtime-данных провайдеров.</div>
                )}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span>JOBS</span>
                  <strong>Maintenance & sync</strong>
                </div>
                <small>последний запуск</small>
              </div>

              <div className={styles.rows}>
                {jobs.length ? jobs.map((job) => (
                  <div className={styles.jobRow} key={job.jobKey}>
                    <div>
                      <strong>{job.jobKey}</strong>
                      <small>{time(job.finishedAt)}</small>
                    </div>
                    <span data-state={job.status}>{job.status}</span>
                    <div className={styles.jobMeta}>
                      <small>{duration(job.durationMs)}</small>
                      <small>{job.errorCode ?? 'ok'}</small>
                    </div>
                  </div>
                )) : (
                  <div className={styles.empty}>
                    Журнал появится после первого запуска cron на 17.5.
                  </div>
                )}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span>INCIDENTS</span>
                  <strong>Open problems</strong>
                </div>
                <small>{health.incidents.length} открыто</small>
              </div>

              <div className={styles.rows}>
                {health.incidents.length ? health.incidents.map((incident) => (
                  <div
                    className={styles.incidentRow}
                    data-severity={incident.severity}
                    key={incident.id}
                  >
                    <div>
                      <strong>{incident.title}</strong>
                      <small>
                        {incident.service} · {incident.occurrenceCount}× ·{' '}
                        {time(incident.lastSeenAt)}
                      </small>
                      {typeof incident.metadata.requestId === 'string' && (
                        <small>
                          request {incident.metadata.requestId}
                        </small>
                      )}
                    </div>
                    <div className={styles.incidentActions}>
                      <span>{incident.severity}</span>
                      <button
                        type="button"
                        disabled={resolvingIncidentId === incident.id}
                        onClick={() => void resolveIncident(incident.id)}
                      >
                        {resolvingIncidentId === incident.id
                          ? 'Закрываем…'
                          : 'Закрыть'}
                      </button>
                    </div>
                    {incident.lastMessage && (
                      <p>{incident.lastMessage}</p>
                    )}
                  </div>
                )) : (
                  <div className={styles.empty}>Открытых инцидентов нет.</div>
                )}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span>NOTIFICATIONS</span>
                  <strong>Episode delivery worker</strong>
                </div>
                <small>{health.notification?.status ?? 'unknown'}</small>
              </div>

              <dl className={styles.metrics}>
                <div>
                  <dt>Последний запуск</dt>
                  <dd>{time(health.notification?.lastRunAt)}</dd>
                </div>
                <div>
                  <dt>Последний success</dt>
                  <dd>{time(health.notification?.lastSuccessAt)}</dd>
                </div>
                <div>
                  <dt>Ошибок в запуске</dt>
                  <dd>{number(health.notification?.failed ?? 0)}</dd>
                </div>
                <div>
                  <dt>Длительность</dt>
                  <dd>{duration(health.notification?.durationMs)}</dd>
                </div>
                <div>
                  <dt>Последний error</dt>
                  <dd>{health.notification?.lastErrorCode ?? '—'}</dd>
                </div>
              </dl>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
