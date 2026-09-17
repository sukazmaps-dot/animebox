'use client';

import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { notifyAuthChanged } from '@/lib/auth-events';
import {
  enableTelegramAutoLogin,
  isTelegramAutoLoginDisabled,
} from '@/lib/telegram-auto-login';

type ApiResponse = {
  ok?: boolean;
  tokenHash?: string;
  created?: boolean;
  linked?: boolean;
  error?: string;
  reason?: string;
  userId?: string;
  profile?: {
    id?: string;
    username?: string | null;
    avatar_path?: string | null;
  };
};

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function humanizeError(value: string) {
  switch (value) {
    case 'telegram_already_linked':
      return 'Этот Telegram уже привязан к другому аккаунту';

    case 'account_has_other_telegram':
      return 'К AnimeBox аккаунту уже привязан другой Telegram';

    case 'invalid_hash':
    case 'invalid_telegram_data':
      return 'Не удалось подтвердить Telegram';

    case 'expired':
      return 'Telegram-сессия устарела. Закрой и открой Mini App заново';

    case 'telegram_registration_failed':
      return 'Не удалось создать аккаунт через Telegram';

    case 'profile_creation_failed':
      return 'Не удалось создать профиль AnimeBox';

    case 'session_token_failed':
    case 'session_token_missing':
      return 'Не удалось создать сессию AnimeBox';

    case 'supabase_login_failed':
      return 'Не удалось войти в AnimeBox';

    case 'telegram_not_configured':
      return 'Telegram-вход временно не настроен';

    default:
      return value || 'Ошибка Telegram';
  }
}

async function readApiResponse(response: Response): Promise<ApiResponse> {
  const text = await response.text();

  if (!text) return {};

  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    console.error('[AnimeBox Telegram] non-JSON API response:', {
      status: response.status,
      url: response.url,
      preview: text.slice(0, 180),
    });

    return {
      ok: false,
      error: `telegram_api_http_${response.status}`,
    };
  }
}

function isAuthScreen(pathname: string) {
  return (
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/auth' ||
    pathname.startsWith('/auth/')
  );
}

