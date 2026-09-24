import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  RecommendationAnalyticsDashboard,
  RecommendationAnalyticsRange,
} from '@/lib/recommendation-analytics';

const EVENTS = [
  'recommendation_impression',
  'recommendation_dwell',
  'recommendation_click',
  'recommendation_planned',
  'recommendation_like',
  'recommendation_dismiss',
  'recommendation_already_watched',
  'recommendation_started',
  'recommendation_watch_15m',
  'recommendation_watch_30m',
  'recommendation_completed',
] as const;

const PAGE_SIZE = 1000;
const MAX_EVENTS = 25000;
const EXTENDED_SELECT =
  'event_name,session_id,source,recommendation_id,recommendation_session_id,algorithm_version,metadata,created_at';
const LEGACY_SELECT =
  'event_name,session_id,source,metadata,created_at';

type Row = {
  event_name: string;
  session_id: string | null;
  source: string | null;
  recommendation_id?: string | null;
  recommendation_session_id?: string | null;
  algorithm_version?: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type FunnelCounts = {
  impressions: number;
  clicks: number;
  started: number;
  watch15m: number;
  watch30m: number;
  completed: number;
};

function emptyFunnel(): FunnelCounts {
  return {
    impressions: 0,
    clicks: 0,
    started: 0,
    watch15m: 0,
    watch30m: 0,
    completed: 0,
  };
}

function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 10000) / 100 : 0;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function metadataText(row: Row, key: string, fallbackKey?: string) {
  const primary = row.metadata?.[key];
  if (typeof primary === 'string' && primary.trim()) {
    return primary.trim().slice(0, 120);
  }

  if (fallbackKey) {
    const fallback = row.metadata?.[fallbackKey];
    if (typeof fallback === 'string' && fallback.trim()) {
      return fallback.trim().slice(0, 120);
    }
  }

  return null;
}

