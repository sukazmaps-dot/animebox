'use client';

import Image from 'next/image';
import Link from 'next/link';
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
  telegramConnected: boolean;
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
  const { user, profile, loading, telegramMiniApp } = useAuthState();
  const [welcome, setWelcome] = useState<WelcomeState>(null);
  const impressionSentRef = useRef(false);

  const resolveWelcome = useCallback(() => {
    if (loading || !user || blockedPath(pathname)) return;

    const pending = readTelegramWelcomePending();
    if (!pending || pending.userId !== user.id) return;

    if (telegramWelcomeAlreadyShown(user.id)) {
      clearTelegramWelcomePending();
      return;
    }

    const telegramConnected =
      telegramMiniApp ||
      document.documentElement.dataset.telegramSubscribed === 'true';

    markTelegramWelcomeShown(user.id);
    clearTelegramWelcomePending();
    setWelcome({
      source: pending.source,
      telegramConnected,
    });
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

    trackProductClientEvent('registration_welcome_impression', {
      source: 'registration_welcome',
      path: pathname,
      entityType: 'registration_welcome',
      entityId: 'welcome-hub',
      metadata: {
        registration_source: welcome.source,
        telegram_connected: welcome.telegramConnected,
      },
    });
  }, [pathname, welcome]);

  useEffect(() => {
    if (!welcome) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      dismiss('escape');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [welcome]);

  if (!welcome) return null;

  const username = profile?.username?.trim() || null;

  function trackAction(action: string) {
    trackProductClientEvent('registration_welcome_action', {
      source: 'registration_welcome',
      path: pathname,
      entityType: 'registration_welcome',
      entityId: 'welcome-hub',
      metadata: {
        action,
        registration_source: welcome?.source ?? null,
      },
      flush: true,
    });
  }

  function dismiss(reason: 'button' | 'backdrop' | 'escape' | 'continue') {
    trackProductClientEvent('registration_welcome_dismiss', {
      source: 'registration_welcome',
      path: pathname,
      entityType: 'registration_welcome',
      entityId: 'welcome-hub',
      metadata: {
        registration_source: welcome?.source ?? null,
        reason,
      },
      flush: true,
    });
    setWelcome(null);
  }

  function handleInternalAction(action: string) {
    trackAction(action);
    setWelcome(null);
  }

  function openChannel() {
    trackAction('telegram');
    trackProductClientEvent('telegram_welcome_click', {
      source: 'registration_welcome',
      path: pathname,
      entityType: 'telegram_channel',
      entityId: TELEGRAM_CHANNEL_HANDLE,
      metadata: {
        registration_source: welcome?.source ?? null,
        placement: 'post_registration_hub',
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
        className="telegram-welcome__dialog telegram-welcome__dialog--hub"
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

        <div className="telegram-welcome__art telegram-welcome__art--animebox" aria-hidden="true">
          <div className="registration-welcome__logo-shell">
            <Image
              src="/logo.png"
              alt=""
              width={180}
              height={180}
              sizes="180px"
              priority={false}
            />
          </div>
          <div className="registration-welcome__art-copy">
            <small>ANIMEBOX ACCOUNT</small>
            <strong>Твой профиль готов</strong>
            <span>Начни с тайтла, который давно хотел посмотреть.</span>
          </div>
        </div>

        <div className="telegram-welcome__content registration-welcome__content">
          <span className="telegram-welcome__success">Аккаунт создан · добро пожаловать ✦</span>

          <h2 id="telegram-welcome-title">
            {username ? 'Добро пожаловать, ' + username : 'Добро пожаловать в AnimeBox'}
          </h2>
          <p>
            Настрой профиль, добавь первые тайтлы и попробуй социальные функции.
            Всё это можно сделать сейчас или вернуться позже.
          </p>

          <div className="registration-welcome__actions">
            <Link
              href="/profile/edit"
              className="registration-welcome__action"
              onClick={() => handleInternalAction('profile')}
            >
              <span className="registration-welcome__action-icon"><Icon name="user" /></span>
              <span>
                <strong>Настроить профиль</strong>
                <small>Аватар, баннер и оформление</small>
              </span>
              <b>→</b>
            </Link>

            <Link
              href="/list"
              className="registration-welcome__action"
              onClick={() => handleInternalAction('tracker')}
            >
              <span className="registration-welcome__action-icon"><Icon name="tracker" /></span>
              <span>
                <strong>Собрать трекер</strong>
                <small>Запланированное и просмотренное</small>
              </span>
              <b>→</b>
            </Link>

            <Link
              href="/watch-together"
              className="registration-welcome__action"
              onClick={() => handleInternalAction('watch_together')}
            >
              <span className="registration-welcome__action-icon"><Icon name="users" /></span>
              <span>
                <strong>Watch Together</strong>
                <small>Смотри аниме вместе</small>
              </span>
              <b>→</b>
            </Link>

            <a
              href={TELEGRAM_CHANNEL_URL}
              target="_blank"
              rel="noreferrer"
              className="registration-welcome__action registration-welcome__action--telegram"
              onClick={openChannel}
            >
              <span className="registration-welcome__action-icon"><Icon name="telegram" /></span>
              <span>
                <strong>
                  {welcome.telegramConnected
                    ? 'Telegram уже рядом'
                    : 'Открыть ' + TELEGRAM_CHANNEL_HANDLE}
                </strong>
                <small>
                  {welcome.telegramConnected
                    ? 'Новости и комьюнити AnimeBox'
                    : 'Патчи, планы и новости проекта'}
                </small>
              </span>
              <b>↗</b>
            </a>
          </div>

          <button
            type="button"
            className="telegram-welcome__cta registration-welcome__continue"
            onClick={() => dismiss('continue')}
          >
            <span>
              Продолжить в AnimeBox
              <small>Можно настроить всё позже</small>
            </span>
            <b aria-hidden="true">→</b>
          </button>
        </div>
      </section>
    </div>
  );
}
