import type { Metadata } from 'next';
import LeaderboardClient from '@/components/LeaderboardClient';

export const metadata: Metadata = {
  title: 'Лидерборд анимешников | AnimeBox',
  description: 'Топ-100 пользователей AnimeBox по подтверждённому времени просмотра.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function LeaderboardPage() {
  return <LeaderboardClient />;
}
