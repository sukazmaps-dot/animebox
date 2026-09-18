import type { Metadata } from 'next';

import SponsorLeaderboard from '@/components/monetization/SponsorLeaderboard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Спонсоры AnimeBox',
  description: 'Открытый рейтинг пользователей, которые помогают развивать AnimeBox.',
  robots: { index: false, follow: true },
};

export default function SupportersPage() {
  return <SponsorLeaderboard />;
}
