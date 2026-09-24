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
        <div><span className={styles.eyebrow}>INTELLIGENCE CORE · 18.0</span><h1>Recommendations</h1><p>От показа карточки до реального старта и завершения серии.</p></div>
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
          <div className={styles.panelHead}><div><span>ATTRIBUTION</span><h2>Качество recommendation data</h2></div></div>
          <div className={styles.attributionGrid}>
            <article><span>Full context</span><strong>{pct(dashboard.attribution.fullyAttributedPct)}</strong><small>ID + session + version + row + position</small></article>
            <article><span>Recommendation ID</span><strong>{pct(dashboard.attribution.recommendationIdPct)}</strong><small>стабильная карточка / impression</small></article>
            <article><span>Session context</span><strong>{pct(dashboard.attribution.recommendationSessionPct)}</strong><small>recommendation session</small></article>
            <article><span>Algorithm version</span><strong>{pct(dashboard.attribution.algorithmVersionPct)}</strong><small>готово для сравнения ранкеров</small></article>
            <article><span>Row context</span><strong>{pct(dashboard.attribution.rowIdPct)}</strong><small>полка показа</small></article>
            <article><span>Position context</span><strong>{pct(dashboard.attribution.positionPct)}</strong><small>позиция карточки</small></article>
          </div>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHead}><div><span>VERSIONS</span><h2>Алгоритмы и глубина просмотра</h2></div></div>
          <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Version</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Play</th><th>15m</th><th>Click → 15m</th><th>Completed</th></tr></thead><tbody>{dashboard.versions.map((version) => <tr key={version.algorithmVersion}><td>{version.algorithmVersion}</td><td>{num(version.impressions)}</td><td>{num(version.clicks)}</td><td>{pct(version.ctrPct)}</td><td>{num(version.started)}</td><td>{num(version.watch15m)}</td><td>{pct(version.clickTo15mPct)}</td><td>{num(version.completed)}</td></tr>)}</tbody></table></div>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHead}><div><span>ROWS</span><h2>Эффективность и здоровье персональных полок</h2></div></div>
          <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Row</th><th>Impressions</th><th>CTR</th><th>Play</th><th>15m</th><th>Dismiss</th><th>End</th><th>Loads</th><th>Added</th><th>Fill</th><th>Errors</th></tr></thead><tbody>{dashboard.rows.map((row) => <tr key={row.rowId}><td>{row.rowId}</td><td>{num(row.impressions)}</td><td>{pct(row.ctrPct)}</td><td>{num(row.started)}</td><td>{num(row.watch15m)}</td><td>{pct(row.dismissRatePct)}</td><td>{num(row.endReached)}</td><td>{num(row.loadRequests)}</td><td>{num(row.loadAdded)}</td><td>{pct(row.loadFillPct)}</td><td>{num(row.loadErrors)}</td></tr>)}</tbody></table></div>
          <div className={styles.positionStrip}>{dashboard.positions.map((position) => <div key={position.bucket}><span>Позиции {position.bucket}</span><strong>{pct(position.ctrPct)}</strong><small>{num(position.clicks)} / {num(position.impressions)}</small></div>)}</div>
        </section>
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
