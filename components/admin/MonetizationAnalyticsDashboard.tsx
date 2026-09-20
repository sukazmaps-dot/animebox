'use client';

import { useEffect, useMemo, useState } from 'react';

import type {
  MonetizationDashboard,
  MonetizationDashboardRange,
} from '@/lib/monetization-analytics';

import styles from './MonetizationAnalyticsDashboard.module.css';

type ApiResponse = {
  ok?: boolean;
  dashboard?: MonetizationDashboard;
  error?: string;
};

type SeriesKey =
  | 'premiumActivations'
  | 'premiumViews'
  | 'checkouts'
  | 'adRequests'
  | 'adFills'
  | 'adImpressions';

function number(value: unknown, maximumFractionDigits = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return numeric.toLocaleString('ru-RU', { maximumFractionDigits });
}

function moneyByCurrency(values: Record<string, number>) {
  const entries = Object.entries(values ?? {}).filter(([, value]) => Number(value) !== 0);
  if (!entries.length) return '0';
  return entries
    .map(([currency, value]) => `${number(value, 2)} ${currency}`)
    .join(' · ');
}

function paymentLabel(code: string) {
  if (code === 'premium_monthly') return 'Premium · месяц';
  if (code === 'premium_yearly') return 'Premium · год';
  if (code === 'sponsor_support') return 'Sponsor';
  if (code === 'donation_once') return 'Donate';
  return code;
}

function providerLabel(provider: string) {
  if (provider === 'telegram_stars') return 'Telegram Stars';
  if (provider === 'donatepay') return 'DonatePay';
  if (provider === 'boosty') return 'Boosty';
  return provider;
}

function pct(value: number | null) {
  return value == null ? '—' : `${number(value, 2)}%`;
}

