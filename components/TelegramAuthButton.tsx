'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { notifyAuthChanged } from '@/lib/auth-events';
import { enableTelegramAutoLogin } from '@/lib/telegram-auto-login';

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
      result: TelegramAuthResult,
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

type ApiResponse = {
  ok?: boolean;

  nonce?: string;

  tokenHash?: string;

  created?: boolean;

  error?: string;

  reason?: string;

  profile?: {
    id?: string;
    username?: string | null;
    avatar_path?: string | null;
  };
};

const SCRIPT_ID =
  'animebox-telegram-login';

const SCRIPT_SRC =
  'https://oauth.telegram.org/js/telegram-login.js?3';

/*
 * ---------------------------------------------------------
 * Получаем Telegram Login API из window.
 * ---------------------------------------------------------
 */
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

/*
 * ---------------------------------------------------------
 * Безопасно читаем ответ нашего API.
 *
 * Если Next/Vercel вернул HTML:
 *
 * <!DOCTYPE html>...
 *
 * мы НЕ пытаемся слепо вызвать response.json().
 * ---------------------------------------------------------
 */
async function readJsonResponse(
  response: Response,
): Promise<ApiResponse> {
  const text =
    await response.text();

  if (!text) {
    if (!response.ok) {
      throw new Error(
        `telegram_api_http_${response.status}`,
      );
    }

    return {};
  }

  try {
    return JSON.parse(
      text,
    ) as ApiResponse;
  } catch {
    console.error(
      '[Telegram Auth] API returned non-JSON response:',
      {
        status:
          response.status,

        url:
          response.url,

        contentType:
          response.headers.get(
            'content-type',
          ),

        preview:
          text.slice(
            0,
            250,
          ),
      },
    );

    throw new Error(
      `telegram_api_http_${response.status}`,
    );
  }
}

/*
 * ---------------------------------------------------------
 * Загружаем официальный Telegram Login SDK.
 * ---------------------------------------------------------
 */
function loadTelegramLogin() {
  return new Promise<void>(
    (
      resolve,
      reject,
    ) => {
      /*
       * Уже загружен.
       */
      if (
        getTelegramLogin()
      ) {
        resolve();
        return;
      }

      /*
       * Script уже добавлен,
       * но Telegram.Login ещё инициализируется.
       */
      const existing =
        document.getElementById(
          SCRIPT_ID,
        ) as
          | HTMLScriptElement
          | null;

      if (existing) {
        const startedAt =
          Date.now();

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

                return;
              }

              /*
               * Максимум 5 секунд.
               */
              if (
                Date.now() -
                  startedAt >
                5000
              ) {
                window.clearInterval(
                  check,
                );

                reject(
                  new Error(
                    'telegram_sdk_not_loaded',
                  ),
                );
              }
            },
            50,
          );

        return;
      }

      /*
       * Загружаем Telegram SDK.
       */
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

/*
 * ---------------------------------------------------------
 * Перевод технических ошибок
 * в нормальные пользовательские.
 * ---------------------------------------------------------
 */
