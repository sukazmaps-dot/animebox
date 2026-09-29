import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  RecommendationAnalyticsDashboard,
  RecommendationAnalyticsRange,
} from '@/lib/recommendation-analytics';
import {
  aggregateRecommendationAnalyticsRows,
  type RecommendationAnalyticsEventRow,
} from '@/lib/recommendation-analytics-core';

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
  'recommendation_multi_episode',
  'recommendation_completed',
  'recommendation_rail_end_reached',
  'recommendation_rail_load_result',
  'recommendation_rail_load_error',
] as const;

const PAGE_SIZE = 1000;
const MAX_EVENTS = 30_000;
const EXTENDED_SELECT =
  'event_name,user_id,anonymous_id,session_id,source,entity_id,recommendation_id,recommendation_session_id,algorithm_version,metadata,created_at';
const LEGACY_SELECT =
  'event_name,user_id,session_id,source,entity_id,metadata,created_at';

async function loadRows(rangeDays: RecommendationAnalyticsRange) {
  const admin = createSupabaseAdmin();
  const since = new Date(
    Date.now() - rangeDays * 86_400_000,
  ).toISOString();
  const rows: RecommendationAnalyticsEventRow[] = [];
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
      /anonymous_id|recommendation_id|recommendation_session_id|algorithm_version|schema cache/i.test(
        result.error.message,
      )
    ) {
      legacyColumns = true;
      result = await fetchPage(LEGACY_SELECT);
    }

    if (result.error) throw result.error;

    const page =
      (result.data ?? []) as unknown as RecommendationAnalyticsEventRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return {
    rows,
    truncated: rows.length >= MAX_EVENTS,
  };
}

export async function getRecommendationAnalytics(
  days: number,
): Promise<RecommendationAnalyticsDashboard> {
  const rangeDays: RecommendationAnalyticsRange =
    days === 30 ? 30 : 7;
  const { rows, truncated } = await loadRows(rangeDays);

  return aggregateRecommendationAnalyticsRows(
    rows,
    rangeDays,
    truncated,
  );
}
