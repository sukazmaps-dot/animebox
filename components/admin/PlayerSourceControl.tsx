'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import styles from './PlayerSourceControl.module.css';

type ProviderRow = {
  key: 'direct' | 'kodik' | 'aniliberty';
  name: string;
  enabled: boolean;
  environmentReady: boolean;
  priority: number;
  failureThreshold: number;
  cooldownSeconds: number;
  notes: string | null;
  state: 'healthy' | 'degraded' | 'unavailable' | 'unknown';
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastLatencyMs: number | null;
  lastError: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  cooldownUntil: string | null;
  updatedAt: string;
};

type HealthProvider = {
  provider: string;
  selections: number;
  ready: number;
  failures: number;
  successRate: number;
  medianReadyMs: number | null;
  p95ReadyMs: number | null;
  timeouts: number;
  fallbackIns: number;
};

type Payload = {
  ok?: boolean;
  providers?: ProviderRow[];
  health?: {
    providers?: HealthProvider[];
    kpis?: {
      sourceSuccessRate?: number;
      fallbackSuccessRate?: number;
    };
  };
  error?: string;
};

function ms(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value < 1000) return Math.round(value) + ' ms';
  return (value / 1000).toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
  }) + ' s';
}

function pct(value: number | null | undefined) {
  return Number.isFinite(value)
    ? Number(value).toLocaleString('ru-RU', {
        maximumFractionDigits: 1,
      }) + '%'
    : '—';
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU');
}

