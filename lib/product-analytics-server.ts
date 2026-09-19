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

const cachedDashboard = unstable_cache(
  async (rangeDays: ProductAnalyticsRange) => {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.rpc('get_product_analytics_dashboard', {
      p_days: rangeDays,
    });

    if (error) throw error;
    return data as ProductAnalyticsDashboard;
  },
  ['animebox-product-analytics-dashboard-v1'],
  { revalidate: 60, tags: ['product-analytics-dashboard'] },
);

export async function getProductAnalyticsDashboard(days: number) {
  return cachedDashboard(normalizeRange(days));
}
