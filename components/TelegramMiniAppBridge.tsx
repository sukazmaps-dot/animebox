'use client';

import {
  useEffect,
  useState,
} from 'react';

import { createClient } from '@/lib/supabase/client';

type TelegramStatus =
  | 'idle'
  | 'checking'
  | 'verified'
  | 'linking'
  | 'logging-in'
  | 'authenticated'
  | 'error';

type ApiResponse = {
  ok?: boolean;

  user?: {
    id: number;
    first_name: string;
    username?: string | null;
  };

  linked?: boolean;
  alreadyLinked?: boolean;

  tokenHash?: string;

  error?: string;
  reason?: string;
};

function humanizeError(
  value: string,
) {
  switch (value) {
    case 'telegram_not_linked':
      return 'Telegram ещё не привязан к AnimeBox';

    case 'telegram_already_linked':
      return 'Telegram уже используется другим аккаунтом';

    case 'account_has_other_telegram':
      return 'У аккаунта уже другой Telegram';

    case 'invalid_telegram_data':
    case 'invalid_hash':
      return 'Ошибка проверки Telegram';

    case 'expired':
      return 'Telegram-сессия устарела';

    case 'auth_user_not_found':
      return 'Аккаунт AnimeBox не найден';

    case 'session_token_failed':
    case 'session_token_missing':
      return 'Не удалось создать сессию AnimeBox';

    default:
      return value ||
        'Ошибка Telegram';
  }
}

export default function TelegramMiniAppBridge() {
  const [status, setStatus] =
    useState<TelegramStatus>('idle');

  const [message, setMessage] =
    useState('');

  const [showBadge, setShowBadge] =
    useState(false);

  useEffect(() => {
    const tg =
      window.Telegram?.WebApp;

    if (!tg?.initData) {
      document.documentElement.dataset.telegram =
        'false';

      return;
    }

    const telegram = tg;

    document.documentElement.dataset.telegram =
      'true';

    document.documentElement.classList.add(
      'telegram-mini-app',
    );

    telegram.ready();
    telegram.expand();

    const supabase =
      createClient();

    const controller =
      new AbortController();

    let destroyed = false;

    let badgeTimer:
      | ReturnType<typeof setTimeout>
      | null = null;

    function showBadge(
      text: string,
      nextStatus: TelegramStatus,
    ) {
      if (destroyed) {
        return;
      }

      if (badgeTimer) {
        clearTimeout(
          badgeTimer,
        );
      }

      setMessage(text);
      setStatus(nextStatus);
      setShowBadge(true);

      badgeTimer =
        setTimeout(() => {
          if (!destroyed) {
            setShowBadge(false);
          }
        }, 3000);
    }

    async function requestJson(
      url: string,
      body: object,
    ): Promise<ApiResponse> {
      const response =
        await fetch(
          url,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify(
                body,
              ),

            cache: 'no-store',

            signal:
              controller.signal,
          },
        );

      const data =
        (await response.json()) as
          ApiResponse;

      if (
        !response.ok ||
        !data.ok
      ) {
        throw new Error(
          data.reason ??
            data.error ??
            'request_failed',
        );
      }

      return data;
    }

    /*
     * Если пользователь уже вошёл
     * внутри Telegram WebView —
     * проверяем/привязываем аккаунт.
     */
    async function linkExistingSession(
      accessToken: string,
    ) {
      setStatus('linking');

      await requestJson(
        '/api/telegram/link',
        {
          initData:
            telegram.initData,

          accessToken,
        },
      );

      document.documentElement.dataset.telegramLinked =
        'true';

      showBadge(
        'Telegram подключён ✓',
        'authenticated',
      );
    }

    /*
     * Если Supabase-сессии нет —
     * пытаемся войти по telegram_id.
     */
    async function loginWithTelegram() {
      setStatus(
        'logging-in',
      );

      const data =
        await requestJson(
          '/api/telegram/session',
          {
            initData:
              telegram.initData,
          },
        );

      if (!data.tokenHash) {
        throw new Error(
          'session_token_missing',
        );
      }

      /*
       * Supabase проверяет одноразовый
       * token hash и создаёт обычную
       * полноценную session.
       */
      const {
        data: otpData,
        error: otpError,
      } =
        await supabase.auth.verifyOtp({
          token_hash:
            data.tokenHash,

          type:
            'email',
        });

      if (
        otpError ||
        !otpData.session ||
        !otpData.user
      ) {
        console.error(
          '[Telegram] verifyOtp:',
          otpError,
        );

        throw new Error(
          'supabase_login_failed',
        );
      }

      document.documentElement.dataset.telegramVerified =
        'true';

      document.documentElement.dataset.telegramLinked =
        'true';

      document.documentElement.dataset.telegramAuthenticated =
        'true';

      window.dispatchEvent(
        new CustomEvent(
          'animebox:telegram-authenticated',
          {
            detail: {
              user:
                otpData.user,
            },
          },
        ),
      );

      showBadge(
        'Вход через Telegram ✓',
        'authenticated',
      );
    }

    async function initialize() {
      try {
        setStatus(
          'checking',
        );

        /*
         * Сначала проверяем,
         * нет ли уже AnimeBox session.
         */
        const {
          data: sessionData,
          error: sessionError,
        } =
          await supabase.auth.getSession();

        if (sessionError) {
          console.warn(
            '[Telegram] getSession:',
            sessionError,
          );
        }

        const session =
          sessionData.session;

        /*
         * Уже авторизован.
         *
         * Просто убеждаемся,
         * что Telegram связан.
         */
        if (
          session?.access_token
        ) {
          await linkExistingSession(
            session.access_token,
          );

          return;
        }

        /*
         * Нет сессии —
         * пробуем автоматический
         * Telegram login.
         */
        await loginWithTelegram();
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name ===
            'AbortError'
        ) {
          return;
        }

        const rawMessage =
          error instanceof Error
            ? error.message
            : 'unknown_error';

        console.error(
          '[AnimeBox Telegram]',
          error,
        );

        setMessage(
          humanizeError(
            rawMessage,
          ),
        );

        setStatus('error');
        setShowBadge(true);
      }
    }

    void initialize();

    return () => {
      destroyed = true;

      controller.abort();

      if (badgeTimer) {
        clearTimeout(
          badgeTimer,
        );
      }

      document.documentElement.classList.remove(
        'telegram-mini-app',
      );
    };
  }, []);

  if (
    status === 'idle' ||
    status === 'checking' ||
    status === 'linking' ||
    status === 'logging-in' ||
    !showBadge
  ) {
    return null;
  }

  const success =
    status ===
    'authenticated';

  return (
    <div
      style={{
        position:
          'fixed',

        zIndex:
          999999,

        top:
          12,

        right:
          12,

        maxWidth:
          'calc(100vw - 24px)',

        padding:
          '8px 12px',

        borderRadius:
          999,

        border:
          success
            ? '1px solid rgba(134, 110, 255, .4)'
            : '1px solid rgba(255, 90, 90, .4)',

        background:
          'rgba(8, 12, 27, .94)',

        color:
          success
            ? '#c8bcff'
            : '#ff9c9c',

        fontSize:
          12,

        fontWeight:
          700,

        boxShadow:
          '0 8px 30px rgba(0,0,0,.35)',

        backdropFilter:
          'blur(12px)',

        whiteSpace:
          'nowrap',

        overflow:
          'hidden',

        textOverflow:
          'ellipsis',
      }}
    >
      {message}
    </div>
  );
}