'use client';

import {
  useEffect,
  useState,
} from 'react';

type TelegramStatus =
  | 'idle'
  | 'checking'
  | 'verified'
  | 'error';

export default function TelegramMiniAppBridge() {
  const [status, setStatus] =
    useState<TelegramStatus>('idle');

  const [showBadge, setShowBadge] =
    useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    /*
     * Обычный браузер.
     */
    if (!tg?.initData) {
      document.documentElement.dataset.telegram =
        'false';

      document.documentElement.dataset.telegramVerified =
        'false';

      return;
    }

    document.documentElement.dataset.telegram =
      'true';

    document.documentElement.classList.add(
      'telegram-mini-app',
    );

    tg.ready();
    tg.expand();

    const controller =
      new AbortController();

    async function verify() {
      try {
        setStatus('checking');

        const response = await fetch(
          '/api/telegram/validate',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              /*
               * ВАЖНО:
               * отправляем сырой initData,
               * а не initDataUnsafe.
               */
              initData: tg!.initData,
            }),

            signal: controller.signal,
          },
        );

        const data = await response.json();

        if (
          !response.ok ||
          !data?.ok
        ) {
          throw new Error(
            data?.error ??
              'Telegram verification failed',
          );
        }

        document.documentElement.dataset.telegramVerified =
          'true';

        setStatus('verified');
        setShowBadge(true);

        /*
         * Позже этот event будет использовать
         * Telegram ↔ Supabase auth.
         */
        window.dispatchEvent(
          new CustomEvent(
            'animebox:telegram-verified',
            {
              detail: {
                user: data.user,
              },
            },
          ),
        );

        /*
         * Временная визуальная проверка.
         */
        window.setTimeout(() => {
          setShowBadge(false);
        }, 3000);
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }

        console.error(
          'AnimeBox Telegram verification:',
          error,
        );

        document.documentElement.dataset.telegramVerified =
          'false';

        setStatus('error');
        setShowBadge(true);
      }
    }

    void verify();

    return () => {
      controller.abort();

      document.documentElement.classList.remove(
        'telegram-mini-app',
      );
    };
  }, []);

  /*
   * В обычном браузере ничего не показываем.
   */
  if (
    status === 'idle' ||
    status === 'checking' ||
    !showBadge
  ) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 999999,
        top: 12,
        right: 12,

        padding: '8px 12px',

        borderRadius: 999,

        border:
          status === 'verified'
            ? '1px solid rgba(134, 110, 255, .4)'
            : '1px solid rgba(255, 90, 90, .4)',

        background:
          'rgba(8, 12, 27, .94)',

        color:
          status === 'verified'
            ? '#c8bcff'
            : '#ff9c9c',

        fontSize: 12,
        fontWeight: 700,

        boxShadow:
          '0 8px 30px rgba(0,0,0,.35)',

        backdropFilter: 'blur(12px)',
      }}
    >
      {status === 'verified'
        ? 'Telegram ✓'
        : 'Telegram verification error'}
    </div>
  );
}