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
  | 'linked'
  | 'error';

type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string | null;
  username?: string | null;
  language_code?: string | null;
  photo_url?: string | null;
  is_premium?: boolean;
};

type ValidateResponse = {
  ok?: boolean;
  user?: TelegramUser;
  error?: string;
  reason?: string;
};

type LinkResponse = {
  ok?: boolean;
  linked?: boolean;
  alreadyLinked?: boolean;

  telegram?: {
    id: number;
    username?: string | null;
    first_name?: string;
  };

  error?: string;
  reason?: string;
};

function humanizeError(error: string) {
  switch (error) {
    case 'telegram_already_linked':
      return 'Этот Telegram уже привязан к другому аккаунту';

    case 'account_has_other_telegram':
      return 'К аккаунту уже привязан другой Telegram';

    case 'animebox_login_required':
      return 'Нужно войти в AnimeBox';

    case 'invalid_animebox_session':
      return 'Сессия AnimeBox устарела';

    case 'profile_not_found':
      return 'Профиль AnimeBox не найден';

    case 'telegram_link_failed':
      return 'Не удалось привязать Telegram';

    case 'telegram_not_configured':
      return 'Telegram не настроен';

    case 'invalid_hash':
      return 'Ошибка подписи Telegram';

    case 'expired':
      return 'Сессия Telegram устарела';

    default:
      return error || 'Неизвестная ошибка';
  }
}

export default function TelegramMiniAppBridge() {
  const [status, setStatus] =
    useState<TelegramStatus>('idle');

  const [showBadge, setShowBadge] =
    useState(false);

  const [message, setMessage] =
    useState('');

  useEffect(() => {
    const tg =
      window.Telegram?.WebApp;

    /*
     * Обычный браузер:
     * Telegram-логику вообще не запускаем.
     */
    if (!tg?.initData) {
      document.documentElement.dataset.telegram =
        'false';

      document.documentElement.dataset.telegramVerified =
        'false';

      document.documentElement.dataset.telegramLinked =
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

    const controller =
      new AbortController();

    const supabase =
      createClient();

    let badgeTimer:
      | ReturnType<typeof setTimeout>
      | null = null;

    let destroyed = false;

    function showTemporaryBadge(
      text: string,
      nextStatus: TelegramStatus,
      timeout = 3000,
    ) {
      if (destroyed) return;

      if (badgeTimer) {
        clearTimeout(badgeTimer);
      }

      setMessage(text);
      setStatus(nextStatus);
      setShowBadge(true);

      badgeTimer = setTimeout(() => {
        if (!destroyed) {
          setShowBadge(false);
        }
      }, timeout);
    }

    /*
     * ---------------------------------------------------------
     * 1. Проверяем Telegram initData
     * ---------------------------------------------------------
     */
    async function validateTelegram():
      Promise<TelegramUser | null> {
      setStatus('checking');
      setMessage('');

      const response =
        await fetch(
          '/api/telegram/validate',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              initData:
                telegram.initData,
            }),

            signal:
              controller.signal,
          },
        );

      const data =
        (await response.json()) as
          ValidateResponse;

      if (
        !response.ok ||
        !data.ok ||
        !data.user
      ) {
        throw new Error(
          data.reason ??
            data.error ??
            'telegram_validation_failed',
        );
      }

      document.documentElement.dataset.telegramVerified =
        'true';

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

      return data.user;
    }

    /*
     * ---------------------------------------------------------
     * 2. Если AnimeBox пользователь уже вошёл —
     *    привязываем его профиль к Telegram.
     * ---------------------------------------------------------
     */
    async function linkAnimeBoxAccount(
      accessToken: string,
    ) {
      setStatus('linking');

      const response =
        await fetch(
          '/api/telegram/link',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              initData:
                telegram.initData,

              accessToken,
            }),

            signal:
              controller.signal,
          },
        );

      const data =
        (await response.json()) as
          LinkResponse;

      if (
        !response.ok ||
        !data.ok ||
        !data.linked
      ) {
        throw new Error(
          data.reason ??
            data.error ??
            'telegram_link_failed',
        );
      }

      document.documentElement.dataset.telegramLinked =
        'true';

      window.dispatchEvent(
        new CustomEvent(
          'animebox:telegram-linked',
          {
            detail: {
              telegram:
                data.telegram,

              alreadyLinked:
                data.alreadyLinked === true,
            },
          },
        ),
      );

      showTemporaryBadge(
        data.alreadyLinked
          ? 'Telegram подключён ✓'
          : 'Telegram привязан ✓',
        'linked',
      );
    }

    /*
     * ---------------------------------------------------------
     * 3. Полный стартовый flow.
     * ---------------------------------------------------------
     */
    async function initialize() {
      try {
        await validateTelegram();

        /*
         * Telegram настоящий.
         *
         * Теперь смотрим, есть ли уже
         * Supabase-сессия AnimeBox.
         */
        const {
          data: sessionData,
          error: sessionError,
        } =
          await supabase.auth.getSession();

        if (sessionError) {
          console.warn(
            '[Telegram] Supabase session:',
            sessionError.message,
          );
        }

        const session =
          sessionData.session;

        /*
         * Пользователь ещё не вошёл в AnimeBox.
         *
         * Это НЕ ошибка Telegram.
         * Просто пока нечего привязывать.
         */
        if (
          !session?.access_token
        ) {
          document.documentElement.dataset.telegramLinked =
            'false';

          showTemporaryBadge(
            'Telegram ✓',
            'verified',
          );

          return;
        }

        /*
         * Пользователь уже авторизован:
         * привязываем Telegram.
         */
        await linkAnimeBoxAccount(
          session.access_token,
        );
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

        document.documentElement.dataset.telegramLinked =
          'false';

        /*
         * Если упала сама Telegram validation,
         * verified останется false.
         */
        if (
          document.documentElement.dataset
            .telegramVerified !==
          'true'
        ) {
          document.documentElement.dataset.telegramVerified =
            'false';
        }

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

    /*
     * ---------------------------------------------------------
     * 4. Если пользователь авторизуется в AnimeBox
     *    уже ПОСЛЕ открытия Mini App —
     *    пробуем привязать Telegram сразу.
     * ---------------------------------------------------------
     */
    const {
      data: authListener,
    } =
      supabase.auth.onAuthStateChange(
        (event, session) => {
          if (
            event !==
              'SIGNED_IN' ||
            !session?.access_token
          ) {
            return;
          }

          /*
           * Telegram должен уже пройти
           * серверную проверку.
           */
          if (
            document.documentElement.dataset
              .telegramVerified !==
            'true'
          ) {
            return;
          }

          if (
            document.documentElement.dataset
              .telegramLinked ===
            'true'
          ) {
            return;
          }

          void linkAnimeBoxAccount(
            session.access_token,
          ).catch(
            (error) => {
              const rawMessage =
                error instanceof Error
                  ? error.message
                  : 'unknown_error';

              console.error(
                '[Telegram Link after login]',
                error,
              );

              setMessage(
                humanizeError(
                  rawMessage,
                ),
              );

              setStatus('error');
              setShowBadge(true);
            },
          );
        },
      );

    return () => {
      destroyed = true;

      controller.abort();

      authListener.subscription.unsubscribe();

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

  /*
   * Ничего не рисуем во время обычной
   * фоновой проверки.
   */
  if (
    status === 'idle' ||
    status === 'checking' ||
    status === 'linking' ||
    !showBadge
  ) {
    return null;
  }

  const success =
    status === 'verified' ||
    status === 'linked';

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 999999,

        top: 12,
        right: 12,

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

        lineHeight:
          1.3,

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