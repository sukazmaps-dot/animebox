'use client';

import dynamic from 'next/dynamic';

import DeferredMount from '@/components/DeferredMount';

const HomeChatTeaser = dynamic(
  () => import('@/components/chat/HomeChatTeaser'),
  { ssr: false },
);

const TelegramPromoCard = dynamic(
  () => import('@/components/TelegramPromoCard'),
  { ssr: false },
);

const SupportAnimeBoxCard = dynamic(
  () =>
    import('@/components/monetization/SupportAnimeBox').then(
      (module) => module.SupportAnimeBoxCard,
    ),
  { ssr: false },
);

export function HomeDeferredChat() {
  return (
    <DeferredMount
      className="home-deferred home-deferred--chat"
      minHeight={150}
      rootMargin="420px 0px"
      ariaLabel="Чат AnimeBox"
    >
      <HomeChatTeaser />
    </DeferredMount>
  );
}

export function HomeDeferredSupport() {
  return (
    <>
      <DeferredMount
        className="home-deferred home-deferred--support"
        minHeight={148}
        rootMargin="360px 0px"
      >
        <SupportAnimeBoxCard />
      </DeferredMount>

      <DeferredMount
        className="home-deferred home-deferred--telegram"
        minHeight={148}
        rootMargin="360px 0px"
      >
        <TelegramPromoCard placement="home_footer" />
      </DeferredMount>
    </>
  );
}