function MiniLine({
  data,
  valueKey,
  label,
}: {
  data: MonetizationDashboard['timeSeries'];
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
        const y = 92 - (value / max) * 78;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [data, valueKey]);

  const total = data.reduce((sum, item) => sum + (Number(item[valueKey]) || 0), 0);
  const latestItem = data.length ? data[data.length - 1] : undefined;
  const latest = latestItem?.[valueKey] ?? 0;

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
      <div className={styles.chartAxis}>
        <span>{data[0]?.date ? new Date(`${data[0].date}T00:00:00`).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—'}</span>
        <span>{latestItem?.date ? new Date(`${latestItem.date}T00:00:00`).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—'}</span>
      </div>
    </article>
  );
}

function Breakdown({ dashboard }: { dashboard: MonetizationDashboard }) {
  const rows = [
    ['Telegram Stars', dashboard.sourceBreakdown.telegram_stars],
    ['Boosty · Telegram', dashboard.sourceBreakdown.boosty_telegram],
    ['Admin', dashboard.sourceBreakdown.admin],
    ['Other', dashboard.sourceBreakdown.other],
  ] as const;
  const max = Math.max(1, ...rows.map(([, value]) => Number(value) || 0));

  return (
    <div className={styles.breakdown}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.breakdownRow}>
          <div>
            <span>{label}</span>
            <strong>{number(value)}</strong>
          </div>
          <div className={styles.breakdownTrack}>
            <i style={{ width: `${Math.max(3, (Number(value) / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MonetizationAnalyticsDashboard() {
  const [range, setRange] = useState<MonetizationDashboardRange>(30);
  const [dashboard, setDashboard] = useState<MonetizationDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/admin/monetization/analytics?days=${range}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        const payload = (await response.json()) as ApiResponse;
        if (!response.ok || !payload.ok || !payload.dashboard) {
          throw new Error(
            payload.error === 'analytics_migration_required'
              ? 'Примени SQL Stage 4: supabase/monetization-analytics-v1.sql'
              : 'Не удалось загрузить Production Analytics.',
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

  return (
    <section className={styles.dashboard} aria-label="Production Monetization Analytics">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>STAGE 4 · PRODUCTION ANALYTICS</span>
          <h2>Revenue & Premium control room</h2>
          <p>Premium lifecycle, платёжная воронка, Boosty, DonatePay и рекламные fill/no-fill сигналы в одном срезе.</p>
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
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {loading && !dashboard && <div className={styles.loading}>Собираем агрегаты…</div>}

      {dashboard && kpis ? (
        <>
          <div className={styles.kpis}>
            <article><span>Active Premium</span><strong>{number(kpis.activePremium)}</strong><small>живые users сейчас</small></article>
            <article><span>New Premium · 7d</span><strong>{number(kpis.newPremium7d)}</strong><small>уникальные users</small></article>
            <article><span>New Premium · 30d</span><strong>{number(kpis.newPremium30d)}</strong><small>уникальные users</small></article>
            <article><span>Stars revenue · {range}d</span><strong>★ {number(kpis.starsRevenue, 2)}</strong><small>paid XTR</small></article>
            <article><span>Boosty verified</span><strong>{number(kpis.boostyVerifiedUsers)}</strong><small>active / grace</small></article>
            <article><span>DonatePay approved · {range}d</span><strong>{moneyByCurrency(kpis.donatePayRevenueByCurrency)}</strong><small>integrity = ok</small></article>
            <article><span>Sponsor revenue · {range}d</span><strong>★ {number(kpis.sponsorRevenueStars, 2)}</strong><small>Telegram sponsor_support</small></article>
            <article><span>Expirations / cancels</span><strong>{number(kpis.expirations)} / {number(kpis.cancellations)}</strong><small>{number(kpis.expiringNext7d)} истекают за 7d</small></article>
          </div>

          <div className={styles.charts}>
            <MiniLine data={dashboard.timeSeries} valueKey="premiumActivations" label="Premium activations" />
            <MiniLine data={dashboard.timeSeries} valueKey="premiumViews" label="Premium views" />
            <MiniLine data={dashboard.timeSeries} valueKey="adFills" label="Ad fills" />
            <MiniLine data={dashboard.timeSeries} valueKey="adImpressions" label="Viewable ad impressions" />
          </div>

          <div className={styles.columns}>
            <article className={styles.panel}>
              <div className={styles.panelHead}>
                <div><span>PREMIUM SOURCES</span><h3>Current active mix</h3></div>
                <small>по live subscriptions</small>
              </div>
              <Breakdown dashboard={dashboard} />
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHead}>
                <div><span>CONVERSION</span><h3>/premium → active</h3></div>
                <small>{range}d</small>
              </div>
              <div className={styles.funnel}>
                <div><span>Page view</span><strong>{number(dashboard.funnel.views)}</strong></div>
                <b>→</b>
                <div><span>Checkout</span><strong>{number(dashboard.funnel.checkoutStarted)}</strong><small>{pct(dashboard.funnel.viewToCheckoutPct)}</small></div>
                <b>→</b>
                <div><span>Paid</span><strong>{number(dashboard.funnel.paymentSuccess)}</strong></div>
                <b>→</b>
                <div><span>Activated</span><strong>{number(dashboard.funnel.activated)}</strong><small>{pct(dashboard.funnel.checkoutToActivatedPct)}</small></div>
              </div>
              <div className={styles.funnelFooter}>View → activated: <strong>{pct(dashboard.funnel.viewToActivatedPct)}</strong></div>
            </article>
          </div>

          <article className={styles.panel}>
            <div className={styles.panelHead}>
              <div><span>ADS</span><h3>Delivery health</h3></div>
              <small>AnimeBox slots only</small>
            </div>
            <div className={styles.adStats}>
              <div><span>Requested</span><strong>{number(dashboard.ads.requested)}</strong></div>
              <div><span>Filled</span><strong>{number(dashboard.ads.filled)}</strong><small>{pct(dashboard.ads.fillRatePct)} fill rate</small></div>
              <div><span>Impressions</span><strong>{number(dashboard.ads.impressions)}</strong><small>{pct(dashboard.ads.viewabilityPct)} viewability</small></div>
              <div><span>No-fill</span><strong>{number(dashboard.ads.noFill)}</strong><small>{pct(dashboard.ads.noFillRatePct)}</small></div>
              <div><span>CTR</span><strong>{pct(dashboard.ads.ctrPct)}</strong><small>{dashboard.ads.ctrScope === 'house_only' ? 'clicks / viewable house impressions' : 'provider CTR unavailable'}</small></div>
            </div>
            <p className={styles.note}>Impression засчитывается только когда минимум 50% рекламного блока находится в видимой области не менее 1 секунды. Premium скрывает только рекламные блоки AnimeBox. Реклама внутри стороннего iframe-плеера принадлежит провайдеру плеера и этой системой не управляется.</p>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHead}>
              <div><span>RECENT PAYMENTS</span><h3>Latest monetization activity</h3></div>
              <small>до 12 операций</small>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Дата</th><th>Пользователь</th><th>Источник</th><th>Продукт</th><th>Сумма</th><th>Статус</th></tr>
                </thead>
                <tbody>
                  {dashboard.recentPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{new Date(payment.paidAt || payment.createdAt).toLocaleString('ru-RU')}</td>
                      <td>{payment.username || payment.userId || 'без привязки'}</td>
                      <td>{providerLabel(payment.provider)}</td>
                      <td>{paymentLabel(payment.productCode)}</td>
                      <td>{number(payment.amount, 2)} {payment.currency}</td>
                      <td><span className={styles.status} data-status={payment.status}>{payment.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!dashboard.recentPayments.length && <p className={styles.empty}>Платежей пока нет.</p>}
            </div>
          </article>

          <div className={styles.updated}>Агрегаты кешируются на 60 секунд · обновлено {new Date(dashboard.generatedAt).toLocaleString('ru-RU')}</div>
        </>
      ) : null}
    </section>
  );
}
