'use client';

import Image from 'next/image';
import { type MouseEvent, useEffect, useRef, useState } from 'react';

import Icon from '@/components/Icon';
import { trackProductClientEvent } from '@/lib/product-events-client';
import {
  TELEGRAM_CHANNEL_HANDLE,
  TELEGRAM_CHANNEL_URL,
} from '@/lib/telegram-links';

const DISMISS_KEY = 'animebox:telegram-channel-promo-dismissed:v1';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CAMPAIGN_ID = 'patch11-channel-growth-v2';

type Placement = 'home_right_rail' | 'watch_together';

function dismissedRecently() {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const timestamp = Number(raw);
    return Number.isFinite(timestamp) && Date.now() - timestamp < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export default function TelegramPromoCard({
  placement = 'home_right_rail',
}: {
  placement?: Placement;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const impressionSentRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [artSource, setArtSource] = useState('/brand/telegram-cta.webp');
  const [artHidden, setArtHidden] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const subscribed =
        document.documentElement.dataset.telegramSubscribed === 'true';
      setHidden(subscribed || dismissedRecently());
      setReady(true);
    });

    const observer = new MutationObserver(() => {
      if (document.documentElement.dataset.telegramSubscribed === 'true') {
        setHidden(true);
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-telegram-subscribed'],
    });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!ready || hidden || !rootRef.current || impressionSentRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || entry.intersectionRatio < 0.45) return;
        impressionSentRef.current = true;
        trackProductClientEvent('telegram_promo_impression', {
          source: placement,
          path: window.location.pathname,
          entityType: 'telegram_channel',
          entityId: TELEGRAM_CHANNEL_HANDLE,
          metadata: { campaign_id: CAMPAIGN_ID, placement },
        });
        observer.disconnect();
      },
      { threshold: [0.45] },
    );

    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [hidden, placement, ready]);

  function dismissPromo() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Frequency cap is best-effort only.
    }

    trackProductClientEvent('telegram_promo_dismiss', {
      source: placement,
      path: window.location.pathname,
      entityType: 'telegram_channel',
      entityId: TELEGRAM_CHANNEL_HANDLE,
      metadata: {
        campaign_id: CAMPAIGN_ID,
        placement,
        dismiss_ttl_days: 7,
      },
      flush: true,
    });

    setHidden(true);
  }

  function handleChannelClick(event: MouseEvent<HTMLAnchorElement>) {
    trackProductClientEvent('telegram_promo_click', {
      source: placement,
      path: window.location.pathname,
      entityType: 'telegram_channel',
      entityId: TELEGRAM_CHANNEL_HANDLE,
      metadata: { campaign_id: CAMPAIGN_ID, placement },
      flush: true,
    });

    const telegram = window.Telegram?.WebApp;
    if (telegram?.openTelegramLink) {
      event.preventDefault();
      telegram.openTelegramLink(TELEGRAM_CHANNEL_URL);
    }
  }

  if (!ready || hidden) return null;

  const community = placement === 'watch_together';

  return (
    <section
      ref={rootRef}
      className={'panel telegram-growth-card ' + (community ? 'telegram-growth-card--community' : 'telegram-growth-card--compact')}
      aria-label="Telegram-канал AnimeBox"
    >
      <button
        type="button"
        className="telegram-growth-card__dismiss"
        onClick={dismissPromo}
        aria-label="Скрыть рекламу Telegram-канала на 7 дней"
        title="Скрыть на 7 дней"
      >
        ×
      </button>

      <div className="telegram-growth-card__aurora" aria-hidden="true" />

      <div
        className={`telegram-growth-card__art ${artHidden ? 'is-fallback' : ''}`}
        aria-hidden="true"
      >
        {!artHidden ? (
          <Image
            src={artSource}
            alt=""
            width={420}
            height={300}
            sizes={community ? '(max-width: 760px) 300px, 420px' : '180px'}
            loading="lazy"
            unoptimized
            onError={() => {
              if (artSource !== '/backgrounds/telegram-promo.webp') {
                setArtSource('/backgrounds/telegram-promo.webp');
                return;
              }

              setArtHidden(true);
            }}
          />
        ) : (
          <span className="telegram-growth-card__art-fallback">
            <Icon name="telegram" />
          </span>
        )}
      </div>

      <div className="telegram-growth-card__content">
        <div className="telegram-growth-card__brand">
          <span className="telegram-growth-card__telegram-icon">
            <Icon name="telegram" />
          </span>
          <span>
            <small>ANIMEBOX · TELEGRAM</small>
            <b>{community ? 'SOCIAL HUB' : 'OFFICIAL CHANNEL'}</b>
          </span>
        </div>

        <div className="telegram-growth-card__copy">
          <h3>
            {community
              ? 'Watch Together живёт вместе с комьюнити'
              : 'Будь ближе к AnimeBox'}
          </h3>
          <p>
            {community
              ? 'Открытые комнаты, social-функции, крупные обновления и планы проекта — в Telegram AnimeBox.'
              : 'Патчи, новые функции и важные новости проекта — без лишнего шума.'}
          </p>
        </div>

        <div className="telegram-growth-card__benefits" aria-label="Преимущества Telegram-канала">
          <span>Патчи</span>
          <span>{community ? 'Watch Together' : 'Планы'}</span>
          <span>Комьюнити</span>
        </div>

        <a
          href={TELEGRAM_CHANNEL_URL}
          target="_blank"
          rel="noreferrer"
          className="telegram-growth-card__cta"
          onClick={handleChannelClick}
        >
          <span>
            {community ? 'Открыть Telegram-комьюнити' : 'Перейти в ' + TELEGRAM_CHANNEL_HANDLE}
            <small>официальный канал AnimeBox</small>
          </span>
          <b aria-hidden="true">↗</b>
        </a>
      </div>
    </section>
  );
}
