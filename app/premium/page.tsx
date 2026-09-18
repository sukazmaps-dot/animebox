import type { Metadata } from 'next';

import PremiumClient from '@/components/premium/PremiumClient';

export const metadata: Metadata = {
  title: 'AnimeBox Premium',
  description: 'AnimeBox Premium — без рекламы, расширенная персонализация профиля и дополнительные возможности.',
};

export default function PremiumPage() {
  return <PremiumClient />;
}
