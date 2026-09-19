import type { Metadata } from 'next';

import WatchTogetherHub from '@/components/watch-party/WatchTogetherHub';

export const metadata: Metadata = {
  title: 'Watch Together — смотреть аниме вместе',
  description: 'Создай приватную AnimeBox Watch Together комнату, выбери аниме и пригласи друзей.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function WatchTogetherPage() {
  return <WatchTogetherHub />;
}
