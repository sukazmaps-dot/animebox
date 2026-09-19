'use client';

import { useEffect, useMemo, useState } from 'react';

import type {
  FunnelMetric,
  ProductAnalyticsDashboard,
  ProductAnalyticsRange,
  RetentionMetric,
} from '@/lib/product-analytics';

import styles from './ProductAnalyticsDashboard.module.css';

type ApiResponse = {
  ok?: boolean;
  dashboard?: ProductAnalyticsDashboard;
  error?: string;
};

type SeriesKey =
  | 'activeUsers'
  | 'registrations'
  | 'animeOpens'
  | 'playStarts'
  | 'episodesWatched'
  | 'trackerAdds'
  | 'comments'
  | 'chatMessages';

function number(value: unknown, digits = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return numeric.toLocaleString('ru-RU', { maximumFractionDigits: digits });
}

function pct(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${number(numeric, 1)}%` : '0%';
}

function MiniLine({
  data,
  valueKey,
  label,
}: {
  data: ProductAnalyticsDashboard['timeSeries'];
  valueKey: SeriesKey;
  label: string;
}) {
  const points = useMemo(() => {
    if (!data.length) return '';
    const values = data.map((item) => Math.max(0, Number(item[valueKey]) || 0));
    const max = Math.max(1, ...values);

    return values
      .map((value, index) => {
        const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 100;
        const y = 91 - (value / max) * 76;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [data, valueKey]);

  const total = data.reduce((sum, item) => sum + (Number(item[valueKey]) || 0), 0);
  const latest = data.at(-1)?.[valueKey] ?? 0;

  return (
    <article className={styles.chartCard}>
      <div className={styles.chartHead}>
        <div>
          <span>{label}</span>
          <strong>{number(total)}</strong>
        </div>
        <small>сегодня {number(latest)}</small>
      </div>
      <svg className={styles.sparkline} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={points} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className={styles.axis}>
        <span>{data[0]?.date ? new Date(`${data[0].date}T00:00:00Z`).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—'}</span>
        <span>{data.at(-1)?.date ? new Date(`${data.at(-1)?.date}T00:00:00Z`).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—'}</span>
      </div>
    </article>
  );
}

function FunnelCard({
  title,
  subtitle,
  metric,
}: {
  title: string;
  subtitle: string;
  metric: FunnelMetric;
}) {
  const width = Math.max(2, Math.min(100, Number(metric.conversionPct) || 0));

  return (
    <article className={styles.funnelCard}>
      <div className={styles.funnelTitle}>
        <div>
          <span>{subtitle}</span>
          <h3>{title}</h3>
        </div>
        <strong>{pct(metric.conversionPct)}</strong>
      </div>
      <div className={styles.funnelNumbers}>
        <span><b>{number(metric.entered)}</b> вошли</span>
        <span><b>{number(metric.converted)}</b> дошли</span>
      </div>
      <div className={styles.progress}><i style={{ width: `${width}%` }} /></div>
    </article>
  );
}

function RetentionCard({ label, metric }: { label: string; metric: RetentionMetric }) {
  return (
    <article className={styles.retentionCard}>
      <span>{label}</span>
      <strong>{pct(metric.retentionPct)}</strong>
      <small>{number(metric.returned)} вернулись · {number(metric.eligible)} созревших регистраций</small>
    </article>
  );
}

export default function ProductAnalyticsDashboard() {
  const [range, setRange] = useState<ProductAnalyticsRange>(30);
  const [dashboard, setDashboard] = useState<ProductAnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/admin/analytics?days=${range}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        const payload = (await response.json()) as ApiResponse;
        if (!response.ok || !payload.ok || !payload.dashboard) {
          throw new Error(
            payload.error === 'analytics_migration_required'
              ? 'Сначала примени supabase/product-analytics-v1.sql.'
              : 'Не удалось загрузить Product Analytics.',
          );
        }
        setDashboard(payload.dashboard);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Analytics unavailable');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [range]);

  const kpis = dashboard?.kpis;
  const premium = dashboard?.funnels.premium;

  return (
    <section className={styles.dashboard} aria-label="AnimeBox Product Analytics">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>PRODUCT ANALYTICS · V1</span>
          <h1>Поведение и retention AnimeBox</h1>
          <p>
            DAU / WAU / MAU, просмотры, трекер, чат, комментарии, регистрации и ключевые продуктовые воронки.
          </p>
          {dashboard?.dataSince && (
            <small className={styles.dataSince}>
              данные с {new Date(dashboard.dataSince).toLocaleString('ru-RU')}
            </small>
          )}
        </div>

        <div className={styles.range} aria-label="Период аналитики">
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
      {loading && !dashboard && <div className={styles.loading}>Собираем продуктовые агрегаты…</div>}

      {dashboard && kpis ? (
        <>
          <div className={styles.kpis}>
            <article><span>DAU</span><strong>{number(kpis.dau)}</strong><small>активные сегодня</small></article>
            <article><span>WAU</span><strong>{number(kpis.wau)}</strong><small>активные 7 дней</small></article>
            <article><span>MAU</span><strong>{number(kpis.mau)}</strong><small>активные 30 дней</small></article>
            <article><span>Active · {range}d</span><strong>{number(kpis.activeUsersRange)}</strong><small>авторизованные users</small></article>
            <article><span>Registrations · 7d</span><strong>{number(kpis.registrations7d)}</strong><small>завершённые профили</small></article>
            <article><span>Registrations · 30d</span><strong>{number(kpis.registrations30d)}</strong><small>завершённые профили</small></article>
            <article><span>Episodes watched · {range}d</span><strong>{number(kpis.episodesWatched)}</strong><small>server verified</small></article>
            <article><span>Tracker adds · {range}d</span><strong>{number(kpis.trackerAdds)}</strong><small>добавления в библиотеку</small></article>
            <article><span>Chat messages · {range}d</span><strong>{number(kpis.chatMessages)}</strong><small>{number(kpis.chatOpens)} открытий чата</small></article>
            <article><span>Comments · {range}d</span><strong>{number(kpis.comments)}</strong><small>созданные комментарии</small></article>
            <article><span>Anime opens · {range}d</span><strong>{number(kpis.animeOpens)}</strong><small>{number(kpis.playStarts)} стартов просмотра</small></article>
            <article><span>Anonymous sessions · {range}d</span><strong>{number(kpis.anonymousSessionsRange)}</strong><small>без user_id</small></article>
          </div>

          <div className={styles.retentionSection}>
            <div className={styles.sectionHead}>
              <div><span>RETENTION</span><h2>Возвращаются ли новые пользователи</h2></div>
              <small>возврат = любое продуктовое действие в целевой день</small>
            </div>
            <div className={styles.retentionGrid}>
              <RetentionCard label="D1 retention" metric={dashboard.retention.d1} />
              <RetentionCard label="D7 retention" metric={dashboard.retention.d7} />
              <RetentionCard label="D30 retention" metric={dashboard.retention.d30} />
            </div>
          </div>

          <div className={styles.funnels}>
            <FunnelCard title="Anime page → Play" subtitle="DISCOVERY → WATCH" metric={dashboard.funnels.animeToPlay} />
            <FunnelCard title="Play → Watched" subtitle="START → COMPLETION" metric={dashboard.funnels.playToWatched} />
            <FunnelCard title="Chat → Registration" subtitle="COMMUNITY → SIGNUP" metric={dashboard.funnels.chatToRegistration} />

            <article className={styles.funnelCard}>
              <div className={styles.funnelTitle}>
                <div><span>PREMIUM</span><h3>/premium → Active</h3></div>
                <strong>{pct(premium?.viewToActivatedPct ?? 0)}</strong>
              </div>
              <div className={styles.premiumSteps}>
                <span><b>{number(premium?.views)}</b> views</span>
                <span>→</span>
                <span><b>{number(premium?.checkoutStarted)}</b> checkout</span>
                <span>→</span>
                <span><b>{number(premium?.activated)}</b> active</span>
              </div>
              <div className={styles.funnelNumbers}>
                <span>view → checkout <b>{pct(premium?.viewToCheckoutPct ?? 0)}</b></span>
                <span>checkout → active <b>{pct(premium?.checkoutToActivatedPct ?? 0)}</b></span>
              </div>
            </article>
          </div>

          <div className={styles.charts}>
            <MiniLine data={dashboard.timeSeries} valueKey="activeUsers" label="Daily active users" />
            <MiniLine data={dashboard.timeSeries} valueKey="episodesWatched" label="Episodes watched" />
            <MiniLine data={dashboard.timeSeries} valueKey="chatMessages" label="Chat messages" />
            <MiniLine data={dashboard.timeSeries} valueKey="registrations" label="Registrations" />
          </div>

          <section className={styles.breakdownPanel}>
            <div className={styles.sectionHead}>
              <div><span>EVENT MIX</span><h2>Что пользователи делают чаще всего</h2></div>
              <small>{range} дней</small>
            </div>
            <div className={styles.breakdown}>
              {dashboard.eventBreakdown.map((item) => {
                const max = Math.max(1, ...dashboard.eventBreakdown.map((event) => event.count));
                return (
                  <div key={item.eventName} className={styles.breakdownRow}>
                    <span>{item.eventName}</span>
                    <div><i style={{ width: `${Math.max(2, (item.count / max) * 100)}%` }} /></div>
                    <strong>{number(item.count)}</strong>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
