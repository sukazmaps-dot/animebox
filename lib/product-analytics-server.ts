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

const RETENTION_SURFACE_EVENTS = [
  'continue_watching_impression',
  'continue_watching_click',
  'continue_watching_started',
  'personal_home_view',
  'personal_schedule_impression',
  'personal_schedule_click',
  'notification_center_open',
  'notification_subscription_toggle',
  'watch_party_hub_view',
  'watch_party_room_created',
  'watch_party_public_room_join',
  'watch_party_room_started',
  'watch_party_invite_shared',
  'watch_party_reaction_sent',
  'watch_party_vote_cast',
  'watch_party_room_ended',
  'watch_party_room_reported',
  'watch_party_host_transferred',
  'watch_party_participant_kicked',
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
    watchTogether: {
      hubViews: count('watch_party_hub_view'),
      roomsCreated: count('watch_party_room_created'),
      publicJoins: count('watch_party_public_room_join'),
      roomsStarted: count('watch_party_room_started'),
      inviteShares: count('watch_party_invite_shared'),
      reactions: count('watch_party_reaction_sent'),
      votes: count('watch_party_vote_cast'),
      roomsEnded: count('watch_party_room_ended'),
      reports: count('watch_party_room_reported'),
      hostTransfers: count('watch_party_host_transferred'),
      kicks: count('watch_party_participant_kicked'),
      users: uniqueUsers(
        'watch_party_hub_view',
        'watch_party_room_created',
        'watch_party_public_room_join',
        'watch_party_room_started',
      ),
      hubToRoomPct: percent(
        count('watch_party_room_created') + count('watch_party_public_room_join'),
        count('watch_party_hub_view'),
      ),
    },
  } satisfies ProductAnalyticsDashboard['retentionSurfaces'];
}

const cachedDashboard = unstable_cache(
  async (rangeDays: ProductAnalyticsRange) => {
    const admin = createSupabaseAdmin();

    const [dashboardResult, surfaceRows] = await Promise.all([
      admin.rpc('get_product_analytics_dashboard', {
        p_days: rangeDays,
      }),
      loadRetentionSurfaceRows(rangeDays),
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
    } satisfies ProductAnalyticsDashboard;
  },
  ['animebox-product-analytics-dashboard-v4'],
  { revalidate: 60, tags: ['product-analytics-dashboard'] },
);

export async function getProductAnalyticsDashboard(days: number) {
  return cachedDashboard(normalizeRange(days));
}
