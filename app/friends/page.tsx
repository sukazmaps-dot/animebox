import type { Metadata } from 'next';

import FriendsPageClient from '@/components/friends/FriendsPageClient';

export const metadata: Metadata = {
  title: 'Друзья',
  description: 'Друзья и социальные связи AnimeBox.',
  robots: { index: false, follow: false },
};

export default function FriendsPage() {
  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <FriendsPageClient />
    </main>
  );
}
