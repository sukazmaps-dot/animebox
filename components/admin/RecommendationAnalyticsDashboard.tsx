'use client';

import { useEffect, useMemo, useState } from 'react';

import type {
  RecommendationAnalyticsDashboard as Dashboard,
  RecommendationAnalyticsRange,
  RecommendationFunnelSlice,
} from '@/lib/recommendation-analytics';

import styles from './RecommendationAnalyticsDashboard.module.css';

type ApiResponse = {
  ok?: boolean;
  dashboard?: Dashboard;
  error?: string;
};

const num = (value: number) => value.toLocaleString('ru-RU');
const pct = (value: number) =>
  `${value.toLocaleString('ru-RU', {
    maximumFractionDigits: 1,
  })}%`;

function FunnelCells({ row }: { row: RecommendationFunnelSlice }) {
  return (
    <>
      <td>{num(row.impressions)}</td>
      <td>{pct(row.ctrPct)}</td>
      <td>{num(row.started)}</td>
      <td>{pct(row.clickToPlayPct)}</td>
      <td>{pct(row.startedTo15mPct)}</td>
      <td>{pct(row.startedTo30mPct)}</td>
      <td>{pct(row.startedToMultiEpisodePct)}</td>
      <td>{pct(row.startedToCompletedPct)}</td>
    </>
  );
}

function FunnelHead() {
  return (
    <>
      <th>Impr.</th>
      <th>CTR</th>
      <th>Play</th>
      <th>Click→Play</th>
      <th>Play→15m</th>
      <th>Play→30m</th>
      <th>Multi-ep</th>
      <th>Completed</th>
    </>
  );
}