export default function PlayerSourceControl() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [healthProviders, setHealthProviders] = useState<HealthProvider[]>([]);
  const [range, setRange] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/player-sources?days=' + range, {
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => ({}))) as Payload;

    if (!response.ok || !payload.ok || !payload.providers) {
      throw new Error(
        payload.error === 'player_source_migration_required'
          ? 'Нужна миграция Player Source Control.'
          : payload.error || 'Не удалось загрузить Source Control.',
      );
    }

    setProviders(payload.providers);
    setHealthProviders(payload.health?.providers || []);
    setError('');
    setLoading(false);
  }, [range]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Source Control unavailable.',
        );
        setLoading(false);
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  const metricByName = useMemo(
    () => new Map(healthProviders.map((item) => [item.provider, item])),
    [healthProviders],
  );

  function updateLocal(
    key: ProviderRow['key'],
    patch: Partial<ProviderRow>,
  ) {
    setProviders((current) =>
      current.map((item) =>
        item.key === key ? { ...item, ...patch } : item,
      ),
    );
  }

  async function mutate(body: Record<string, unknown>, key: string) {
    setBusyKey(key);
    setError('');

    try {
      const response = await fetch('/api/admin/player-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as Payload;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Действие не выполнено.');
      }

      await load();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Не удалось выполнить действие.',
      );
    } finally {
      setBusyKey('');
    }
  }

  async function save(
    event: FormEvent<HTMLFormElement>,
    provider: ProviderRow,
  ) {
    event.preventDefault();

    await mutate(
      {
        action: 'update_provider',
        provider: provider.key,
        enabled: provider.enabled,
        priority: provider.priority,
        failureThreshold: provider.failureThreshold,
        cooldownSeconds: provider.cooldownSeconds,
        notes: provider.notes || '',
      },
      provider.key + ':save',
    );
  }

  return (
    <div className="admin-v1-page">
      <header className="admin-v1-header">
        <div>
          <span>PLAYER PLATFORM · V3</span>
          <h1>Player Source Control</h1>
          <p>
            Priority, kill-switch, runtime health и recovery cooldown для
            всех источников AnimeBox.
          </p>
        </div>

        <div className={styles.range}>
          {([7, 30] as const).map((days) => (
            <button
              key={days}
              type="button"
              data-active={range === days}
              onClick={() => {
                setLoading(true);
                setRange(days);
              }}
            >
              {days}d
            </button>
          ))}
        </div>
      </header>

      {error && <div className="admin-v1-error">{error}</div>}
      {loading && !providers.length && (
        <div className="admin-v1-loading">Загружаем provider registry…</div>
      )}

      <section className={styles.legend}>
        <div><span className={styles.dotHealthy} /> healthy</div>
        <div><span className={styles.dotDegraded} /> degraded</div>
        <div><span className={styles.dotUnavailable} /> unavailable</div>
        <div><span className={styles.dotUnknown} /> unknown</div>
      </section>

      <section className={styles.grid}>
        {providers.map((provider) => {
          const metric = metricByName.get(provider.name);
          const saving = busyKey === provider.key + ':save';
          const resetting = busyKey === provider.key + ':reset';

          return (
            <form
              key={provider.key}
              className={styles.card}
              onSubmit={(event) => void save(event, provider)}
            >
              <div className={styles.cardHead}>
                <div>
                  <span>{provider.key.toUpperCase()}</span>
                  <h2>{provider.name}</h2>
                </div>

                <span
                  className={styles.state}
                  data-state={provider.state}
                >
                  {provider.state}
                </span>
              </div>

              <label className={styles.switchRow}>
                <span>
                  <strong>Provider enabled</strong>
                  <small>
                    kill-switch без deploy
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={provider.enabled}
                  onChange={(event) =>
                    updateLocal(provider.key, {
                      enabled: event.target.checked,
                    })
                  }
                />
              </label>

              {!provider.environmentReady && (
                <div className={styles.warning}>
                  ENV/API-конфигурация этого провайдера сейчас не готова.
                </div>
              )}

              <div className={styles.fields}>
                <label>
                  <span>Priority</span>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={provider.priority}
                    onChange={(event) =>
                      updateLocal(provider.key, {
                        priority: Number(event.target.value),
                      })
                    }
                  />
                </label>

                <label>
                  <span>Failures → cooldown</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={provider.failureThreshold}
                    onChange={(event) =>
                      updateLocal(provider.key, {
                        failureThreshold: Number(event.target.value),
                      })
                    }
                  />
                </label>

                <label>
                  <span>Cooldown, sec</span>
                  <input
                    type="number"
                    min={30}
                    max={86400}
                    value={provider.cooldownSeconds}
                    onChange={(event) =>
                      updateLocal(provider.key, {
                        cooldownSeconds: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>

              <div className={styles.metrics}>
                <article>
                  <span>7/30d success</span>
                  <strong>{pct(metric?.successRate)}</strong>
                </article>
                <article>
                  <span>Ready p50</span>
                  <strong>{ms(metric?.medianReadyMs)}</strong>
                </article>
                <article>
                  <span>Runtime latency</span>
                  <strong>{ms(provider.lastLatencyMs)}</strong>
                </article>
                <article>
                  <span>Failures</span>
                  <strong>{provider.consecutiveFailures}</strong>
                </article>
              </div>

              <div className={styles.runtime}>
                <div>
                  <span>Last success</span>
                  <strong>{formatDate(provider.lastSuccessAt)}</strong>
                </div>
                <div>
                  <span>Last failure</span>
                  <strong>{formatDate(provider.lastFailureAt)}</strong>
                </div>
                <div>
                  <span>Cooldown until</span>
                  <strong>{formatDate(provider.cooldownUntil)}</strong>
                </div>
                {provider.lastError && (
                  <div className={styles.errorLine}>
                    <span>Last error</span>
                    <strong>{provider.lastError}</strong>
                  </div>
                )}
              </div>

              <label className={styles.notes}>
                <span>Internal note</span>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={provider.notes || ''}
                  onChange={(event) =>
                    updateLocal(provider.key, {
                      notes: event.target.value,
                    })
                  }
                />
              </label>

              <div className={styles.actions}>
                <button type="submit" disabled={saving || resetting}>
                  {saving ? 'Сохраняем…' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  disabled={saving || resetting}
                  onClick={() =>
                    void mutate(
                      {
                        action: 'reset_health',
                        provider: provider.key,
                      },
                      provider.key + ':reset',
                    )
                  }
                >
                  {resetting ? 'Сбрасываем…' : 'Разрешить recheck'}
                </button>
              </div>
            </form>
          );
        })}
      </section>
    </div>
  );
}
