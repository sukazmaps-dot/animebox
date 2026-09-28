import type { Metadata } from 'next';

import PremiumYearReviewClient from '@/components/premium/PremiumYearReviewClient';
import { buildStaticPageMetadata } from '@/lib/static-page-seo';

export const metadata: Metadata = buildStaticPageMetadata({
  title: 'Итоги года — AnimeBox Premium',
  description:
    'Личные итоги года AnimeBox Premium: серии, тайтлы, активные дни, жанры и ритм просмотра.',
  path: '/premium/year',
  index: false,
});

export default function PremiumYearReviewPage() {
  return <PremiumYearReviewClient />;
}