export default function RecommendationAnalyticsDashboard() {
  const [range, setRange] =
    useState<RecommendationAnalyticsRange>(7);
  const [dashboard, setDashboard] = useState<Dashboard | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    void fetch(
      `/api/admin/recommendations?days=${range}`,
      {
        cache: 'no-store',
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const payload = (await response.json()) as ApiResponse;
        if (!response.ok || !payload.ok || !payload.dashboard) {
          throw new Error(
            'Не удалось загрузить Recommendation Analytics.',
          );
        }
        setDashboard(payload.dashboard);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Analytics unavailable',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [range]);

  const maxDaily = useMemo(
    () =>
      Math.max(
        1,
        ...(dashboard?.daily.map((day) => day.impressions) ?? [1]),
      ),
    [dashboard],
  );
  const k = dashboard?.kpis;

  return (
    <section
      className={styles.dashboard}
      aria-label="AnimeBox Recommendation Analytics"
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            INTELLIGENCE CORE · PATCH 22
          </span>
          <h1>Recommendation Analytics 3.0</h1>
          <p>
            Exposure-level funnel: от реального показа карточки до
            второго эпизода и завершения.
          </p>
        </div>

        <div className={styles.range}>
          {([7, 30] as const).map((days) => (
            <button
              key={days}
              type="button"
              className={days === range ? styles.active : ''}
              onClick={() => {
                if (days === range) return;
                setLoading(true);
                setError('');
                setRange(days);
              }}
            >
              {days}d
            </button>
          ))}
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {loading && !dashboard && (
        <div className={styles.loading}>
          Собираем recommendation funnel…
        </div>
      )}

      {dashboard && k && (
        <>
          {dashboard.truncated && (
            <div className={styles.warning}>
              Достигнут лимит выборки событий. Funnel остаётся
              exposure-level, но старейшая часть периода может быть
              неполной.
            </div>
          )}

          <div className={styles.kpis}>
            <article>
              <span>Unique impressions</span>
              <strong>{num(k.impressions)}</strong>
              <small>
                {num(dashboard.attributedExposures)} exposure IDs
              </small>
            </article>
            <article>
              <span>Impression → Click</span>
              <strong>{pct(k.ctrPct)}</strong>
              <small>{num(k.clicks)} кликов</small>
            </article>
            <article>
              <span>Click → Play</span>
              <strong>{pct(k.clickToPlayPct)}</strong>
              <small>{num(k.started)} запусков</small>
            </article>
            <article>
              <span>Play → 15m</span>
              <strong>{pct(k.startedTo15mPct)}</strong>
              <small>{num(k.watch15m)} просмотров</small>
            </article>
            <article>
              <span>Play → 30m</span>
              <strong>{pct(k.watch15To30Pct)}</strong>
              <small>{num(k.watch30m)} дошли до 30 минут</small>
            </article>
            <article>
              <span>Multi-episode</span>
              <strong>{pct(k.startedToMultiEpisodePct)}</strong>
              <small>
                {num(k.multiEpisode)} продолжили второй эпизод
              </small>
            </article>
            <article>
              <span>Play → Completed</span>
              <strong>{pct(k.startedToCompletedPct)}</strong>
              <small>{num(k.completed)} завершений эпизода</small>
            </article>
            <article>
              <span>Repeat exposure</span>
              <strong>{pct(k.repeatedImpressionRatePct)}</strong>
              <small>
                {num(k.repeatedImpressions)} повторных показов
              </small>
            </article>
            <article>
              <span>Dismiss rate</span>
              <strong>{pct(k.dismissRatePct)}</strong>
              <small>{num(k.dismissed)} отрицательных сигналов</small>
            </article>
            <article>
              <span>Hidden Gem → Play</span>
              <strong>{pct(k.hiddenGemStartRatePct)}</strong>
              <small>
                {num(k.hiddenGemStarted)} / {num(k.hiddenGemImpressions)}
              </small>
            </article>
            <article>
              <span>Explore → Play</span>
              <strong>{pct(k.explorationStartRatePct)}</strong>
              <small>
                {num(k.explorationStarted)} /{' '}
                {num(k.explorationImpressions)}
              </small>
            </article>
            <article>
              <span>Dwell p50</span>
              <strong>
                {k.dwellP50Ms == null
                  ? '—'
                  : `${(k.dwellP50Ms / 1000).toFixed(1)}s`}
              </strong>
              <small>максимальный dwell на exposure</small>
            </article>
          </div>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span>ATTRIBUTION</span>
                <h2>Качество recommendation data</h2>
              </div>
              <small className={styles.panelMeta}>
                {num(dashboard.sampledEvents)} событий ·{' '}
                {dashboard.funnelMode}
              </small>
            </div>

            <div className={styles.attributionGrid}>
              <article>
                <span>Full core context</span>
                <strong>
                  {pct(dashboard.attribution.fullyAttributedPct)}
                </strong>
                <small>ID + session + version + row + position</small>
              </article>
              <article>
                <span>Recommendation ID</span>
                <strong>
                  {pct(dashboard.attribution.recommendationIdPct)}
                </strong>
                <small>ключ exposure-level funnel</small>
              </article>
              <article>
                <span>Explanation</span>
                <strong>
                  {pct(dashboard.attribution.explanationPct)}
                </strong>
                <small>Phase I evidence family</small>
              </article>
              <article>
                <span>Diversity</span>
                <strong>
                  {pct(dashboard.attribution.diversityPct)}
                </strong>
                <small>Phase J movement context</small>
              </article>
              <article>
                <span>Taste confidence</span>
                <strong>
                  {pct(dashboard.attribution.tasteConfidencePct)}
                </strong>
                <small>cold → high confidence</small>
              </article>
              <article>
                <span>Match score</span>
                <strong>
                  {pct(dashboard.attribution.matchScorePct)}
                </strong>
                <small>калибровка displayed match</small>
              </article>
              <article>
                <span>Completion score</span>
                <strong>
                  {pct(dashboard.attribution.completionScorePct)}
                </strong>
                <small>калибровка outcome objective</small>
              </article>
              <article>
                <span>Exploration class</span>
                <strong>
                  {pct(dashboard.attribution.explorationClassPct)}
                </strong>
                <small>safe / adjacent / explore</small>
              </article>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span>VERSIONS</span>
                <h2>Алгоритм → реальная глубина просмотра</h2>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Version</th>
                    <FunnelHead />
                  </tr>
                </thead>
                <tbody>
                  {dashboard.versions.map((version) => (
                    <tr key={version.algorithmVersion}>
                      <td>{version.algorithmVersion}</td>
                      <FunnelCells row={version} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span>CALIBRATION</span>
                <h2>Match Score vs реальные outcomes</h2>
              </div>
              <small className={styles.panelMeta}>
                score не считается вероятностью
              </small>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Match bucket</th>
                    <FunnelHead />
                  </tr>
                </thead>
                <tbody>
                  {dashboard.matchScoreCalibration.map((row) => (
                    <tr key={row.bucket}>
                      <td>{row.bucket}</td>
                      <FunnelCells row={row} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span>COMPLETION OBJECTIVE</span>
                <h2>Completion Score calibration</h2>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Score bucket</th>
                    <FunnelHead />
                  </tr>
                </thead>
                <tbody>
                  {dashboard.completionScoreCalibration.map((row) => (
                    <tr key={row.bucket}>
                      <td>{row.bucket}</td>
                      <FunnelCells row={row} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className={styles.twoColumn}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span>FATIGUE</span>
                  <h2>Повторные показы и усталость</h2>
                </div>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Bucket</th>
                      <th>Impr.</th>
                      <th>CTR</th>
                      <th>Play</th>
                      <th>15m</th>
                      <th>Dismiss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.fatigue.map((row) => (
                      <tr key={row.bucket}>
                        <td>{row.bucket}</td>
                        <td>{num(row.impressions)}</td>
                        <td>{pct(row.ctrPct)}</td>
                        <td>{pct(row.clickToPlayPct)}</td>
                        <td>{pct(row.startedTo15mPct)}</td>
                        <td>{pct(row.dismissRatePct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span>TASTE CONFIDENCE</span>
                  <h2>Cold start → зрелый Taste Graph</h2>
                </div>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Bucket</th>
                      <th>Impr.</th>
                      <th>CTR</th>
                      <th>Play</th>
                      <th>15m</th>
                      <th>Multi-ep</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.tasteConfidence.map((row) => (
                      <tr key={row.bucket}>
                        <td>{row.bucket}</td>
                        <td>{num(row.impressions)}</td>
                        <td>{pct(row.ctrPct)}</td>
                        <td>{pct(row.clickToPlayPct)}</td>
                        <td>{pct(row.startedTo15mPct)}</td>
                        <td>{pct(row.startedToMultiEpisodePct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span>CONTROLLED EXPLORATION</span>
                <h2>Safe / Adjacent / Explore</h2>
              </div>
            </div>

            <div className={styles.segmentGrid}>
              {dashboard.exploration.map((row) => (
                <article key={row.className}>
                  <span>{row.className}</span>
                  <strong>{pct(row.startedTo15mPct)}</strong>
                  <small>
                    CTR {pct(row.ctrPct)} · Play{' '}
                    {pct(row.clickToPlayPct)} · Multi{' '}
                    {pct(row.startedToMultiEpisodePct)}
                  </small>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span>EXPLAINABILITY</span>
                <h2>Какие причины реально конвертят</h2>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Explanation key</th>
                    <FunnelHead />
                  </tr>
                </thead>
                <tbody>
                  {dashboard.explanations.map((row) => (
                    <tr key={row.explanationKey}>
                      <td>{row.explanationKey}</td>
                      <FunnelCells row={row} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span>DIVERSITY</span>
                <h2>Цена и польза reranking</h2>
              </div>
              <small className={styles.panelMeta}>
                avg move {dashboard.diversity.avgAbsoluteMove}
              </small>
            </div>

            <div className={styles.segmentGrid}>
              <article>
                <span>Moved</span>
                <strong>{pct(dashboard.diversity.movedPct)}</strong>
                <small>
                  {num(dashboard.diversity.moved)} /{' '}
                  {num(dashboard.diversity.eligible)}
                </small>
              </article>
              <article>
                <span>Promoted</span>
                <strong>{num(dashboard.diversity.promoted)}</strong>
                <small>подняты diversity reranker</small>
              </article>
              <article>
                <span>Demoted</span>
                <strong>{num(dashboard.diversity.demoted)}</strong>
                <small>опущены из-за концентрации</small>
              </article>
              <article>
                <span>Relaxed</span>
                <strong>{pct(dashboard.diversity.relaxedPct)}</strong>
                <small>при дефиците кандидатов</small>
              </article>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Movement</th>
                    <FunnelHead />
                  </tr>
                </thead>
                <tbody>
                  {dashboard.diversity.slices.map((row) => (
                    <tr key={row.bucket}>
                      <td>{row.bucket}</td>
                      <FunnelCells row={row} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span>ROWS</span>
                <h2>Полки: conversion + runtime health</h2>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Impr.</th>
                    <th>CTR</th>
                    <th>Play</th>
                    <th>15m</th>
                    <th>Multi</th>
                    <th>Dismiss</th>
                    <th>Loads</th>
                    <th>Fill</th>
                    <th>DOM / Rail</th>
                    <th>Pages</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.rows.map((row) => (
                    <tr key={row.rowId}>
                      <td>{row.rowId}</td>
                      <td>{num(row.impressions)}</td>
                      <td>{pct(row.ctrPct)}</td>
                      <td>{pct(row.clickToPlayPct)}</td>
                      <td>{pct(row.startedTo15mPct)}</td>
                      <td>{pct(row.startedToMultiEpisodePct)}</td>
                      <td>{pct(row.dismissRatePct)}</td>
                      <td>{num(row.loadRequests)}</td>
                      <td>{pct(row.loadFillPct)}</td>
                      <td>
                        {num(row.maxRenderedItems)} /{' '}
                        {num(row.maxRailItems)}
                      </td>
                      <td>{num(row.pagesScanned)}</td>
                      <td>{num(row.loadErrors)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.positionStrip}>
              {dashboard.positions.map((position) => (
                <div key={position.bucket}>
                  <span>Позиции {position.bucket}</span>
                  <strong>{pct(position.ctrPct)}</strong>
                  <small>
                    Play {pct(position.clickToPlayPct)} · 15m{' '}
                    {pct(position.startedTo15mPct)}
                  </small>
                </div>
              ))}
            </div>
          </section>

          <div className={styles.twoColumn}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span>SOURCES</span>
                  <h2>Источник primary evidence</h2>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Impr.</th>
                      <th>CTR</th>
                      <th>Play</th>
                      <th>15m</th>
                      <th>Multi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.sources.map((row) => (
                      <tr key={row.source}>
                        <td>{row.source}</td>
                        <td>{num(row.impressions)}</td>
                        <td>{pct(row.ctrPct)}</td>
                        <td>{pct(row.clickToPlayPct)}</td>
                        <td>{pct(row.startedTo15mPct)}</td>
                        <td>{pct(row.startedToMultiEpisodePct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span>FEEDBACK</span>
                  <h2>Почему пользователи отклоняют</h2>
                </div>
              </div>
              <div className={styles.feedbackList}>
                {dashboard.feedbackReasons.map((row) => (
                  <div key={row.signal}>
                    <span>{row.signal}</span>
                    <strong>{num(row.count)}</strong>
                    <small>{pct(row.shareOfDismissalsPct)}</small>
                  </div>
                ))}
                {dashboard.feedbackReasons.length === 0 && (
                  <p className={styles.empty}>Пока нет feedback-сигналов.</p>
                )}
              </div>
            </section>
          </div>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span>TREND</span>
                <h2>Recommendation exposure cohort</h2>
              </div>
            </div>

            <div className={styles.bars}>
              {dashboard.daily.map((day) => (
                <div className={styles.day} key={day.date}>
                  <span>{day.date.slice(5)}</span>
                  <div className={styles.track}>
                    <i
                      style={{
                        width: `${Math.max(
                          2,
                          (day.impressions / maxDaily) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                  <small>
                    {num(day.impressions)} · {num(day.clicks)} clicks ·{' '}
                    {num(day.multiEpisode)} multi
                  </small>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
