import type { Metadata } from 'next';

import PremiumStudioClient from '@/components/premium/PremiumStudioClient';

export const metadata: Metadata = {
  title: 'Profile Studio',
  robots: { index: false, follow: false },
};

export default function ProfileStudioPage() {
  return <PremiumStudioClient />;
}