function metadataPosition(row: Row) {
  const value = Number(row.metadata?.position);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function recommendationId(row: Row) {
  return row.recommendation_id?.trim() || metadataText(row, 'recommendation_id');
}

function recommendationSessionId(row: Row) {
  return (
    row.recommendation_session_id?.trim() ||
    metadataText(row, 'recommendation_session_id')
  );
}

function algorithmVersion(row: Row) {
  return (
    row.algorithm_version?.trim() ||
    metadataText(row, 'algorithm_version', 'model_version')
  );
}

function rowId(row: Row) {
  return metadataText(row, 'row_id');
}

function eventSource(row: Row) {
  const source = row.source?.trim() || 'smart_feed';
  return source.slice(0, 64);
}

function applyFunnelEvent(target: FunnelCounts, eventName: string) {
  if (eventName === 'recommendation_impression') target.impressions += 1;
  if (eventName === 'recommendation_click') target.clicks += 1;
  if (eventName === 'recommendation_started') target.started += 1;
  if (eventName === 'recommendation_watch_15m') target.watch15m += 1;
  if (eventName === 'recommendation_watch_30m') target.watch30m += 1;
  if (eventName === 'recommendation_completed') target.completed += 1;
}

function withRates<T extends FunnelCounts>(row: T) {
  return {
    ...row,
    ctrPct: pct(row.clicks, row.impressions),
  };
}

async function loadRows(rangeDays: RecommendationAnalyticsRange) {
  const admin = createSupabaseAdmin();
  const since = new Date(Date.now() - rangeDays * 86400000).toISOString();
  const rows: Row[] = [];
  let legacyColumns = false;

  for (let offset = 0; offset < MAX_EVENTS; offset += PAGE_SIZE) {
    const fetchPage = async (select: string) =>
      admin
        .from('product_events')
        .select(select)
        .in('event_name', [...EVENTS])
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

    let result = await fetchPage(
      legacyColumns ? LEGACY_SELECT : EXTENDED_SELECT,
    );

    if (
      result.error &&
      !legacyColumns &&
      /recommendation_id|recommendation_session_id|algorithm_version|schema cache/i.test(
        result.error.message,
      )
    ) {
      legacyColumns = true;
      result = await fetchPage(LEGACY_SELECT);
    }

    if (result.error) throw result.error;

    const page = (result.data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return { rows, truncated: rows.length >= MAX_EVENTS };
}

export async function getRecommendationAnalytics(
  days: number,
): Promise<RecommendationAnalyticsDashboard> {
  const rangeDays: RecommendationAnalyticsRange = days === 30 ? 30 : 7;
  const { rows, truncated } = await loadRows(rangeDays);

  const counts = new Map<string, number>();
  const dwell: number[] = [];
  const sources = new Map<string, FunnelCounts & { source: string }>();
  const versions = new Map<
    string,
    FunnelCounts & { algorithmVersion: string }
  >();
  const rowBreakdown = new Map<
    string,
    FunnelCounts & { rowId: string; dismissed: number }
  >();
  const positions = new Map<
    '1–3' | '4–7' | '8+' | 'unknown',
    { bucket: '1–3' | '4–7' | '8+' | 'unknown'; impressions: number; clicks: number }
  >();
  const daily = new Map<
    string,
    {
      date: string;
      impressions: number;
      clicks: number;
      started: number;
      watch15m: number;
      watch30m: number;
      completed: number;
      dismissed: number;
    }
  >();

  let recommendationIdEvents = 0;
  let recommendationSessionEvents = 0;
  let algorithmVersionEvents = 0;
  let rowIdEvents = 0;
  let positionEvents = 0;
  let fullyAttributedEvents = 0;

  const bump = (name: string) =>
    counts.set(name, (counts.get(name) ?? 0) + 1);

  for (const row of rows) {
    bump(row.event_name);

    const recId = recommendationId(row);
    const recSessionId = recommendationSessionId(row);
    const versionKey = algorithmVersion(row);
    const rowKey = rowId(row);
    const position = metadataPosition(row);

    if (recId) recommendationIdEvents += 1;
    if (recSessionId) recommendationSessionEvents += 1;
    if (versionKey) algorithmVersionEvents += 1;
    if (rowKey) rowIdEvents += 1;
    if (position) positionEvents += 1;
    if (recId && recSessionId && versionKey && rowKey && position) {
      fullyAttributedEvents += 1;
    }

    const sourceKey = eventSource(row);
    const source =
      sources.get(sourceKey) ?? { source: sourceKey, ...emptyFunnel() };
    applyFunnelEvent(source, row.event_name);
    sources.set(sourceKey, source);

    const safeVersion = (versionKey || 'unknown').slice(0, 80);
    const version =
      versions.get(safeVersion) ?? {
        algorithmVersion: safeVersion,
        ...emptyFunnel(),
      };
    applyFunnelEvent(version, row.event_name);
    versions.set(safeVersion, version);

    const safeRow = (rowKey || 'unknown').slice(0, 80);
    const rail =
      rowBreakdown.get(safeRow) ?? {
        rowId: safeRow,
        ...emptyFunnel(),
        dismissed: 0,
      };
    applyFunnelEvent(rail, row.event_name);
    if (row.event_name === 'recommendation_dismiss') rail.dismissed += 1;
    rowBreakdown.set(safeRow, rail);

    const positionBucket: '1–3' | '4–7' | '8+' | 'unknown' =
      position == null
        ? 'unknown'
        : position <= 3
          ? '1–3'
          : position <= 7
            ? '4–7'
            : '8+';
    const positionRow =
      positions.get(positionBucket) ?? {
        bucket: positionBucket,
        impressions: 0,
        clicks: 0,
      };
    if (row.event_name === 'recommendation_impression') {
      positionRow.impressions += 1;
    }
    if (row.event_name === 'recommendation_click') {
      positionRow.clicks += 1;
    }
    positions.set(positionBucket, positionRow);

    const date = row.created_at.slice(0, 10);
    const day = daily.get(date) ?? {
      date,
      impressions: 0,
      clicks: 0,
      started: 0,
      watch15m: 0,
      watch30m: 0,
      completed: 0,
      dismissed: 0,
    };
    if (row.event_name === 'recommendation_impression') day.impressions += 1;
    if (row.event_name === 'recommendation_click') day.clicks += 1;
    if (row.event_name === 'recommendation_started') day.started += 1;
    if (row.event_name === 'recommendation_watch_15m') day.watch15m += 1;
    if (row.event_name === 'recommendation_watch_30m') day.watch30m += 1;
    if (row.event_name === 'recommendation_completed') day.completed += 1;
    if (row.event_name === 'recommendation_dismiss') day.dismissed += 1;
    daily.set(date, day);

    if (row.event_name === 'recommendation_dwell') {
      const ms = Number(row.metadata?.dwell_ms);
      if (Number.isFinite(ms) && ms >= 0 && ms <= 120000) dwell.push(ms);
    }
  }

  const impressions = counts.get('recommendation_impression') ?? 0;
  const clicks = counts.get('recommendation_click') ?? 0;
  const planned = counts.get('recommendation_planned') ?? 0;
  const liked = counts.get('recommendation_like') ?? 0;
  const dismissed = counts.get('recommendation_dismiss') ?? 0;
  const alreadyWatched = counts.get('recommendation_already_watched') ?? 0;
  const started = counts.get('recommendation_started') ?? 0;
  const watch15m = counts.get('recommendation_watch_15m') ?? 0;
  const watch30m = counts.get('recommendation_watch_30m') ?? 0;
  const completed = counts.get('recommendation_completed') ?? 0;

  return {
    rangeDays,
    generatedAt: new Date().toISOString(),
    sampledEvents: rows.length,
    truncated,
    kpis: {
      impressions,
      clicks,
      ctrPct: pct(clicks, impressions),
      planned,
      liked,
      dismissed,
      alreadyWatched,
      dismissRatePct: pct(dismissed, impressions),
      started,
      clickToPlayPct: pct(started, clicks),
      watch15m,
      watch30m,
      clickTo15mPct: pct(watch15m, clicks),
      startedTo15mPct: pct(watch15m, started),
      watch15To30Pct: pct(watch30m, watch15m),
      completed,
      startedToCompletedPct: pct(completed, started),
      dwellP50Ms: median(dwell),
    },
    attribution: {
      recommendationEvents: rows.length,
      recommendationIdPct: pct(recommendationIdEvents, rows.length),
      recommendationSessionPct: pct(recommendationSessionEvents, rows.length),
      algorithmVersionPct: pct(algorithmVersionEvents, rows.length),
      rowIdPct: pct(rowIdEvents, rows.length),
      positionPct: pct(positionEvents, rows.length),
      fullyAttributedPct: pct(fullyAttributedEvents, rows.length),
    },
    versions: [...versions.values()]
      .map((version) => ({
        ...withRates(version),
        clickTo15mPct: pct(version.watch15m, version.clicks),
      }))
      .sort(
        (a, b) =>
          b.impressions - a.impressions ||
          b.clicks - a.clicks,
      ),
    rows: [...rowBreakdown.values()]
      .map((rail) => ({
        ...withRates(rail),
        dismissRatePct: pct(rail.dismissed, rail.impressions),
      }))
      .sort(
        (a, b) =>
          b.impressions - a.impressions ||
          b.clicks - a.clicks,
      ),
    positions: (['1–3', '4–7', '8+', 'unknown'] as const)
      .map((bucket) => positions.get(bucket))
      .filter(
        (
          row,
        ): row is {
          bucket: '1–3' | '4–7' | '8+' | 'unknown';
          impressions: number;
          clicks: number;
        } => Boolean(row),
      )
      .map((row) => ({
        ...row,
        ctrPct: pct(row.clicks, row.impressions),
      })),
    sources: [...sources.values()]
      .map((source) => withRates(source))
      .sort(
        (a, b) =>
          b.impressions - a.impressions ||
          b.clicks - a.clicks,
      ),
    daily: [...daily.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
  };
}
