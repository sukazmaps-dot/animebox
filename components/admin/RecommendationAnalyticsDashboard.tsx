'use client';

import { useEffect, useMemo, useState } from 'react';
import type { RecommendationAnalyticsDashboard as Dashboard, RecommendationAnalyticsRange } from '@/lib/recommendation-analytics';
import styles from './RecommendationAnalyticsDashboard.module.css';

type ApiResponse = { ok?: boolean; dashboard?: Dashboard; error?: string };
const num = (value: number) => value.toLocaleString('ru-RU');
const pct = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;

export default function RecommendationAnalyticsDashboard() {
  const [range, setRange] = useState<RecommendationAnalyticsRange>(7);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/admin/recommendations?days=${range}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as ApiResponse;
        if (!response.ok || !payload.ok || !payload.dashboard) throw new Error('Не удалось загрузить Recommendation Analytics.');
        setDashboard(payload.dashboard);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Analytics unavailable');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [range]);

  const maxDaily = useMemo(() => Math.max(1, ...(dashboard?.daily.map((day) => day.impressions) ?? [1])), [dashboard]);
  const k = dashboard?.kpis;

  return (
    <section className={styles.dashboard} aria-label="AnimeBox Recommendation Analytics">
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>TASTE GRAPH · V5</span><h1>Recommendations</h1><p>От показа карточки до реального старта и завершения серии.</p></div>
        <div className={styles.range}>{([7, 30] as const).map((days) => <button key={days} type="button" className={days === range ? styles.active : ''} onClick={() => { if (days === range) return; setLoading(true); setError(''); setRange(days); }}>{days}d</button>)}</div>
      </header>
      {error && <div className={styles.error}>{error}</div>}
      {loading && !dashboard && <div className={styles.loading}>Собираем recommendation funnel…</div>}
      {dashboard && k && <>
        <div className={styles.kpis}>
          <article><span>Impressions</span><strong>{num(k.impressions)}</strong><small>{dashboard.rangeDays} дней</small></article>
          <article><span>CTR</span><strong>{pct(k.ctrPct)}</strong><small>{num(k.clicks)} кликов</small></article>
          <article><span>Click → Play</span><strong>{pct(k.clickToPlayPct)}</strong><small>{num(k.started)} запусков</small></article>
          <article><span>Play → 15m</span><strong>{pct(k.startedTo15mPct)}</strong><small>{num(k.watch15m)} глубоких просмотров</small></article>
          <article><span>15m → 30m</span><strong>{pct(k.watch15To30Pct)}</strong><small>{num(k.watch30m)} дошли до 30 минут</small></article>
          <article><span>Play → Completed</span><strong>{pct(k.startedToCompletedPct)}</strong><small>{num(k.completed)} завершений серий</small></article>
          <article><span>Dismiss rate</span><strong>{pct(k.dismissRatePct)}</strong><small>{num(k.dismissed)} не интересно</small></article>
          <article><span>Positive feedback</span><strong>{num(k.liked)}</strong><small>{num(k.planned)} добавлено в планы</small></article>
          <article><span>Already watched</span><strong>{num(k.alreadyWatched)}</strong><small>очищает будущую выдачу</small></article>
          <article><span>Dwell p50</span><strong>{k.dwellP50Ms == null ? '—' : `${(k.dwellP50Ms / 1000).toFixed(1)}s`}</strong><small>внимание на карточке</small></article>
          <article><span>Events</span><strong>{num(dashboard.sampledEvents)}</strong><small>{dashboard.truncated ? 'выборка ограничена' : 'полная выборка'}</small></article>
        </div>
        <section className={styles.panel}>
          <div className={styles.panelHead}><div><span>SOURCES</span><h2>Качество каналов рекомендаций</h2></div></div>
          <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Source</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Play</th><th>15m</th><th>30m</th><th>Completed</th></tr></thead><tbody>{dashboard.sources.map((source) => <tr key={source.source}><td>{source.source}</td><td>{num(source.impressions)}</td><td>{num(source.clicks)}</td><td>{pct(source.ctrPct)}</td><td>{num(source.started)}</td><td>{num(source.watch15m)}</td><td>{num(source.watch30m)}</td><td>{num(source.completed)}</td></tr>)}</tbody></table></div>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHead}><div><span>TREND</span><h2>Recommendation impressions</h2></div></div>
          <div className={styles.bars}>{dashboard.daily.map((day) => <div className={styles.day} key={day.date}><span>{day.date.slice(5)}</span><div className={styles.track}><i style={{ width: `${Math.max(2, day.impressions / maxDaily * 100)}%` }} /></div><small>{num(day.impressions)} · {num(day.clicks)} clicks</small></div>)}</div>
        </section>
      </>}
    </section>
  );
}
