import type { Metadata } from 'next';

import EpisodeJourneyClient from '@/components/EpisodeJourneyClient';

export const metadata: Metadata = {
  title: 'Путь · Достижения',
  description: 'Открытые сюжетные моменты AnimeBox.',
  robots: { index: false, follow: false },
};

export default function JourneyPage() {
  return <EpisodeJourneyClient />;
}