export default function TelegramMiniAppBridge() {
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const initData = tg?.initData?.trim();
    const telegramId = tg?.initDataUnsafe?.user?.id;

    // telegram-web-app.js is intentionally loaded on the public website too.
    // Do not treat the existence of the SDK as a Mini App launch.
    if (
      !tg ||
      !initData ||
      !Number.isSafeInteger(telegramId) ||
      Number(telegramId) <= 0
    ) {
      document.documentElement.dataset.telegram = 'false';
      document.documentElement.dataset.telegramVerified = 'false';
      document.documentElement.dataset.telegramAuthenticated = 'false';
      document.documentElement.classList.remove('telegram-mini-app');
      return;
    }

    const telegram = tg;
    const root = document.documentElement;
    const supabase = createClient();
    const controller = new AbortController();

    let destroyed = false;
    let errorTimer: ReturnType<typeof setTimeout> | null = null;

    root.dataset.telegram = 'true';
    root.classList.add('telegram-mini-app');

    const autoLoginDisabled = isTelegramAutoLoginDisabled();
    root.dataset.telegramAutologin = autoLoginDisabled ? 'disabled' : 'enabled';

    telegram.ready();
    telegram.expand();

    try {
      telegram.setHeaderColor?.('#080912');
      telegram.setBackgroundColor?.('#080912');
      telegram.setBottomBarColor?.('#080912');
    } catch (error) {
      console.warn('[AnimeBox Telegram] theme colors:', error);
    }

    try {
      const supportsSwipeControl =
        telegram.isVersionAtLeast?.('7.7') ??
        typeof telegram.disableVerticalSwipes === 'function';

      if (supportsSwipeControl) {
        telegram.disableVerticalSwipes?.();
      }
    } catch (error) {
      console.warn('[AnimeBox Telegram] disableVerticalSwipes:', error);
    }

    try {
      const supportsFullscreen =
        telegram.isVersionAtLeast?.('8.0') ??
        typeof telegram.requestFullscreen === 'function';

      if (
        supportsFullscreen &&
        telegram.requestFullscreen &&
        !telegram.isFullscreen
      ) {
        telegram.requestFullscreen();
      }
    } catch (error) {
      // Old clients can throw even when the method exists in the JS bridge.
      console.warn('[AnimeBox Telegram] requestFullscreen:', error);
      telegram.expand();
    }

    function syncViewportMetrics() {
      const stableHeight = telegram.viewportStableHeight;

      if (Number.isFinite(stableHeight) && stableHeight > 0) {
        root.style.setProperty(
          '--animebox-tg-stable-height',
          `${stableHeight}px`,
        );
      }

      const safeArea = telegram.safeAreaInset;
      const contentSafeArea = telegram.contentSafeAreaInset;

      if (safeArea) {
        root.style.setProperty(
          '--animebox-tg-safe-top',
          `${Math.max(0, safeArea.top || 0)}px`,
        );
        root.style.setProperty(
          '--animebox-tg-safe-bottom',
          `${Math.max(0, safeArea.bottom || 0)}px`,
        );
      }

      if (contentSafeArea) {
        root.style.setProperty(
          '--animebox-tg-content-safe-top',
          `${Math.max(0, contentSafeArea.top || 0)}px`,
        );
        root.style.setProperty(
          '--animebox-tg-content-safe-bottom',
          `${Math.max(0, contentSafeArea.bottom || 0)}px`,
        );
      }

      root.dataset.telegramFullscreen = telegram.isFullscreen
        ? 'true'
        : 'false';
    }

    function handleFullscreenFailed() {
      // requestFullscreen may fail with UNSUPPORTED on older clients/devices.
      // expand() remains the safe fallback.
      telegram.expand();
      syncViewportMetrics();
    }

    syncViewportMetrics();
    telegram.onEvent?.('viewportChanged', syncViewportMetrics);
    telegram.onEvent?.('safeAreaChanged', syncViewportMetrics);
    telegram.onEvent?.('contentSafeAreaChanged', syncViewportMetrics);
    telegram.onEvent?.('fullscreenChanged', syncViewportMetrics);
    telegram.onEvent?.('fullscreenFailed', handleFullscreenFailed);

    function showError(value: string) {
      if (destroyed) return;

      if (errorTimer) clearTimeout(errorTimer);

      setErrorText(humanizeError(value));

      errorTimer = setTimeout(() => {
        if (!destroyed) setErrorText('');
      }, 5000);
    }

    async function requestJson(
      url: string,
      body: object,
    ): Promise<ApiResponse> {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: controller.signal,
      });

      const data = await readApiResponse(response);

      if (!response.ok || !data.ok) {
        throw new ApiError(
          data.reason ?? data.error ?? 'request_failed',
          response.status,
        );
      }

      return data;
    }

    function markAuthenticated(
      userId?: string,
      profile?: ApiResponse['profile'],
    ) {
      enableTelegramAutoLogin();
      root.dataset.telegramAutologin = 'enabled';
      root.dataset.telegramVerified = 'true';
      root.dataset.telegramLinked = 'true';
      root.dataset.telegramAuthenticated = 'true';

      notifyAuthChanged({
        userId,
        profile:
          userId || profile?.id
            ? {
                id: profile?.id ?? userId!,
                username: profile?.username ?? null,
                avatar_path: profile?.avatar_path ?? null,
              }
            : undefined,
      });

      if (isAuthScreen(window.location.pathname)) {
        window.location.replace('/profile');
      }
    }

    async function loginWithToken(data: ApiResponse) {
      if (!data.tokenHash) {
        throw new Error('session_token_missing');
      }

      const {
        data: loginData,
        error,
      } = await supabase.auth.verifyOtp({
        token_hash: data.tokenHash,
        type: 'email',
      });

      if (error || !loginData.session || !loginData.user) {
        console.error('[Telegram Mini App] verifyOtp:', error);
        throw new Error('supabase_login_failed');
      }

      markAuthenticated(loginData.user.id, {
        id: data.profile?.id ?? loginData.user.id,
        username:
          data.profile?.username ??
          ((loginData.user.user_metadata?.username as string | undefined) ??
            null),
        avatar_path: data.profile?.avatar_path ?? null,
      });
    }

    async function getValidatedBrowserSession() {
      const {
        data: { session: storedSession },
      } = await supabase.auth.getSession();

      if (!storedSession) return null;

      let session = storedSession;
      const expiresSoon =
        typeof session.expires_at === 'number' &&
        session.expires_at * 1000 <= Date.now() + 60_000;

      if (expiresSoon) {
        const { data, error } = await supabase.auth.refreshSession();

        if (!error && data.session) {
          session = data.session;
        }
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!user || userError) {
        // A stale local session must not block Telegram auto-login.
        const { data, error } = await supabase.auth.refreshSession();

        if (error || !data.session || !data.user) {
          return null;
        }

        session = data.session;

        return {
          accessToken: session.access_token,
          userId: data.user.id,
        };
      }

      const {
        data: { session: latestSession },
      } = await supabase.auth.getSession();

      session = latestSession ?? session;

      return {
        accessToken: session.access_token,
        userId: user.id,
      };
    }

    async function linkExistingSession(
      accessToken: string,
      userId: string,
    ) {
      const data = await requestJson('/api/telegram/link', {
        initData: telegram.initData,
        accessToken,
      });

      markAuthenticated(userId, data.profile);
    }

    async function tryExistingAnimeBoxSession() {
      const validated = await getValidatedBrowserSession();
      if (!validated) return false;

      try {
        await linkExistingSession(validated.accessToken, validated.userId);
        return true;
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.message === 'invalid_animebox_session'
        ) {
          // Retry exactly once with a newly refreshed Supabase token.
          const { data, error: refreshError } =
            await supabase.auth.refreshSession();

          if (!refreshError && data.session && data.user) {
            try {
              await linkExistingSession(
                data.session.access_token,
                data.user.id,
              );
              return true;
            } catch (retryError) {
              if (
                !(
                  retryError instanceof ApiError &&
                  retryError.message === 'invalid_animebox_session'
                )
              ) {
                throw retryError;
              }
            }
          }

          // Stale/invalid AnimeBox auth is not a Telegram error.
          // Continue below and authenticate using verified Telegram initData.
          return false;
        }

        throw error;
      }
    }

    async function loginExistingTelegram() {
      const data = await requestJson('/api/telegram/session', {
        initData: telegram.initData,
      });

      await loginWithToken(data);
    }

    async function registerTelegramUser() {
      const data = await requestJson('/api/telegram/register', {
        initData: telegram.initData,
      });

      await loginWithToken(data);
    }

    async function initialize() {
      try {
        setErrorText('');

        if (await tryExistingAnimeBoxSession()) {
          return;
        }

        try {
          await loginExistingTelegram();
          return;
        } catch (error) {
          if (
            !(error instanceof ApiError) ||
            error.message !== 'telegram_not_linked'
          ) {
            throw error;
          }
        }

        await registerTelegramUser();
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }

        const raw = error instanceof Error ? error.message : 'unknown_error';

        console.error('[AnimeBox Telegram Mini App]', error);

        root.dataset.telegramAuthenticated = 'false';
        showError(raw);
      }
    }

    if (autoLoginDisabled) {
      root.dataset.telegramVerified = 'false';
      root.dataset.telegramAuthenticated = 'false';
    } else {
      void initialize();
    }

    return () => {
      destroyed = true;
      controller.abort();

      if (errorTimer) clearTimeout(errorTimer);

      telegram.offEvent?.('viewportChanged', syncViewportMetrics);
      telegram.offEvent?.('safeAreaChanged', syncViewportMetrics);
      telegram.offEvent?.('contentSafeAreaChanged', syncViewportMetrics);
      telegram.offEvent?.('fullscreenChanged', syncViewportMetrics);
      telegram.offEvent?.('fullscreenFailed', handleFullscreenFailed);

      try {
        telegram.enableVerticalSwipes?.();
      } catch {
        // Ignore cleanup errors from old Telegram clients.
      }

      root.style.removeProperty('--animebox-tg-stable-height');
      root.style.removeProperty('--animebox-tg-safe-top');
      root.style.removeProperty('--animebox-tg-safe-bottom');
      root.style.removeProperty('--animebox-tg-content-safe-top');
      root.style.removeProperty('--animebox-tg-content-safe-bottom');
      delete root.dataset.telegramFullscreen;
      root.classList.remove('telegram-mini-app');
    };
  }, []);

  if (!errorText) return null;

  return (
    <div className="telegram-mini-app__error" role="status" aria-live="polite">
      {errorText}
    </div>
  );
}
