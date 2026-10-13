'use client';

import dynamic from 'next/dynamic';

import DeferredMount from '@/components/DeferredMount';

const HomeWatchTogetherLobby = dynamic(
  () => import('@/components/home/HomeWatchTogetherLobby'),
  { ssr: false },
);

export default function HomeWatchTogetherDeferred() {
  return (
    <DeferredMount
      className="home-deferred home-deferred--social-lobby"
      minHeight={80}
      rootMargin="250px 0px"
      ariaLabel="Открытые комнаты AnimeBox"
    >
      <HomeWatchTogetherLobby />
    </DeferredMount>
  );
}
