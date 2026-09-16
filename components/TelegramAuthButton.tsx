'use client';

import {
  useState,
} from 'react';

import {
  createClient,
} from '@/lib/supabase/client';

type TelegramAuthResult = {
  id_token?: string;
  error?: string;
};

type TelegramLoginApi = {
  auth(
    options: {
      client_id: number;
      scope?: string[];
      lang?: string;
      nonce?: string;
    },
    callback: (
      result:
        TelegramAuthResult,
    ) => void,
  ): void;
};

type Props = {
  label?: string;
  next?: string;

  onError?: (
    message: string,
  ) => void;
};

const SCRIPT_ID =
  'animebox-telegram-login';

const SCRIPT_SRC =
  'https://oauth.telegram.org/js/telegram-login.js?3';

function getTelegramLogin():
  | TelegramLoginApi
  | undefined {
  return (
    window as unknown as {
      Telegram?: {
        Login?: TelegramLoginApi;
      };
    }
  ).Telegram?.Login;
}

function loadTelegramLogin() {
  return new Promise<void>(
    (
      resolve,
      reject,
    ) => {
      if (
        getTelegramLogin()
      ) {
        resolve();
        return;
      }

      const existing =
        document.getElementById(
          SCRIPT_ID,
        ) as
          | HTMLScriptElement
          | null;

      if (existing) {
        const check =
          window.setInterval(
            () => {
              if (
                getTelegramLogin()
              ) {
                window.clearInterval(
                  check,
                );

                resolve();
              }
            },
            50,
          );

        window.setTimeout(
          () => {
            window.clearInterval(
              check,
            );

            if (
              getTelegramLogin()
            ) {
              resolve();
            } else {
              reject(
                new Error(
                  'telegram_sdk_not_loaded',
                ),
              );
            }
          },
          5000,
        );

        return;
      }

      const script =
        document.createElement(
          'script',
        );

      script.id =
        SCRIPT_ID;

      script.src =
        SCRIPT_SRC;

      script.async =
        true;

      script.onload =
        () => {
          if (
            getTelegramLogin()
          ) {
            resolve();
          } else {
            reject(
              new Error(
                'telegram_sdk_unavailable',
              ),
            );
          }
        };

      script.onerror =
        () => {
          reject(
            new Error(
              'telegram_sdk_load_failed',
            ),
          );
        };

      document.head.appendChild(
        script,
      );
    },
  );
}

function humanizeError(
  error: string,
) {
  switch (error) {
    case 'telegram_not_configured':
      return 'Вход через Telegram пока не настроен.';

    case 'invalid_telegram_token':
    case 'invalid_telegram_nonce':
      return 'Не удалось подтвердить вход через Telegram.';

    case 'telegram_registration_failed':
      return 'Не удалось создать аккаунт через Telegram.';

    case 'profile_creation_failed':
      return 'Не удалось создать профиль AnimeBox.';

    case 'session_token_failed':
    case 'session_token_missing':
      return 'Не удалось создать сессию AnimeBox.';

    case 'telegram_sdk_load_failed':
    case 'telegram_sdk_not_loaded':
    case 'telegram_sdk_unavailable':
      return 'Не удалось загрузить Telegram Login.';

    default:
      return (
        error ||
        'Ошибка входа через Telegram.'
      );
  }
}

export default function TelegramAuthButton({
  label =
    'Продолжить через Telegram',

  next =
    '/profile',

  onError,
}: Props) {
  const [
    loading,
    setLoading,
  ] =
    useState(false);

  async function login() {
    if (loading) {
      return;
    }

    setLoading(true);

    try {
      const clientIdRaw =
        process.env
          .NEXT_PUBLIC_TELEGRAM_CLIENT_ID;

      const clientId =
        Number(
          clientIdRaw,
        );

      if (
        !Number.isSafeInteger(
          clientId,
        ) ||
        clientId <= 0
      ) {
        throw new Error(
          'telegram_not_configured',
        );
      }

      /*
       * Получаем серверный nonce.
       */
      const nonceResponse =
        await fetch(
          '/api/auth/telegram/nonce',
          {
            method:
              'POST',

            cache:
              'no-store',
          },
        );

      const nonceData =
        await nonceResponse.json();

      if (
        !nonceResponse.ok ||
        !nonceData?.ok ||
        typeof nonceData.nonce !==
          'string'
      ) {
        throw new Error(
          nonceData?.error ??
            'telegram_nonce_failed',
        );
      }

      await loadTelegramLogin();

      const telegramLogin =
        getTelegramLogin();

      if (
        !telegramLogin
      ) {
        throw new Error(
          'telegram_sdk_unavailable',
        );
      }

      /*
       * Telegram popup.
       */
      const result =
        await new Promise<
          TelegramAuthResult
        >(
          (
            resolve,
          ) => {
            telegramLogin.auth(
              {
                client_id:
                  clientId,

                scope: [
                  'profile',
                ],

                lang:
                  'ru',

                nonce:
                  nonceData.nonce,
              },

              resolve,
            );
          },
        );

      if (
        result.error
      ) {
        throw new Error(
          result.error,
        );
      }

      if (
        !result.id_token
      ) {
        throw new Error(
          'telegram_token_missing',
        );
      }

      /*
       * Никогда не доверяем
       * Telegram user объекту
       * из frontend callback.
       *
       * На сервер отправляется
       * подписанный id_token.
       */
      const response =
        await fetch(
          '/api/auth/telegram',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                idToken:
                  result.id_token,
              }),

            cache:
              'no-store',
          },
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data?.ok
      ) {
        throw new Error(
          data?.error ??
            'telegram_auth_failed',
        );
      }

      if (
        typeof data.tokenHash !==
        'string'
      ) {
        throw new Error(
          'session_token_missing',
        );
      }

      /*
       * Создаём обычную
       * Supabase browser session.
       */
      const supabase =
        createClient();

      const {
        data:
          loginData,

        error:
          loginError,
      } =
        await supabase
          .auth
          .verifyOtp({
            token_hash:
              data.tokenHash,

            type:
              'email',
          });

      if (
        loginError ||
        !loginData.session
      ) {
        console.error(
          '[Telegram Auth] verifyOtp:',
          loginError,
        );

        throw new Error(
          'supabase_login_failed',
        );
      }

      window.location.replace(
        next,
      );
    } catch (error) {
      console.error(
        '[Telegram Auth]',
        error,
      );

      const raw =
        error instanceof Error
          ? error.message
          : 'telegram_auth_failed';

      onError?.(
        humanizeError(
          raw,
        ),
      );

      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className="telegram-auth-button"
      onClick={() =>
        void login()
      }
      disabled={loading}
    >
      <span
        className="telegram-auth-button__icon"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="currentColor"
        >
          <path d="M21.944 4.665c.308-1.352-.493-1.883-1.421-1.527L2.948 9.914c-1.2.468-1.182 1.137-.204 1.437l4.507 1.407 10.443-6.588c.493-.3.944-.139.574.19l-8.461 7.638-.326 4.69c.478 0 .689-.218.956-.478l2.294-2.226 4.77 3.523c.879.486 1.51.234 1.729-.814l2.714-12.028z" />
        </svg>
      </span>

      <span>
        {loading
          ? 'Открываем Telegram...'
          : label}
      </span>
    </button>
  );
}