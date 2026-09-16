'use client';

import {
  useEffect,
  useState,
} from 'react';

import {
  createClient,
} from '@/lib/supabase/client';

type TelegramStatus =
  | 'idle'
  | 'checking'
  | 'linking'
  | 'registering'
  | 'logging-in'
  | 'authenticated'
  | 'error';

type ApiResponse = {
  ok?: boolean;

  tokenHash?: string;

  created?: boolean;

  linked?: boolean;

  error?: string;

  reason?: string;

  userId?: string;

  profile?: {
    username?: string | null;
  };
};

function humanizeError(
  value: string,
) {
  switch (value) {
    case 'telegram_already_linked':
      return 'Telegram уже привязан к другому аккаунту';

    case 'account_has_other_telegram':
      return 'К аккаунту привязан другой Telegram';

    case 'invalid_hash':
    case 'invalid_telegram_data':
      return 'Не удалось подтвердить Telegram';

    case 'expired':
      return 'Telegram-сессия устарела. Открой Mini App заново';

    case 'telegram_registration_failed':
      return 'Не удалось создать аккаунт через Telegram';

    case 'profile_creation_failed':
      return 'Не удалось создать профиль AnimeBox';

    case 'session_token_failed':
    case 'session_token_missing':
      return 'Не удалось создать сессию AnimeBox';

    case 'supabase_login_failed':
      return 'Не удалось войти в AnimeBox';

    default:
      return (
        value ||
        'Ошибка Telegram'
      );
  }
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);

    this.name =
      'ApiError';
  }
}

export default function TelegramMiniAppBridge() {
  const [
    status,
    setStatus,
  ] =
    useState<TelegramStatus>(
      'idle',
    );

  const [
    message,
    setMessage,
  ] =
    useState('');

  const [
    showBadgeState,
    setShowBadgeState,
  ] =
    useState(false);

  useEffect(() => {
    const tg =
      window.Telegram?.WebApp;

    /*
     * Обычный браузер.
     */
    if (!tg?.initData) {
      document.documentElement.dataset.telegram =
        'false';

      return;
    }

    const telegram =
      tg;

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

    let destroyed =
      false;

    let badgeTimer:
      | ReturnType<
          typeof setTimeout
        >
      | null =
      null;

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

      setStatus(
        nextStatus,
      );

      setShowBadgeState(
        true,
      );

      badgeTimer =
        setTimeout(
          () => {
            if (!destroyed) {
              setShowBadgeState(
                false,
              );
            }
          },
          3000,
        );
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

            cache:
              'no-store',

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
        throw new ApiError(
          data.reason ??
            data.error ??
            'request_failed',

          response.status,
        );
      }

      return data;
    }

    /*
     * Обмен token hash
     * на настоящую Supabase session.
     */
    async function loginWithToken(
      tokenHash: string,
    ) {
      setStatus(
        'logging-in',
      );

      const {
        data,
        error,
      } =
        await supabase
          .auth
          .verifyOtp({
            token_hash:
              tokenHash,

            type:
              'email',
          });

      if (
        error ||
        !data.session ||
        !data.user
      ) {
        console.error(
          '[Telegram verifyOtp]',
          error,
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
                data.user,
            },
          },
        ),
      );
    }

    /*
     * Уже есть обычная AnimeBox session:
     * связываем её с Telegram.
     */
    async function linkExistingSession(
      accessToken: string,
    ) {
      setStatus(
        'linking',
      );

      await requestJson(
        '/api/telegram/link',
        {
          initData:
            telegram.initData,

          accessToken,
        },
      );

      document.documentElement.dataset.telegramVerified =
        'true';

      document.documentElement.dataset.telegramLinked =
        'true';

      document.documentElement.dataset.telegramAuthenticated =
        'true';

      showBadge(
        'Telegram подключён ✓',
        'authenticated',
      );
    }

    /*
     * Уже зарегистрированный
     * Telegram user.
     */
    async function loginExistingTelegram() {
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

      await loginWithToken(
        data.tokenHash,
      );

      showBadge(
        'Вход через Telegram ✓',
        'authenticated',
      );
    }

    /*
     * Совершенно новый Telegram user.
     */
    async function registerTelegramUser() {
      setStatus(
        'registering',
      );

      const data =
        await requestJson(
          '/api/telegram/register',
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

      await loginWithToken(
        data.tokenHash,
      );

      showBadge(
        data.created
          ? 'Аккаунт создан через Telegram ✓'
          : 'Вход через Telegram ✓',

        'authenticated',
      );
    }

    async function initialize() {
      try {
        setStatus(
          'checking',
        );

        /*
         * 1. Проверяем существующую
         * Supabase session.
         */
        const {
          data:
            sessionData,

          error:
            sessionError,
        } =
          await supabase
            .auth
            .getSession();

        if (sessionError) {
          console.warn(
            '[Telegram getSession]',
            sessionError,
          );
        }

        const session =
          sessionData.session;

        if (
          session?.access_token
        ) {
          await linkExistingSession(
            session.access_token,
          );

          return;
        }

        /*
         * 2. Сессии нет.
         *
         * Сначала пробуем вход
         * существующего Telegram user.
         */
        try {
          await loginExistingTelegram();

          return;
        } catch (error) {
          /*
           * Регистрируем ТОЛЬКО если
           * сервер явно сообщил:
           * Telegram ещё не связан.
           *
           * При invalid_hash / 500 / expired
           * создавать аккаунт нельзя.
           */
          if (
            !(
              error instanceof
              ApiError
            ) ||
            error.message !==
              'telegram_not_linked'
          ) {
            throw error;
          }
        }

        /*
         * 3. Telegram настоящий,
         * но профиля ещё нет.
         */
        await registerTelegramUser();
      } catch (error) {
        if (
          error instanceof
            DOMException &&
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

        document.documentElement.dataset.telegramAuthenticated =
          'false';

        setMessage(
          humanizeError(
            rawMessage,
          ),
        );

        setStatus(
          'error',
        );

        setShowBadgeState(
          true,
        );
      }
    }

    void initialize();

    return () => {
      destroyed =
        true;

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
    status === 'registering' ||
    status === 'logging-in' ||
    !showBadgeState
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