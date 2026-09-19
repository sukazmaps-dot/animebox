import 'server-only';

import { unstable_cache } from 'next/cache';

import type {
  MonetizationDashboard,
  MonetizationDashboardRange,
} from '@/lib/monetization-analytics';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

function normalizeRange(value: number): MonetizationDashboardRange {
  return value === 7 ? 7 : 30;
}

const cachedDashboard = unstable_cache(
  async (rangeDays: MonetizationDashboardRange) => {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.rpc('get_monetization_dashboard', {
      p_days: rangeDays,
    });

    if (error) throw error;
    return data as MonetizationDashboard;
  },
  ['animebox-monetization-dashboard-v1'],
  {
    revalidate: 60,
    tags: ['monetization-dashboard'],
  },
);

export async function getMonetizationDashboard(days: number) {
  return cachedDashboard(normalizeRange(days));
}
