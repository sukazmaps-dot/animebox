import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { RecommendationAnalyticsDashboard, RecommendationAnalyticsRange } from '@/lib/recommendation-analytics';

const EVENTS = [
  'recommendation_impression',
  'recommendation_dwell',
  'recommendation_click',
  'recommendation_planned',
  'recommendation_dismiss',
  'recommendation_started',
  'recommendation_completed',
] as const;

const PAGE_SIZE = 1000;
const MAX_EVENTS = 25000;

type Row = {
  event_name: string;
  session_id: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

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

function eventSource(row: Row) {
  const source = row.source?.trim() || 'smart_feed';
  return source.slice(0, 64);
}

async function loadRows(rangeDays: RecommendationAnalyticsRange) {
  const admin = createSupabaseAdmin();
  const since = new Date(Date.now() - rangeDays * 86400000).toISOString();
  const rows: Row[] = [];

  for (let offset = 0; offset < MAX_EVENTS; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from('product_events')
      .select('event_name,session_id,source,metadata,created_at')
      .in('event_name', [...EVENTS])
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return { rows, truncated: rows.length >= MAX_EVENTS };
}

export async function getRecommendationAnalytics(days: number): Promise<RecommendationAnalyticsDashboard> {
  const rangeDays: RecommendationAnalyticsRange = days === 30 ? 30 : 7;
  const { rows, truncated } = await loadRows(rangeDays);

  const counts = new Map<string, number>();
  const dwell: number[] = [];
  const sources = new Map<string, { source: string; impressions: number; clicks: number; started: number; completed: number }>();
  const daily = new Map<string, { date: string; impressions: number; clicks: number; started: number; completed: number; dismissed: number }>();

  const bump = (name: string) => counts.set(name, (counts.get(name) ?? 0) + 1);
  for (const row of rows) {
    bump(row.event_name);
    const sourceKey = eventSource(row);
    const source = sources.get(sourceKey) ?? { source: sourceKey, impressions: 0, clicks: 0, started: 0, completed: 0 };
    if (row.event_name === 'recommendation_impression') source.impressions += 1;
    if (row.event_name === 'recommendation_click') source.clicks += 1;
    if (row.event_name === 'recommendation_started') source.started += 1;
    if (row.event_name === 'recommendation_completed') source.completed += 1;
    sources.set(sourceKey, source);

    const date = row.created_at.slice(0, 10);
    const day = daily.get(date) ?? { date, impressions: 0, clicks: 0, started: 0, completed: 0, dismissed: 0 };
    if (row.event_name === 'recommendation_impression') day.impressions += 1;
    if (row.event_name === 'recommendation_click') day.clicks += 1;
    if (row.event_name === 'recommendation_started') day.started += 1;
    if (row.event_name === 'recommendation_completed') day.completed += 1;
    if (row.event_name === 'recommendation_dismiss') day.dismissed += 1;
    daily.set(date, day);

    if (row.event_name === 'recommendation_dwell') {
      const raw = row.metadata?.dwell_ms;
      const ms = Number(raw);
      if (Number.isFinite(ms) && ms >= 0 && ms <= 120000) dwell.push(ms);
    }
  }

  const impressions = counts.get('recommendation_impression') ?? 0;
  const clicks = counts.get('recommendation_click') ?? 0;
  const planned = counts.get('recommendation_planned') ?? 0;
  const dismissed = counts.get('recommendation_dismiss') ?? 0;
  const started = counts.get('recommendation_started') ?? 0;
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
      dismissed,
      dismissRatePct: pct(dismissed, impressions),
      started,
      clickToPlayPct: pct(started, clicks),
      completed,
      startedToCompletedPct: pct(completed, started),
      dwellP50Ms: median(dwell),
    },
    sources: [...sources.values()]
      .map((source) => ({ ...source, ctrPct: pct(source.clicks, source.impressions) }))
      .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks),
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
