import 'server-only';

import { unstable_cache } from 'next/cache';

import type {
  ProductAnalyticsDashboard,
  ProductAnalyticsRange,
} from '@/lib/product-analytics';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

function normalizeRange(value: number): ProductAnalyticsRange {
  return value === 7 ? 7 : 30;
}

const PREMIUM_SURFACE_EVENTS = [
  'premium_scene_demo_view',
  'premium_scene_preset_selected',
  'premium_scene_saved',
  'premium_stats_view',
  'premium_year_review_view',
  'premium_showcase_saved',
  'premium_watch_party_theme_selected',
  'premium_reaction_used',
] as const;

const RETENTION_SURFACE_EVENTS = [
  'continue_watching_impression',
  'continue_watching_click',
  'continue_watching_started',
  'personal_home_view',
  'personal_schedule_impression',
  'personal_schedule_click',
  'notification_center_open',
  'notification_subscription_toggle',
] as const;

type SurfaceEventRow = {
  event_name: string;
  user_id: string | null;
};

function percent(numerator: number, denominator: number) {
  return denominator > 0
    ? Math.round((numerator / denominator) * 10_000) / 100
    : 0;
}

async function loadPremiumSurfaceRows(
  rangeDays: ProductAnalyticsRange,
): Promise<SurfaceEventRow[]> {
  const admin = createSupabaseAdmin();
  const since = new Date(
    Date.now() - rangeDays * 86_400_000,
  ).toISOString();
  const rows: SurfaceEventRow[] = [];
  const pageSize = 1000;
  const maxRows = 10_000;

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await admin
      .from('product_events')
      .select('event_name,user_id')
      .in('event_name', [...PREMIUM_SURFACE_EVENTS])
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as SurfaceEventRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

async function loadRetentionSurfaceRows(
  rangeDays: ProductAnalyticsRange,
): Promise<SurfaceEventRow[]> {
  const admin = createSupabaseAdmin();
  const since = new Date(
    Date.now() - rangeDays * 86_400_000,
  ).toISOString();
  const rows: SurfaceEventRow[] = [];
  const pageSize = 1000;
  const maxRows = 10_000;

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await admin
      .from('product_events')
      .select('event_name,user_id')
      .in('event_name', [...RETENTION_SURFACE_EVENTS])
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as SurfaceEventRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

function summarizePremiumSurfaces(rows: SurfaceEventRow[]) {
  const count = (name: string) =>
    rows.reduce(
      (sum, row) => sum + (row.event_name === name ? 1 : 0),
      0,
    );

  return {
    sampledEvents: rows.length,
    truncated: rows.length >= 10_000,
    uniqueUsers: new Set(
      rows
        .map((row) => row.user_id)
        .filter((userId): userId is string => Boolean(userId)),
    ).size,
    sceneDemoViews: count('premium_scene_demo_view'),
    scenePresetSelections: count('premium_scene_preset_selected'),
    sceneSaves: count('premium_scene_saved'),
    statsViews: count('premium_stats_view'),
    yearReviewViews: count('premium_year_review_view'),
    showcaseSaves: count('premium_showcase_saved'),
    roomThemeSelections: count('premium_watch_party_theme_selected'),
    premiumReactions: count('premium_reaction_used'),
  } satisfies ProductAnalyticsDashboard['premiumSurfaces'];
}

function summarizeRetentionSurfaces(rows: SurfaceEventRow[]) {
  const count = (name: string) =>
    rows.reduce(
      (sum, row) => sum + (row.event_name === name ? 1 : 0),
      0,
    );
  const uniqueUsers = (...names: string[]) =>
    new Set(
      rows
        .filter(
          (row) =>
            names.includes(row.event_name) &&
            typeof row.user_id === 'string' &&
            row.user_id.length > 0,
        )
        .map((row) => row.user_id as string),
    ).size;

  const impressions = count('continue_watching_impression');
  const clicks = count('continue_watching_click');
  const started = count('continue_watching_started');

  return {
    sampledEvents: rows.length,
    truncated: rows.length >= 10_000,
    continueWatching: {
      impressions,
      clicks,
      started,
      users: uniqueUsers(
        'continue_watching_impression',
        'continue_watching_click',
        'continue_watching_started',
      ),
      impressionToClickPct: percent(clicks, impressions),
      clickToPlayPct: percent(started, clicks),
    },
    personalHome: {
      views: count('personal_home_view'),
      users: uniqueUsers('personal_home_view'),
    },
    personalSchedule: {
      impressions: count('personal_schedule_impression'),
      clicks: count('personal_schedule_click'),
      users: uniqueUsers(
        'personal_schedule_impression',
        'personal_schedule_click',
      ),
      ctrPct: percent(
        count('personal_schedule_click'),
        count('personal_schedule_impression'),
      ),
    },
    notificationCenter: {
      opens: count('notification_center_open'),
      users: uniqueUsers('notification_center_open'),
      subscriptionToggles: count(
        'notification_subscription_toggle',
      ),
    },
  } satisfies ProductAnalyticsDashboard['retentionSurfaces'];
}

const cachedDashboard = unstable_cache(
  async (rangeDays: ProductAnalyticsRange) => {
    const admin = createSupabaseAdmin();

    const [dashboardResult, surfaceRows, premiumSurfaceRows] =
      await Promise.all([
        admin.rpc('get_product_analytics_dashboard', {
          p_days: rangeDays,
        }),
        loadRetentionSurfaceRows(rangeDays),
        loadPremiumSurfaceRows(rangeDays),
      ]);

    if (dashboardResult.error) throw dashboardResult.error;

    const base =
      dashboardResult.data as Omit<
        ProductAnalyticsDashboard,
        'retentionSurfaces'
      >;

    return {
      ...base,
      retentionSurfaces: summarizeRetentionSurfaces(surfaceRows),
      premiumSurfaces: summarizePremiumSurfaces(premiumSurfaceRows),
    } satisfies ProductAnalyticsDashboard;
  },
  ['animebox-product-analytics-dashboard-v5'],
  { revalidate: 60, tags: ['product-analytics-dashboard'] },
);

export async function getProductAnalyticsDashboard(days: number) {
  return cachedDashboard(normalizeRange(days));
}
