import type { Metadata } from 'next';

import PremiumClient from '@/components/premium/PremiumClient';
import { buildStaticPageMetadata } from '@/lib/static-page-seo';

export const metadata: Metadata = buildStaticPageMetadata({
  title: 'AnimeBox Premium',
  description:
    'AnimeBox Premium — Profile Scene, расширенная персонализация, статистика, Watch Together и ранний доступ к функциям AnimeBox.',
  path: '/premium',
});

export default function PremiumPage() {
  return <PremiumClient />;
}
