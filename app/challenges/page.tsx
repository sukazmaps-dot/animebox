import type { Metadata } from 'next';

import ChallengesClient from '@/components/ChallengesClient';

export const metadata: Metadata = {
  title: 'Задания и серия активности',
  description: 'Ежедневные и недельные задания AnimeBox.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ChallengesPage() {
  return <ChallengesClient />;
}
