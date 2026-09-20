'use client';

import { useEffect, useState } from 'react';

import type {
  PlayerHealthDashboard,
  PlayerHealthRange,
} from '@/lib/player-health';

import styles from './PlayerHealthDashboard.module.css';

type ApiResponse = {
  ok?: boolean;
  dashboard?: PlayerHealthDashboard;
  error?: string;
};

function number(value: unknown, digits = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return numeric.toLocaleString('ru-RU', { maximumFractionDigits: digits });
}

function pct(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${number(numeric, 1)}%` : '0%';
}

function ms(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value < 1_000) return `${Math.round(value)} ms`;
  return `${(value / 1_000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} s`;
}

function surfaceLabel(value: string) {
  if (value === 'telegram') return 'Telegram Mini App';
  if (value === 'mobile') return 'Mobile web';
  if (value === 'desktop') return 'Desktop web';
  return value;
}

export default function PlayerHealthDashboard() {
  const [range, setRange] = useState<PlayerHealthRange>(7);
  const [dashboard, setDashboard] = useState<PlayerHealthDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/admin/player-health?days=${range}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        const payload = (await response.json()) as ApiResponse;
        if (!response.ok || !payload.ok || !payload.dashboard) {
          throw new Error(
            payload.error === 'analytics_migration_required'
              ? 'Product Analytics ещё не готова: таблица product_events недоступна.'
              : 'Не удалось загрузить Player Health.',
          );
        }
        setDashboard(payload.dashboard);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Player Health unavailable');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [range]);

  const kpis = dashboard?.kpis;

  return (
    <section className={styles.dashboard} aria-label="AnimeBox Player Health">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>PLAYER PLATFORM · V2</span>
          <h1>Source Health & Playback</h1>
          <p>
            Реальные старты, таймауты, fallback и скорость источников. Метрики строятся только по техническим событиям AnimeBox Player.
          </p>
          {dashboard?.dataSince && (
            <small>
              данные с {new Date(dashboard.dataSince).toLocaleString('ru-RU')}
              {dashboard.truncated ? ' · выборка ограничена последними 20 000 событиями' : ''}
            </small>
          )}
        </div>

        <div className={styles.range} aria-label="Период Player Health">
          {([7, 30] as const).map((days) => (
            <button
              key={days}
              type="button"
              className={range === days ? styles.activeRange : ''}
              onClick={() => {
                if (days === range) return;
                setLoading(true);
                setError('');
                setRange(days);
              }}
              disabled={loading && range === days}
            >
              {days}d
            </button>
          ))}
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {loading && !dashboard && <div className={styles.loading}>Собираем Source Health…</div>}

      {dashboard && kpis ? (
        <>
          <div className={styles.kpis}>
            <article><span>Sessions</span><strong>{number(kpis.sessions)}</strong><small>player sessions</small></article>
            <article><span>Source success</span><strong>{pct(kpis.sourceSuccessRate)}</strong><small>{number(kpis.readyEvents)} ready · {number(kpis.failedEvents)} failed</small></article>
            <article><span>Source ready p50</span><strong>{ms(kpis.medianSourceReadyMs)}</strong><small>до готовности источника</small></article>
            <article><span>Source ready p95</span><strong>{ms(kpis.p95SourceReadyMs)}</strong><small>медленные 5%</small></article>
            <article><span>Click → play p50</span><strong>{ms(kpis.medianClickToPlayMs)}</strong><small>подтверждённый playback</small></article>
            <article><span>Click → play p95</span><strong>{ms(kpis.p95ClickToPlayMs)}</strong><small>подтверждённый playback</small></article>
            <article><span>Fallback success</span><strong>{pct(kpis.fallbackSuccessRate)}</strong><small>{number(kpis.fallbackSuccesses)} / {number(kpis.automaticSwitches)}</small></article>
            <article><span>Timeouts</span><strong>{number(kpis.timeouts)}</strong><small>из {number(kpis.failedEvents)} failures</small></article>
          </div>

          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <div><span>PROVIDERS</span><h2>Какие источники реально работают лучше</h2></div>
              <small>{number(dashboard.sampledEvents)} событий</small>
            </div>

            {dashboard.providers.length ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Источник</th>
                      <th>Выборы</th>
                      <th>Success</th>
                      <th>Ready p50</th>
                      <th>Ready p95</th>
                      <th>Timeout</th>
                      <th>Fallback in</th>
                      <th>Auto / Manual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.providers.map((provider) => (
                      <tr key={provider.provider}>
                        <td><strong>{provider.provider}</strong><small>{number(provider.confirmedStarts)} confirmed starts</small></td>
                        <td>{number(provider.selections)}</td>
                        <td><span className={provider.successRate >= 95 ? styles.good : provider.successRate >= 85 ? styles.warn : styles.bad}>{pct(provider.successRate)}</span></td>
                        <td>{ms(provider.medianReadyMs)}</td>
                        <td>{ms(provider.p95ReadyMs)}</td>
                        <td>{number(provider.timeouts)}</td>
                        <td>{number(provider.fallbackIns)}</td>
                        <td>{number(provider.automaticSelections)} / {number(provider.manualSelections)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.empty}>Player events ещё не накопились. После первых просмотров здесь появится статистика.</div>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <div><span>SURFACES</span><h2>Где возникают проблемы</h2></div>
              <small>без хранения модели устройства</small>
            </div>
            <div className={styles.surfaceGrid}>
              {dashboard.surfaces.map((surface) => (
                <article key={surface.surface}>
                  <span>{surfaceLabel(surface.surface)}</span>
                  <strong>{number(surface.sessions)} sessions</strong>
                  <small>{number(surface.ready)} ready · {number(surface.failures)} failed · {number(surface.starts)} starts</small>
                </article>
              ))}
              {!dashboard.surfaces.length && <div className={styles.empty}>Пока нет данных по платформам.</div>}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
