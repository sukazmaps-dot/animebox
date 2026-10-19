'use client';

import dynamic from 'next/dynamic';
import { useState, useSyncExternalStore } from 'react';
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
const DISMISS_EVENT = 'animebox-home-footer-promo-dismissed';

function readDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === 'true';
  } catch {
    return false;
  }
}

function subscribeDismissed(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(DISMISS_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(DISMISS_EVENT, onChange);
  };
}

export function HomeDeferredSupport() {
  // Stable SSR snapshot avoids a hydration mismatch. A local click flag still
  // dismisses the banner when storage is denied by the browser.
  const persistedDismissed = useSyncExternalStore(
    subscribeDismissed,
    readDismissed,
    () => false,
  );
  const [dismissedHere, setDismissedHere] = useState(false);

  if (dismissedHere || persistedDismissed) return null;

  return (
    <section className={styles.strip} aria-label="Поддержка и Telegram AnimeBox">
      <div className={styles.heading}>
        <span>Сообщество AnimeBox</span>
        <button
          type="button"
          className={styles.close}
          aria-label="Скрыть блок поддержки и Telegram"
          onClick={() => {
            setDismissedHere(true);
            try { window.localStorage.setItem(DISMISS_KEY, 'true'); } catch {
              // Browsers with disabled storage still hide this visit's banner.
            }
            window.dispatchEvent(new Event(DISMISS_EVENT));
          }}
        >×</button>
      </div>
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
    </section>
  );
}
