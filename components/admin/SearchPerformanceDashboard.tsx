'use client';

import { useCallback, useEffect, useState } from 'react';

import type { SearchPerformanceSnapshot } from '@/lib/search-performance';

import styles from './SearchPerformanceDashboard.module.css';

type ApiResponse = {
  ok?: boolean;
  health?: SearchPerformanceSnapshot;
  error?: string;
};

function ms(value: number | null) {
  if (value == null) return '—';
  if (value < 1_000) return `${Math.round(value)} ms`;
  return `${(value / 1_000).toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
  })} s`;
}

function percent(value: number | null) {
  return value == null ? '—' : `${value.toLocaleString('ru-RU')}%`;
}

function number(value: number | null) {
  return value == null ? '—' : value.toLocaleString('ru-RU');
}

function time(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('ru-RU')
    : '—';
}

export default function SearchPerformanceDashboard() {
  const [snapshot, setSnapshot] =
    useState<SearchPerformanceSnapshot | null>(null);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `/api/admin/search-performance?hours=${hours}`,
        {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        },
      );
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok || !payload.health) {
        throw new Error('Не удалось загрузить метрики поиска.');
      }

      setSnapshot(payload.health);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Не удалось загрузить метрики поиска.',
      );
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    void load();
  }, [load]);

  const repairIndex = useCallback(async () => {
    if (repairing) return;

    setRepairing(true);
    setError('');
    setNotice('');

    try {
      const response = await fetch(
        '/api/admin/search-performance/repair',
        {
          method: 'POST',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        result?: {
          processed?: number;
          after?: {
            coveragePct?: number | null;
            richCoveragePct?: number | null;
          };
        };
      };

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error === 'search_index_migration_required'
            ? 'Сначала примени SQL-миграцию Patch 24.4.'
            : 'Не удалось восстановить search index.',
        );
      }

      setNotice(
        `Обработано документов: ${Number(
          payload.result?.processed ?? 0,
        ).toLocaleString('ru-RU')}. Индекс обновлён.`,
      );
      await load();
    } catch (repairError) {
      setError(
        repairError instanceof Error
          ? repairError.message
          : 'Не удалось восстановить search index.',
      );
    } finally {
      setRepairing(false);
    }
  }, [load, repairing]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>SEARCH · PATCH 24.4</span>
          <h1>Search Performance</h1>
          <p>
            Реальная скорость поиска глазами пользователя: первый полезный
            результат, полное обогащение, подсказки и покрытие локального
            search index.
          </p>
        </div>

        <div className={styles.actions}>
          <select
            value={hours}
            onChange={(event) => setHours(Number(event.target.value))}
            aria-label="Период метрик"
          >
            <option value={6}>6 часов</option>
            <option value={24}>24 часа</option>
            <option value={72}>3 дня</option>
            <option value={168}>7 дней</option>
          </select>
          <button
            type="button"
            onClick={() => void repairIndex()}
            disabled={repairing || loading}
          >
            {repairing ? 'Восстанавливаем…' : 'Починить индекс'}
          </button>
          <button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? 'Обновляем…' : 'Обновить'}
          </button>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}
      {snapshot && !snapshot.index.migrationReady && (
        <div className={styles.warning}>
          Rich Search v3 ещё не активирован в Supabase. Примени миграцию
          Patch 24.4 — до этого приложение безопасно использует v2 fallback.
        </div>
      )}
      {loading && !snapshot && (
        <div className={styles.loading}>Собираем latency-метрики…</div>
      )}

      {snapshot && (
        <>
          <section className={styles.status} data-tone={snapshot.status}>
            <div>
              <i aria-hidden="true" />
              <div>
                <small>SEARCH HEALTH</small>
                <strong>
                  {snapshot.status === 'healthy'
                    ? 'Поиск работает быстро'
                    : snapshot.status === 'warning'
                      ? 'Есть запас для ускорения'
                      : 'Поиск заметно деградировал'}
                </strong>
              </div>
            </div>
            <span>
              {snapshot.firstResult.samples} first-result samples · последние
              {' '}{snapshot.periodHours} ч
            </span>
          </section>

          <section className={styles.kpis}>
            <article>
              <span>First result p50</span>
              <strong>{ms(snapshot.firstResult.p50Ms)}</strong>
              <small>медиана до первых карточек</small>
            </article>
            <article>
              <span>First result p95</span>
              <strong>{ms(snapshot.firstResult.p95Ms)}</strong>
              <small>медленные 5% поисков</small>
            </article>
            <article>
              <span>Instant API p95</span>
              <strong>{ms(snapshot.instantServer.p95Ms)}</strong>
              <small>server-side local index</small>
            </article>
            <article>
              <span>Instant delivery p95</span>
              <strong>{ms(snapshot.instantDelivery.p95Ms)}</strong>
              <small>API + сеть до клиента</small>
            </article>
            <article>
              <span>Suggestions p95</span>
              <strong>{ms(snapshot.suggestions.p95Ms)}</strong>
              <small>включая debounce</small>
            </article>
            <article>
              <span>Full enrichment p95</span>
              <strong>{ms(snapshot.enrichment.p95Ms)}</strong>
              <small>полный provider result</small>
            </article>
            <article>
              <span>Rich instant cards</span>
              <strong>{percent(snapshot.instantRichCards.averageSharePct)}</strong>
              <small>{snapshot.instantRichCards.samples} измерений</small>
            </article>
            <article>
              <span>Rich index coverage</span>
              <strong>{percent(snapshot.index.richCoveragePct)}</strong>
              <small>полные локальные карточки</small>
            </article>
          </section>

          <section className={styles.grid}>
            <article className={styles.card}>
              <div>
                <span>ПЕРВЫЙ РЕЗУЛЬТАТ</span>
                <h2>Кто выигрывает гонку</h2>
              </div>
              <dl>
                <div>
                  <dt>Instant local</dt>
                  <dd>{number(snapshot.firstResultSources.instant)}</dd>
                </div>
                <div>
                  <dt>Authoritative</dt>
                  <dd>{number(snapshot.firstResultSources.authoritative)}</dd>
                </div>
                <div>
                  <dt>Smart Discovery</dt>
                  <dd>{number(snapshot.firstResultSources.discovery)}</dd>
                </div>
                <div>
                  <dt>Instant share</dt>
                  <dd>{percent(snapshot.firstResultSources.instantSharePct)}</dd>
                </div>
              </dl>
            </article>

            <article className={styles.card}>
              <div>
                <span>LOCAL CACHE</span>
                <h2>Повторные запросы</h2>
              </div>
              <dl>
                <div>
                  <dt>Memory hits</dt>
                  <dd>{number(snapshot.instantCache.memory)}</dd>
                </div>
                <div>
                  <dt>Network</dt>
                  <dd>{number(snapshot.instantCache.network)}</dd>
                </div>
                <div>
                  <dt>Memory share</dt>
                  <dd>{percent(snapshot.instantCache.memorySharePct)}</dd>
                </div>
                <div>
                  <dt>Последний sample</dt>
                  <dd>{time(snapshot.latestSampleAt)}</dd>
                </div>
              </dl>
            </article>

            <article className={styles.card}>
              <div>
                <span>SEARCH INDEX</span>
                <h2>Покрытие каталога</h2>
              </div>
              <dl>
                <div>
                  <dt>Search documents</dt>
                  <dd>{number(snapshot.index.searchDocuments)}</dd>
                </div>
                <div>
                  <dt>Rich documents</dt>
                  <dd>{number(snapshot.index.richDocuments)}</dd>
                </div>
                <div>
                  <dt>Catalog documents</dt>
                  <dd>{number(snapshot.index.catalogDocuments)}</dd>
                </div>
                <div>
                  <dt>Coverage</dt>
                  <dd>{percent(snapshot.index.coveragePct)}</dd>
                </div>
                <div>
                  <dt>Rich coverage</dt>
                  <dd>{percent(snapshot.index.richCoveragePct)}</dd>
                </div>
                <div>
                  <dt>Последнее обновление</dt>
                  <dd>{time(snapshot.index.latestIndexedAt)}</dd>
                </div>
                <div>
                  <dt>Catalog sync</dt>
                  <dd>{time(snapshot.index.latestCatalogSyncAt)}</dd>
                </div>
              </dl>
            </article>
          </section>
        </>
      )}
    </main>
  );
}
