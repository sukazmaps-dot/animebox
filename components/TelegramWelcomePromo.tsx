'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import Icon from '@/components/Icon';
import { useAuthState } from '@/components/AuthStateProvider';
import {
  clearTelegramWelcomePending,
  markTelegramWelcomeShown,
  readTelegramWelcomePending,
  subscribeTelegramWelcomePending,
  telegramWelcomeAlreadyShown,
  type TelegramWelcomeSource,
} from '@/lib/telegram-growth-client';
import { trackProductClientEvent } from '@/lib/product-events-client';
import {
  TELEGRAM_CHANNEL_HANDLE,
  TELEGRAM_CHANNEL_URL,
} from '@/lib/telegram-links';

type WelcomeState = {
  source: TelegramWelcomeSource;
} | null;

function blockedPath(pathname: string) {
  return (
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/onboarding' ||
    pathname.startsWith('/auth/')
  );
}

export default function TelegramWelcomePromo() {
  const pathname = usePathname();
  const { user, loading, telegramMiniApp } = useAuthState();
  const [welcome, setWelcome] = useState<WelcomeState>(null);
  const impressionSentRef = useRef(false);

  const resolveWelcome = useCallback(() => {
    if (loading || !user || telegramMiniApp || blockedPath(pathname)) return;

    const pending = readTelegramWelcomePending();
    if (!pending || pending.userId !== user.id) return;

    if (telegramWelcomeAlreadyShown(user.id)) {
      clearTelegramWelcomePending();
      return;
    }

    if (document.documentElement.dataset.telegramSubscribed === 'true') {
      markTelegramWelcomeShown(user.id);
      clearTelegramWelcomePending();
      return;
    }

    markTelegramWelcomeShown(user.id);
    clearTelegramWelcomePending();
    setWelcome({ source: pending.source });
  }, [loading, pathname, telegramMiniApp, user]);

  useEffect(() => {
    const timer = window.setTimeout(resolveWelcome, 900);
    const unsubscribe = subscribeTelegramWelcomePending(() => {
      window.setTimeout(resolveWelcome, 900);
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [resolveWelcome]);

  useEffect(() => {
    if (!welcome || impressionSentRef.current) return;
    impressionSentRef.current = true;

    trackProductClientEvent('telegram_welcome_impression', {
      source: 'registration_welcome',
      path: pathname,
      entityType: 'telegram_channel',
      entityId: TELEGRAM_CHANNEL_HANDLE,
      metadata: {
        registration_source: welcome.source,
        placement: 'post_registration',
      },
    });
  }, [pathname, welcome]);

  useEffect(() => {
    if (!welcome) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      trackProductClientEvent('telegram_welcome_dismiss', {
        source: 'registration_welcome',
        path: pathname,
        entityType: 'telegram_channel',
        entityId: TELEGRAM_CHANNEL_HANDLE,
        metadata: {
          registration_source: welcome.source,
          placement: 'post_registration',
          reason: 'escape',
        },
        flush: true,
      });
      setWelcome(null);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [pathname, welcome]);

  if (!welcome) return null;

  function dismiss(reason: 'button' | 'backdrop') {
    trackProductClientEvent('telegram_welcome_dismiss', {
      source: 'registration_welcome',
      path: pathname,
      entityType: 'telegram_channel',
      entityId: TELEGRAM_CHANNEL_HANDLE,
      metadata: {
        registration_source: welcome?.source ?? null,
        placement: 'post_registration',
        reason,
      },
      flush: true,
    });
    setWelcome(null);
  }

  function openChannel() {
    trackProductClientEvent('telegram_welcome_click', {
      source: 'registration_welcome',
      path: pathname,
      entityType: 'telegram_channel',
      entityId: TELEGRAM_CHANNEL_HANDLE,
      metadata: {
        registration_source: welcome?.source ?? null,
        placement: 'post_registration',
      },
      flush: true,
    });
    setWelcome(null);
  }

  return (
    <div
      className="telegram-welcome"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss('backdrop');
      }}
    >
      <section
        className="telegram-welcome__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="telegram-welcome-title"
      >
        <button
          type="button"
          className="telegram-welcome__close"
          onClick={() => dismiss('button')}
          aria-label="Закрыть"
        >
          ×
        </button>

        <div className="telegram-welcome__art" aria-hidden="true">
          <span className="telegram-welcome__orbit telegram-welcome__orbit--one" />
          <span className="telegram-welcome__orbit telegram-welcome__orbit--two" />
          <Image
            src="/brand/telegram-cta.webp"
            alt=""
            width={420}
            height={300}
            sizes="(max-width: 640px) 300px, 420px"
            priority={false}
          />
        </div>

        <div className="telegram-welcome__content">
          <div className="telegram-welcome__brand">
            <span><Icon name="telegram" /></span>
            <small>ANIMEBOX · TELEGRAM</small>
          </div>

          <span className="telegram-welcome__success">Аккаунт готов · добро пожаловать ✦</span>

          <h2 id="telegram-welcome-title">Будь ближе к AnimeBox</h2>
          <p>
            Патчи, новые функции, Watch Together и важные новости проекта —
            в официальном Telegram-канале.
          </p>

          <div className="telegram-welcome__benefits">
            <span>Патчи и планы</span>
            <span>Social-функции</span>
            <span>Комьюнити</span>
          </div>

          <a
            href={TELEGRAM_CHANNEL_URL}
            target="_blank"
            rel="noreferrer"
            className="telegram-welcome__cta"
            onClick={openChannel}
          >
            <span>
              Открыть {TELEGRAM_CHANNEL_HANDLE}
              <small>официальный канал AnimeBox</small>
            </span>
            <b aria-hidden="true">↗</b>
          </a>

          <button
            type="button"
            className="telegram-welcome__later"
            onClick={() => dismiss('button')}
          >
            Не сейчас
          </button>
        </div>
      </section>
    </div>
  );
}
