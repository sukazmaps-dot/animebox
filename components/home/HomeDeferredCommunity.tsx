'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import styles from './HomeFooterPromos.module.css';

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

const DISMISS_KEY = 'animebox:home-footer-promo-dismissed:v1';

export function HomeDeferredSupport() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === 'true');
    } catch {
      // Preference is best-effort; unsupported storage must not hide content.
    }
  }, []);

  if (dismissed) return null;

  return (
    <section className={styles.strip} aria-label="Поддержка и Telegram AnimeBox">
      <DeferredMount
        className="home-deferred home-deferred--support"
        minHeight={68}
        rootMargin="360px 0px"
      >
        <SupportAnimeBoxCard />
      </DeferredMount>

      <DeferredMount
        className="home-deferred home-deferred--telegram"
        minHeight={68}
        rootMargin="360px 0px"
      >
        <TelegramPromoCard placement="home_footer" />
      </DeferredMount>
      <button
        type="button"
        className={styles.close}
        aria-label="Скрыть блок поддержки и Telegram"
        onClick={() => {
          try { window.localStorage.setItem(DISMISS_KEY, 'true'); } catch {}
          setDismissed(true);
        }}
      >×</button>
    </section>
  );
}
