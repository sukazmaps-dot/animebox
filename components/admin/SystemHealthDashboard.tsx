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
    void load();
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
          <span className={styles.eyebrow}>WATCH PLATFORM · 17.6</span>
          <h1>System Health</h1>
          <p>
            Единый production-снимок: база, просмотр, комнаты, внешние
            провайдеры, фоновые задачи, уведомления и открытые инциденты.
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
          </div>

          <div className={styles.grid}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span>PLAYBACK · 24H</span>
                  <strong>Watch Platform</strong>
                </div>
                <small>
                  {health.playback.exhaustionRatePct == null
                    ? 'без стартов'
                    : `${number(health.playback.exhaustionRatePct, 2)}% exhausted`}
                </small>
              </div>

              <dl className={styles.metrics}>
                <div>
                  <dt>Подтверждённых стартов</dt>
                  <dd>{number(health.playback.starts24h)}</dd>
                </div>
                <div>
                  <dt>Ошибок источника</dt>
                  <dd>{number(health.playback.sourceFailures24h)}</dd>
                </div>
                <div>
                  <dt>Авто-fallback</dt>
                  <dd>{number(health.playback.fallbacks24h)}</dd>
                </div>
                <div>
                  <dt>Источники исчерпаны</dt>
                  <dd>{number(health.playback.sourceExhausted24h)}</dd>
                </div>
                <div>
                  <dt>Resume применён</dt>
                  <dd>{number(health.playback.resumes24h)}</dd>
                </div>
                <div>
                  <dt>Завершений</dt>
                  <dd>{number(health.playback.completions24h)}</dd>
                </div>
                <div>
                  <dt>WT drift corrections</dt>
                  <dd>{number(health.playback.wtDriftCorrections24h)}</dd>
                </div>
              </dl>
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
