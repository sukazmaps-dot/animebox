const TELEGRAM_SDK_SRC = 'https://telegram.org/js/telegram-web-app.js';
const TELEGRAM_SDK_ID = 'animebox-telegram-webapp-sdk';

let sdkPromise: Promise<TelegramWebApp | null> | null = null;

/**
 * Telegram Mini Apps are opened with tgWebApp* launch parameters in the URL.
 * Checking those parameters lets the normal website avoid downloading the
 * Telegram SDK entirely.
 */
export function hasTelegramMiniAppLaunchParams() {
  if (typeof window === 'undefined') return false;

  const launchParams = `${window.location.search}&${window.location.hash}`;

  return (
    launchParams.includes('tgWebAppData=') ||
    launchParams.includes('tgWebAppVersion=') ||
    launchParams.includes('tgWebAppPlatform=')
  );
}

function getVerifiedTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;

  const telegram = window.Telegram?.WebApp;
  const initData = telegram?.initData?.trim();
  const telegramId = telegram?.initDataUnsafe?.user?.id;

  if (
    !telegram ||
    !initData ||
    !Number.isSafeInteger(telegramId) ||
    Number(telegramId) <= 0
  ) {
    return null;
  }

  return telegram;
}

/**
 * Loads telegram-web-app.js only for a real Mini App launch. The promise is
 * shared so the auth bridge and the subscription gate never inject duplicates.
 */
export function loadTelegramWebApp(): Promise<TelegramWebApp | null> {
  const existing = getVerifiedTelegramWebApp();
  if (existing) return Promise.resolve(existing);

  if (!hasTelegramMiniAppLaunchParams()) {
    return Promise.resolve(null);
  }

  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<TelegramWebApp | null>((resolve, reject) => {
    const finish = () => {
      const telegram = getVerifiedTelegramWebApp();

      if (!telegram) {
        reject(new Error('telegram_sdk_loaded_without_valid_init_data'));
        return;
      }

      resolve(telegram);
    };

    const fail = () => reject(new Error('telegram_sdk_load_failed'));

    const current = document.getElementById(
      TELEGRAM_SDK_ID,
    ) as HTMLScriptElement | null;

    if (current) {
      if (window.Telegram?.WebApp) {
        finish();
        return;
      }

      current.addEventListener('load', finish, { once: true });
      current.addEventListener('error', fail, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = TELEGRAM_SDK_ID;
    script.src = TELEGRAM_SDK_SRC;
    script.async = true;
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', fail, { once: true });

    document.head.appendChild(script);
  }).catch((error) => {
    // Allow a later retry after a transient Telegram/CDN failure.
    sdkPromise = null;
    throw error;
  });

  return sdkPromise;
}

export function getLoadedTelegramWebApp() {
  return getVerifiedTelegramWebApp();
}
