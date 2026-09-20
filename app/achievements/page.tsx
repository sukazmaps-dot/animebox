import type { Metadata } from 'next';

import AchievementsClient from '@/components/AchievementsClient';

export const metadata: Metadata = {
  title: 'Достижения',
  description: 'Уровни и достижения профиля AnimeBox.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AchievementsPage() {
  return <AchievementsClient />;
}
