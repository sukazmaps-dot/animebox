import type { Metadata } from 'next';

import PremiumStatsClient from '@/components/premium/PremiumStatsClient';
import { buildStaticPageMetadata } from '@/lib/static-page-seo';

export const metadata: Metadata = buildStaticPageMetadata({
  title: 'Моя статистика — AnimeBox Premium',
  description:
    'Расширенная личная статистика просмотра AnimeBox Premium.',
  path: '/premium/stats',
  noIndex: true,
});

export default function PremiumStatsPage() {
  return <PremiumStatsClient />;
}
