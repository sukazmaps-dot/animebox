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
const CAMPAIGN_ID = 'patch11-channel-growth-v1';

function dismissedRecently() {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const timestamp = Number(raw);
    if (!Number.isFinite(timestamp)) return false;
    return Date.now() - timestamp < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export default function TelegramPromoCard({
  placement = 'home_right_rail',
}: {
  placement?: 'home_right_rail' | 'watch_together';
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const impressionSentRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const subscribed =
      document.documentElement.dataset.telegramSubscribed === 'true';

    setHidden(subscribed || dismissedRecently());
    setReady(true);

    const observer = new MutationObserver(() => {
      if (document.documentElement.dataset.telegramSubscribed === 'true') {
        setHidden(true);
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-telegram-subscribed'],
    });

    return () => observer.disconnect();
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
          metadata: {
            campaign_id: CAMPAIGN_ID,
            placement,
          },
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
      metadata: {
        campaign_id: CAMPAIGN_ID,
        placement,
      },
      flush: true,
    });

    const telegram = window.Telegram?.WebApp;
    if (telegram?.openTelegramLink) {
      event.preventDefault();
      telegram.openTelegramLink(TELEGRAM_CHANNEL_URL);
    }
  }

  if (!ready || hidden) return null;

  return (
    <section
      ref={rootRef}
      className={`panel telegram-growth-card ${placement === 'watch_together' ? 'telegram-growth-card--watch-together' : ''}`}
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

      <div className="telegram-growth-card__visual" aria-hidden="true">
        <div className="telegram-growth-card__brand">
          <Icon name="telegram" />
        </div>
        <Image
          src="/brand/telegram-cta.webp"
          alt=""
          width={220}
          height={140}
          sizes="220px"
          className="telegram-growth-card__image"
          loading="lazy"
        />
      </div>

      <div className="telegram-growth-card__copy">
        <span className="telegram-growth-card__eyebrow">ANIMEBOX · TELEGRAM</span>
        <strong>
          {placement === 'watch_together'
            ? 'Watch Together развивается вместе с комьюнити'
            : 'Будь ближе к проекту'}
        </strong>
        <p>
          {placement === 'watch_together'
            ? 'Следи за новыми social-функциями, открытыми комнатами и крупными обновлениями AnimeBox.'
            : 'Патчи, новые функции, планы AnimeBox и важные объявления — в нашем официальном канале.'}
        </p>
      </div>

      <div className="telegram-growth-card__benefits" aria-label="Что публикуем в канале">
        <span>Патчи раньше остальных</span>
        <span>Новости проекта</span>
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
          Открыть {TELEGRAM_CHANNEL_HANDLE}
          <small>официальный канал AnimeBox</small>
        </span>
        <span aria-hidden="true">↗</span>
      </a>
    </section>
  );
}
