'use client';

import {
  ArrowUpRightIcon,
  ChatCircleDotsIcon,
  PaperPlaneTiltIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'framer-motion';
import { type MouseEvent, useEffect, useRef, useState } from 'react';

import AnimeBoxIconCore from '@/components/ui/AnimeBoxIconCore';
import { trackProductClientEvent } from '@/lib/product-events-client';
import {
  TELEGRAM_CHANNEL_HANDLE,
  TELEGRAM_CHANNEL_URL,
} from '@/lib/telegram-links';

const DISMISS_KEY = 'animebox:telegram-channel-promo-dismissed:v1';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CAMPAIGN_ID = 'animebox-visual-language-v1';

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
  const reducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);

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
      className={`panel telegram-growth-card telegram-growth-card--vector ${community ? 'telegram-growth-card--community' : 'telegram-growth-card--compact'}`}
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

      <div className="telegram-growth-card__vector-art" aria-hidden="true">
        <AnimeBoxIconCore size="large" className="telegram-growth-card__icon-core">
          <motion.span
            className="telegram-growth-card__plane"
            animate={
              reducedMotion
                ? undefined
                : { y: [0, -5, 0], rotate: [0, -3, 0] }
            }
            transition={{ duration: 4, ease: 'easeInOut', repeat: Infinity }}
          >
            <PaperPlaneTiltIcon size={42} weight="light" />
          </motion.span>
        </AnimeBoxIconCore>
      </div>

      <div className="telegram-growth-card__content">
        <div className="telegram-growth-card__brand">
          <span className="telegram-growth-card__brand-mark">
            <PaperPlaneTiltIcon size={16} weight="regular" />
          </span>
          <span>
            <small>ANIMEBOX · TELEGRAM</small>
            <b>{community ? 'SOCIAL HUB' : 'OFFICIAL CHANNEL'}</b>
          </span>
        </div>

        <div className="telegram-growth-card__copy">
          <h3>
            {community
              ? 'Watch Together начинается с комьюнити'
              : 'Будь ближе к AnimeBox'}
          </h3>
          <p>
            {community
              ? 'Открытые комнаты, social-функции и большие обновления — в одном канале.'
              : 'Патчи, новые функции и важные новости проекта — без лишнего шума.'}
          </p>
        </div>

        <div className="telegram-growth-card__benefits" aria-label="Преимущества Telegram-канала">
          <span><ChatCircleDotsIcon size={13} /> Патчи</span>
          <span><UsersThreeIcon size={13} /> {community ? 'Watch Together' : 'Комьюнити'}</span>
        </div>

        <a
          href={TELEGRAM_CHANNEL_URL}
          target="_blank"
          rel="noreferrer"
          className="ab-action ab-action--secondary telegram-growth-card__cta"
          onClick={handleChannelClick}
        >
          <span>
            {community ? 'Открыть Telegram' : `Перейти в ${TELEGRAM_CHANNEL_HANDLE}`}
          </span>
          <ArrowUpRightIcon size={16} weight="bold" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
