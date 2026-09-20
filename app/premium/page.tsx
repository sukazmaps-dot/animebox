import type { Metadata } from 'next';

import PremiumClient from '@/components/premium/PremiumClient';
import { buildStaticPageMetadata } from '@/lib/static-page-seo';

export const metadata: Metadata = buildStaticPageMetadata({
  title: 'AnimeBox Premium',
  description:
    'AnimeBox Premium — +20% XP, расширенная персонализация профиля, Premium Studio и дополнительные возможности.',
  path: '/premium',
});

export default function PremiumPage() {
  return <PremiumClient />;
}