function humanizeError(
  error: string,
) {
  if (
    error.startsWith(
      'telegram_api_http_',
    )
  ) {
    const status =
      error.replace(
        'telegram_api_http_',
        '',
      );

    if (
      status === '404'
    ) {
      return 'Telegram API AnimeBox не найден. Проверь новый deployment.';
    }

    if (
      status === '500'
    ) {
      return 'Ошибка Telegram API AnimeBox. Проверь Vercel Logs.';
    }

    return `Telegram API временно недоступен (${status}).`;
  }

  switch (error) {
    case 'telegram_not_configured':
      return 'Вход через Telegram пока не настроен.';

    case 'telegram_nonce_failed':
    case 'telegram_nonce_missing':
      return 'Не удалось начать безопасный вход через Telegram.';

    case 'invalid_telegram_token':
    case 'invalid_telegram_nonce':
      return 'Не удалось подтвердить вход через Telegram.';

    case 'telegram_token_missing':
      return 'Telegram не вернул данные авторизации.';

    case 'telegram_registration_failed':
      return 'Не удалось создать аккаунт через Telegram.';

    case 'profile_creation_failed':
      return 'Не удалось создать профиль AnimeBox.';

    case 'profile_lookup_failed':
      return 'Не удалось проверить профиль AnimeBox.';

    case 'auth_user_not_found':
      return 'Связанный аккаунт AnimeBox не найден.';

    case 'session_token_failed':
    case 'session_token_missing':
      return 'Не удалось создать сессию AnimeBox.';

    case 'supabase_login_failed':
      return 'Не удалось выполнить вход в AnimeBox.';

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
      /*
       * -----------------------------------------------------
       * 1. Проверяем Telegram Client ID.
       * -----------------------------------------------------
       */
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
       * -----------------------------------------------------
       * 2. Получаем одноразовый nonce с backend.
       * -----------------------------------------------------
       */
      const nonceResponse =
        await fetch(
          '/api/auth/telegram/nonce',
          {
            method:
              'POST',

            cache:
              'no-store',

            headers: {
              Accept:
                'application/json',
            },
          },
        );

      const nonceData =
        await readJsonResponse(
          nonceResponse,
        );

      if (
        !nonceResponse.ok
      ) {
        throw new Error(
          nonceData.error ??
            nonceData.reason ??
            `telegram_api_http_${nonceResponse.status}`,
        );
      }

      if (
        !nonceData.ok ||
        typeof nonceData.nonce !==
          'string'
      ) {
        throw new Error(
          nonceData.error ??
            nonceData.reason ??
            'telegram_nonce_failed',
        );
      }

      /*
       * -----------------------------------------------------
       * 3. Загружаем Telegram Login SDK.
       * -----------------------------------------------------
       */
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
       * -----------------------------------------------------
       * 4. Открываем Telegram Login.
       * -----------------------------------------------------
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

              (
                result,
              ) => {
                resolve(
                  result,
                );
              },
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
       * -----------------------------------------------------
       * 5. Отправляем подписанный id_token на backend.
       *
       * Frontend Telegram-профилю не доверяем.
       * Проверку подписи делает сервер.
       * -----------------------------------------------------
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

              Accept:
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
        await readJsonResponse(
          response,
        );

      if (
        !response.ok
      ) {
        throw new Error(
          data.error ??
            data.reason ??
            `telegram_api_http_${response.status}`,
        );
      }

      if (
        !data.ok
      ) {
        throw new Error(
          data.error ??
            data.reason ??
            'telegram_auth_failed',
        );
      }

      if (
        typeof data.tokenHash !==
          'string' ||
        !data.tokenHash
      ) {
        throw new Error(
          'session_token_missing',
        );
      }

      /*
       * -----------------------------------------------------
       * 6. Обмениваем одноразовый Supabase token hash
       *    на нормальную browser session.
       * -----------------------------------------------------
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
        !loginData.session ||
        !loginData.user
      ) {
        console.error(
          '[Telegram Auth] Supabase verifyOtp:',
          loginError,
        );

        throw new Error(
          'supabase_login_failed',
        );
      }

      /*
       * Проверяем, что browser client
       * действительно сохранил session.
       */
      const {
        data:
          sessionData,
      } =
        await supabase
          .auth
          .getSession();

      if (
        !sessionData.session
      ) {
        throw new Error(
          'supabase_login_failed',
        );
      }

      /*
       * -----------------------------------------------------
       * 7. Мгновенно сообщаем всему UI о новой сессии.
       * Navbar / mobile account обновятся ещё до навигации.
       * -----------------------------------------------------
       */
      enableTelegramAutoLogin();

      notifyAuthChanged({
        userId: loginData.user.id,
        profile: data.profile
          ? {
              id: data.profile.id ?? loginData.user.id,
              username: data.profile.username ?? null,
              avatar_path: data.profile.avatar_path ?? null,
            }
          : {
              id: loginData.user.id,
              username:
                (loginData.user.user_metadata?.username as string | undefined) ??
                null,
              avatar_path: null,
            },
      });

      window.location.replace(next);
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