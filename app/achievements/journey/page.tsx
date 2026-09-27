import type { Metadata } from 'next';

import AchievementJourneyClient from '@/components/AchievementJourneyClient';

export const metadata: Metadata = {
  title: 'Путь достижений',
  description: 'Путь прогресса, уровней и достижений AnimeBox.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AchievementJourneyPage() {
  return <AchievementJourneyClient />;
}
