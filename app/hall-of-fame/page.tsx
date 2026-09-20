import type { Metadata } from 'next';

import HallOfFameClient from '@/components/HallOfFameClient';

export const metadata: Metadata = {
  title: 'Зал славы',
  description: 'История победителей недельных и месячных сезонов AnimeBox.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function HallOfFamePage() {
  return <HallOfFameClient />;
}
