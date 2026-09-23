'use client';

import { useCallback, useEffect, useState } from 'react';

import type { ProductionHealthSnapshot } from '@/lib/production-health';

import styles from './ProductionHealthDashboard.module.css';

type ApiResponse = {
  ok?: boolean;
  health?: ProductionHealthSnapshot;
  error?: string;
};

function number(value: unknown, digits = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return numeric.toLocaleString('ru-RU', { maximumFractionDigits: digits });
}

function time(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('ru-RU')
    : '—';
}

function healthTone(input: boolean) {
  return input ? styles.good : styles.warn;
}

export default function ProductionHealthDashboard() {
  const [health, setHealth] = useState<ProductionHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/production-health', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok || !payload.health) {
        throw new Error('Не удалось получить Production Health.');
      }

      setHealth(payload.health);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Production Health недоступен.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={styles.dashboard} aria-label="AnimeBox Production Health">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>SCALE & STABILITY · PATCH 15</span>
          <h1>Production Health</h1>
          <p>
            Быстрый снимок нагрузки AnimeBox: просмотр, Watch Together, чат,
            rate-limit buckets, cron и состояние PostgreSQL.
          </p>
          {health?.generatedAt && (
            <small>снимок: {time(health.generatedAt)}</small>
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
        <div className={styles.loading}>Собираем состояние production…</div>
      )}

      {health && (
        <>
          <div className={styles.kpis}>
            <article>
              <span>Watch сейчас</span>
              <strong>{number(health.watch.activeSessions)}</strong>
              <small>{number(health.watch.sessions1h)} сессий за час</small>
            </article>

            <article>
              <span>WT комнаты</span>
              <strong>{number(health.watchParty.activeRooms)}</strong>
              <small>
                {number(health.watchParty.activeParticipants)} участников
              </small>
            </article>

            <article>
              <span>DB connections</span>
              <strong>{number(health.database.connections)}</strong>
              <small>
                cache hit {health.database.cacheHitPct == null
                  ? '—'
                  : number(health.database.cacheHitPct, 2) + '%'}
              </small>
            </article>

            <article>
              <span>Cron failures · 24h</span>
              <strong className={healthTone(health.cron.failed24h === 0)}>
                {number(health.cron.failed24h)}
              </strong>
              <small>последний success: {time(health.cron.lastSuccessAt)}</small>
            </article>
          </div>

          <div className={styles.grid}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <span>WATCH</span>
                <strong>Playback telemetry</strong>
              </div>
              <dl>
                <div><dt>Heartbeats · 5m</dt><dd>{number(health.watch.heartbeats5m)}</dd></div>
                <div><dt>Heartbeats · 1h</dt><dd>{number(health.watch.heartbeats1h)}</dd></div>
                <div><dt>Sessions · 1h</dt><dd>{number(health.watch.sessions1h)}</dd></div>
              </dl>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <span>WATCH TOGETHER</span>
                <strong>Room lifecycle</strong>
              </div>
              <dl>
                <div><dt>Active rooms</dt><dd>{number(health.watchParty.activeRooms)}</dd></div>
                <div><dt>Participants</dt><dd>{number(health.watchParty.activeParticipants)}</dd></div>
                <div><dt>Stale rooms</dt><dd className={healthTone(health.watchParty.staleRooms === 0)}>{number(health.watchParty.staleRooms)}</dd></div>
                <div><dt>Created · 24h</dt><dd>{number(health.watchParty.roomsCreated24h)}</dd></div>
              </dl>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <span>TRAFFIC</span>
                <strong>Chat & analytics</strong>
              </div>
              <dl>
                <div><dt>Chat · 1h</dt><dd>{number(health.chat.messages1h)}</dd></div>
                <div><dt>Chat · 24h</dt><dd>{number(health.chat.messages24h)}</dd></div>
                <div><dt>Events · 1h</dt><dd>{number(health.analytics.events1h)}</dd></div>
                <div><dt>Events · 24h</dt><dd>{number(health.analytics.events24h)}</dd></div>
              </dl>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <span>SHIELD</span>
                <strong>Rate limiting & cron</strong>
              </div>
              <dl>
                <div><dt>Rate buckets</dt><dd>{number(health.rateLimit.bucketRows)}</dd></div>
                <div><dt>Bucket requests · 1h</dt><dd>{number(health.rateLimit.requests1h)}</dd></div>
                <div><dt>Last cron failure</dt><dd>{time(health.cron.lastFailureAt)}</dd></div>
              </dl>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
