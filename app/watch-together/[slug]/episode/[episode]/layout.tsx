import type { ReactNode } from 'react';

import '@/app/watch-together-controls-hotfix.css';
import '@/app/patch17-6-player-runtime.css';

export default function WatchTogetherEpisodeLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
